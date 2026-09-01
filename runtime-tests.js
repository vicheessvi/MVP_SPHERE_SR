"use strict";

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { CredentialVault, parseCredentialText } = require("./runtime/credential-vault");
const { extractResourceUris, pollExtronDevice } = require("./runtime/extron-web-poller");
const { CATALOG, resolveManifest } = require("./runtime/model-catalog");
const { probeDevice, runPlan } = require("./runtime/polling");
const { decryptBuffer, encryptBuffer, getOrCreateMasterKey } = require("./runtime/security");
const { SecureStore } = require("./runtime/secure-store");
const { execute, formatCaptureFolder, readCredentialImport, resolveOutputDirectory, sanitizeResult } = require("./scripts/poll-devices");
const productCatalog = require("./product-catalog");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(value, message) { if (!value) throw new Error(message || "Assertion failed"); }
function equal(actual, expected, message) { if (actual !== expected) throw new Error(`${message || "Values differ"}: expected ${expected}, got ${actual}`); }

function temporaryDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "mvp-sphere-secure-test-")); }

test("AES-256-GCM envelope скрывает plaintext и проверяет AAD", () => {
  const key = crypto.randomBytes(32);
  const secret = Buffer.from("SYNTHETIC-PASSWORD-DO-NOT-USE");
  const envelope = encryptBuffer(secret, key, "test-object");
  assert(!JSON.stringify(envelope).includes(secret.toString("utf8")));
  equal(decryptBuffer(envelope, key, "test-object").toString("utf8"), secret.toString("utf8"));
  let rejected = false;
  try { decryptBuffer(envelope, key, "other-object"); } catch { rejected = true; }
  assert(rejected, "AAD mismatch must be rejected");
});

test("SecureStore round-trip больше прежних 4 MiB без application quota", () => {
  const directory = temporaryDirectory();
  try {
    const store = new SecureStore({ dataDir: directory, key: crypto.randomBytes(32) });
    const value = JSON.stringify({ payload: "x".repeat(6 * 1024 * 1024) });
    store.writeText("large-state", value);
    equal(store.readText("large-state"), value);
    const diskText = fs.readFileSync(store.pathFor("large-state").target, "utf8");
    assert(!diskText.includes('"payload":"xxx'));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("DPAPI CurrentUser key создаётся и повторно открывается", () => {
  if (process.platform !== "win32") return;
  const directory = temporaryDirectory();
  try {
    const first = getOrCreateMasterKey(directory);
    const second = getOrCreateMasterKey(directory);
    equal(first.toString("hex"), second.toString("hex"));
    assert(!fs.readFileSync(path.join(directory, "master-key.dpapi"), "utf8").includes(first.toString("base64")));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Credential JSON и CSV нормализуются без formula execution", () => {
  const json = parseCredentialText(JSON.stringify({ credentials: [{ IP: "10.1.2.3", "Логин": "admin", "Пароль": "synthetic" }] }), "json");
  const csv = parseCredentialText('IP;Логин;Пароль\n10.1.2.4;"=cmd";"synthetic,pass"\n', "csv");
  equal(json.length, 1);
  equal(csv[0]["логин"], "=cmd");
});

test("Credential vault write-only summary не раскрывает secrets", () => {
  const directory = temporaryDirectory();
  const secret = "SYNTHETIC-VAULT-PASSWORD";
  try {
    const store = new SecureStore({ dataDir: directory, key: crypto.randomBytes(32) });
    const vault = new CredentialVault(store);
    const summary = vault.importText(JSON.stringify([{ ip: "10.1.2.3", username: "operator", password: secret }]), "json");
    equal(summary.recordCount, 1);
    assert(!JSON.stringify(summary).includes(secret));
    const diskText = fs.readFileSync(store.pathFor("credential-vault-v1").target, "utf8");
    assert(!diskText.includes(secret));
    equal(vault.getForIp("10.1.2.3").password, secret);
    let failed = false;
    try { vault.importText(JSON.stringify([{ ip: "10.1.2.3", username: "a", password: "x" }, { ip: "10.1.2.3", username: "b", password: "y" }]), "json"); } catch { failed = true; }
    assert(failed);
    equal(vault.getForIp("10.1.2.3").password, secret, "failed replacement must preserve prior vault");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Credential Excel импортируется локально без выполнения формул", () => {
  const directory = temporaryDirectory();
  try {
    const XLSX = require("./vendor/xlsx.full.min.js");
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet([{ "Тип устройства": "Контроллер", "Производитель": "Extron", "Логин": "synthetic-user", "Пароль": "SYNTHETIC-XLSX-SECRET" }]);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Credentials");
    const filename = path.join(directory, "credentials.xlsx");
    fs.writeFileSync(filename, XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
    const imported = readCredentialImport(filename);
    equal(imported.format, "json");
    const records = parseCredentialText(imported.text, imported.format);
    equal(records.length, 1);
    equal(records[0]["Логин"], "synthetic-user");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Credential vault выбирает IP, затем модель, затем тип и производителя", () => {
  const directory = temporaryDirectory();
  try {
    const store = new SecureStore({ dataDir: directory, key: crypto.randomBytes(32) });
    const vault = new CredentialVault(store);
    vault.importText(JSON.stringify([
      { "Тип устройства": "Контроллер", "Производитель": "Extron", "Логин": "type-user", "Пароль": "TYPE-SECRET" },
      { "Тип устройства": "Контроллер", "Производитель": "Extron", "Модель": "Model A", "Логин": "model-user", "Пароль": "MODEL-SECRET" },
      { IP: "10.1.2.3", "Логин": "ip-user", "Пароль": "IP-SECRET" }
    ]), "json");
    equal(vault.getForDevice({ ip: "10.1.2.3", category: "controller", manufacturer: "Extron", model: "Model A" }).username, "ip-user");
    equal(vault.getForDevice({ ip: "10.1.2.4", category: "controller", manufacturer: "Extron", model: "Model A" }).username, "model-user");
    equal(vault.getForDevice({ ip: "10.1.2.5", category: "controller", manufacturer: "Extron", model: "Model B" }).username, "type-user");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Model catalog routes supplied manufacturers and enables contract-based Extron", () => {
  assert(CATALOG.length >= 19);
  const huawei = resolveManifest({ category: "vcs", manufacturerRaw: "Huawey", modelRaw: "TE40" });
  equal(huawei.key, "vcs/huawei");
  assert(huawei.knownModel);
  equal(huawei.protocolStatus, "protocol_required");
  const tlp = resolveManifest({ category: "panel", manufacturerRaw: "Extron", modelRaw: "TLP Pro 725T" });
  equal(tlp.key, "panel/extron");
  assert(tlp.knownModel);
  equal(tlp.protocolStatus, "supported");
  equal(tlp.transport, "extron_web_dynamic_resources_v1");
  const unknownExtron = resolveManifest({ category: "controller", manufacturerRaw: "Extron", modelRaw: "Future Synthetic Model" });
  assert(!unknownExtron.knownModel);
  equal(unknownExtron.protocolStatus, "supported", "Support must follow the verified web contract, not a model allowlist");
});

test("Polling ping failure имеет exact shape", async () => {
  const result = await probeDevice({ ip: "10.1.2.3", category: "controller", manufacturer: "Extron", model: "IPCP Pro 255" }, { allowedIps: new Set(["10.1.2.3"]), ping: async () => ({ ok: false, durationMs: 4, safeError: "no_ping_response" }) });
  equal(result.failedStage, "ping");
  equal(result.ping.ok, false);
});

test("Polling success без verified protocol fail-closed и не читает credentials", async () => {
  const results = await runPlan({ devices: [{ ip: "10.1.2.3", category: "vcs", manufacturer: "Cisco", model: "Webex Room Kit" }] }, { ping: async () => ({ ok: true, durationMs: 1 }) });
  equal(results[0].failedStage, "adapter");
  equal(results[0].vendorPolling.status, "protocol_required");
  assert(!JSON.stringify(results[0]).toLowerCase().includes("password"));
  let rejected = false;
  try { await probeDevice({ ip: "10.1.2.4" }, { allowedIps: new Set(["10.1.2.3"]), ping: async () => ({ ok: true }) }); } catch { rejected = true; }
  assert(rejected, "non-plan target must be rejected");
});

test("Extron adapter извлекает session-bound URI и делает exact resource GET", async () => {
  const uris = {
    modelName: "/AAAAAAAAAAAAAAAAAAAAAA=",
    serialNumber: "/BBBBBBBBBBBBBBBBBBBBBB=",
    fwVersion: "/CCCCCCCCCCCCCCCCCCCCCC=",
    allLan: "/DDDDDDDDDDDDDDDDDDDDDD=",
    controllerConfig: "/EEEEEEEEEEEEEEEEEEEEEE=",
    connectedDevices: "/FFFFFFFFFFFFFFFFFFFFFF=",
    tlpProject: "/GGGGGGGGGGGGGGGGGGGGGG=",
    date: "/HHHHHHHHHHHHHHHHHHHHHH=",
    uptime: "/IIIIIIIIIIIIIIIIIIIIII=",
    timeZone: "/JJJJJJJJJJJJJJJJJJJJJJ="
  };
  const bundle = `serialNumber: function(){return "${uris.serialNumber}"},this.unitInfo={modelName:"${uris.modelName}",fwVersion:"${uris.fwVersion}",allLan:"${uris.allLan}",controllerConfig:"${uris.controllerConfig}",connectedDevices:"${uris.connectedDevices}",tlpProject:"${uris.tlpProject}",date:"${uris.date}",uptime:"${uris.uptime}",timeZone:"${uris.timeZone}"}`;
  const discovered = extractResourceUris(bundle);
  equal(discovered.resources.modelName, uris.modelName);
  equal(discovered.resources.serialNumber, uris.serialNumber);
  const requests = [];
  const payloads = {
    [uris.modelName]: "Synthetic Extron Controller",
    [uris.serialNumber]: "SERIAL-SYNTHETIC",
    [uris.fwVersion]: "9.99.0000-b001*(Synthetic -Thu, 01 Jan 2026 00:00 UTC)",
    [uris.allLan]: { ipAddress: "10.1.2.3", subnetMask: "255.255.255.0", gateway: "10.1.2.1", macAddress: "00-00-00-00-00-01" },
    [uris.controllerConfig]: { filename: "synthetic.gs", projfilevers: "0.0.303.0", cdate: "01.01.2026 10:00:00", rdate: "02.01.2026 11:00:00", cfgapp: "Extron.Configuration.GS", cfgappvers: "2.22.0.4" },
    [uris.connectedDevices]: [{ addr: "10.1.2.20", modelname: "Synthetic TLP", name: "Panel", partnum: "00-0000-00" }],
    [uris.tlpProject]: { configured: "yes", systemdevs: [] },
    [uris.date]: "Thu, 01 Jan 2026 12:00:00",
    [uris.uptime]: 90061,
    [uris.timeZone]: { id: "UTC", description: "UTC" }
  };
  const result = await pollExtronDevice(
    { ip: "10.1.2.3", allowInsecureTls: true },
    { username: "synthetic-user", password: "SYNTHETIC-SECRET" },
    {
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      request: async (request) => {
        requests.push(request);
        if (request.path.startsWith("/api/login?rnd=")) return { statusCode: 200, headers: { "set-cookie": ["NortxeSession=SYNTHETIC-COOKIE; Secure; HttpOnly"] }, body: "{}" };
        if (request.path === "/www/main.js") return { statusCode: 200, headers: {}, body: bundle };
        const uri = request.path.replace("/api/swis/resource", "");
        return { statusCode: 200, headers: {}, body: JSON.stringify(payloads[uri]) };
      }
    }
  );
  assert(result.ok);
  equal(result.webInterface.insecureTls, true);
  equal(result.webBlocks["Device Info"].Model, "Synthetic Extron Controller");
  equal(result.webBlocks["Device Info"]["Serial Number"], "SERIAL-SYNTHETIC");
  equal(result.webBlocks["Project Info"].Version, "0.0.303");
  equal(result.webBlocks["Project Info"]["Connected Devices"].length, 1);
  equal(result.webBlocks["Device Status"]["Uptime Seconds"], 90061);
  equal(result.webBlocks["LAN Settings"]["MAC Address"], "00-00-00-00-00-01");
  equal(result.webBlocks["LAN Settings"]["IP Address"], "10.1.2.3");
  requests.filter((item) => item.path.startsWith("/api/swis/resource")).forEach((item) => {
    assert(!item.path.includes("?"), `Resource URL must remain exact: ${item.path}`);
    equal(item.headers.Cookie, "NortxeSession=SYNTHETIC-COOKIE");
  });
  const serialized = JSON.stringify(result);
  assert(!serialized.includes("SYNTHETIC-SECRET"));
  assert(!serialized.includes("SYNTHETIC-COOKIE"));
  assert(!serialized.includes("Basic "));
});

test("Extron adapter fail-closed отклоняет неизвестный bundle", async () => {
  const result = await pollExtronDevice(
    { ip: "10.1.2.3" },
    { username: "synthetic-user", password: "SYNTHETIC-SECRET" },
    {
      request: async (request) => request.path.startsWith("/api/login")
        ? { statusCode: 200, headers: { "set-cookie": "NortxeSession=SYNTHETIC" }, body: "" }
        : { statusCode: 200, headers: {}, body: "window.app={unknown:true};" }
    }
  );
  equal(result.safeError, "unsupported_web_contract");
  equal(result.failedStage, "adapter");
});

test("Polling dispatch выдаёт credential только exact Extron IP", async () => {
  const lookedUp = [];
  const result = await probeDevice(
    { ip: "10.1.2.3", category: "controller", manufacturer: "Extron", model: "Unlisted Contract Model" },
    {
      allowedIps: new Set(["10.1.2.3"]),
      ping: async () => ({ ok: true, durationMs: 1 }),
      getCredential: (ip) => { lookedUp.push(ip); return { username: "synthetic", password: "SYNTHETIC" }; },
      extronAdapter: async (device, credential) => ({ ip: device.ipNormalized, ok: true, failedStage: null, successfulCredential: { username: credential.username }, vendorPolling: { status: "supported" }, webBlocks: {} })
    }
  );
  assert(result.ok);
  equal(lookedUp.join(","), "10.1.2.3");
});

test("Polling output использует timestamp folder, atomic per-IP JSON и redaction", async () => {
  const directory = temporaryDirectory();
  try {
    const planPath = path.join(directory, "plan.json");
    fs.writeFileSync(planPath, JSON.stringify({ devices: [{ ip: "10.1.2.3", category: "controller", manufacturer: "Extron" }, { ip: "10.1.2.4", category: "panel", manufacturer: "Extron" }] }));
    const clock = new Date(2026, 7, 31, 19, 41, 28);
    equal(formatCaptureFolder(clock), "2026-08-31_19-41-28");
    const resolved = resolveOutputDirectory(["--plan", planPath, "--output-root", directory], { now: () => clock });
    assert(resolved.endsWith(path.join("2026-08-31_19-41-28")));
    const summary = await execute(["--plan", planPath, "--output-root", directory], {
      now: () => clock,
      secureRoot: path.join(directory, "vault"),
      vault: { getForIp: () => null },
      runPlan: async () => [
        { ip: "10.1.2.3", ok: true, failedStage: null, note: "Basic SYNTHETIC", cookie: "NortxeSession=SYNTHETIC" },
        { ip: "10.1.2.4", ok: false, failedStage: "authorization", password: "SYNTHETIC-SECRET", safeError: "authorization_failed" }
      ]
    });
    equal(summary.total, 2);
    equal(summary.failed, 1);
    const files = fs.readdirSync(summary.outputDir).sort();
    equal(files.join(","), "10.1.2.3.json,10.1.2.4.json");
    const disk = files.map((name) => fs.readFileSync(path.join(summary.outputDir, name), "utf8")).join("\n");
    assert(!disk.includes("SYNTHETIC-SECRET"));
    assert(!disk.includes("NortxeSession="));
    assert(!fs.readdirSync(summary.outputDir).some((name) => name.endsWith(".tmp")));
    const sanitized = sanitizeResult({ headers: { Authorization: "Basic X" }, safe: "ok" });
    equal(JSON.stringify(sanitized), '{"safe":"ok"}');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Manual polling import остаётся доступен вместе с local polling CLI", () => {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const gitignore = fs.readFileSync(path.join(__dirname, ".gitignore"), "utf8");
  assert(source.includes("data-polling-import-form"));
  assert(source.includes("webkitdirectory directory multiple"));
  assert(gitignore.includes("poll-results/"));
});

test("Target navigation и загрузка соответствуют единственному файловому режиму", () => {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const styles = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
  const navigation = productCatalog.buildNavigation();
  const routes = navigation.map((item) => item.route);
  equal(routes.join(","), "dashboard,equipment,upload,settings,reference");
  equal(navigation.find((item) => item.route === "equipment").children.map((item) => item.route).join(","), "vcs,controllers,panels,switches,matrix-switches,scalers,audio-processors");
  assert(!routes.some((route) => ["projects", "events", "matches", "snapshots"].includes(route)));
  assert(source.includes("PRODUCT_CATALOG.buildNavigation()"));
  assert(source.includes("PRODUCT_CATALOG.buildModuleHelpSection()"));
  assert(source.includes('data-polling-import-form'));
  assert(source.includes('webkitdirectory directory multiple'));
  assert(!source.includes('data-import-credentials'));
  assert(source.includes('const initialNavigationState = createNavigationState()'), "Production UI должен использовать проверяемый navigation lifecycle");
  assert(source.includes('reduceNavigationState(ui, navigationAction)'), "Click-handler должен использовать navigation reducer");
  assert(!source.includes('ui.equipmentExpanded || childActive'), "Active child не должен блокировать сворачивание");
  const parentStyle = styles.match(/\.nav-parent\s*\{([^}]*)\}/)?.[1] || "";
  assert(!/font-weight\s*:/.test(parentStyle), "Родитель Оборудование не должен иметь отдельное усиление шрифта");
  const buttonStyle = styles.match(/\.nav-button\s*\{([^}]*)\}/)?.[1] || "";
  assert(/font-weight\s*:\s*400/.test(buttonStyle), "Все верхнеуровневые кнопки должны иметь одинаковое начертание");
  assert(source.includes('${expanded ? "" : " hidden"}>'), "Collapsed navigation должна использовать нативный hidden");
});

test("Прямой index.html использует непостоянный file mode и не показывает удалённые уведомления", () => {
  const index = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const runtimeConfig = fs.readFileSync(path.join(__dirname, "runtime-config.js"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  assert(index.indexOf('src="runtime-config.js"') < index.indexOf('src="app.js"'));
  assert(runtimeConfig.includes('global.location.protocol === "file:"'));
  assert(runtimeConfig.includes("__MVP_FILE_RUNTIME__"));
  assert(!/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/.test(runtimeConfig));
  assert(source.includes('const persistenceStorage = createVolatileStorage()'));
  assert(!source.includes('createSecureRuntimeStorage'));
  assert(!source.includes('secureRuntimeActive'));
  assert(!source.includes('data-import-credentials'));
  assert(source.includes('groupPollingFilesByRunFolder'));
  assert(source.includes('ingestPollingFolderTree'));
  const prohibited = [
    "Защищённый локальный режим · Администратор МЦТП · доступ только с этого компьютера · зашифрованное хранилище Windows",
    "Защищённый локальный анализ",
    "Зашифрованное хранилище · доступ только с этого компьютера",
    "Данные хранятся только на этом компьютере в зашифрованном хранилище. Сетевые обращения разрешены только к явно выбранным IP-адресам оборудования. Учётные данные изолированы и не входят в аналитику или резервные копии."
  ];
  prohibited.forEach((text) => assert(!index.includes(text) && !source.includes(text), `Prohibited notice remains: ${text}`));
});

test("Portable runtime manifest закрепляет официальный Node.js LTS для x64 и ARM64", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "portable-runtime.json"), "utf8"));
  equal(manifest.schemaVersion, 1);
  equal(manifest.runtime, "node");
  equal(manifest.version, "24.19.0");
  equal(manifest.minimumMajor, 24);
  equal(manifest.baseUrl, "https://nodejs.org/download/release/v24.19.0/");
  equal(manifest.artifacts.x64.sha256, "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73");
  equal(manifest.artifacts.arm64.sha256, "8502f4a50b458d4cc38ed8f2001556c2cd239d464920f74017926ccb1e1c157f");
  Object.values(manifest.artifacts).forEach((artifact) => assert(/^[0-9a-f]{64}$/.test(artifact.sha256)));
});

test("Bootstrap не читает рабочие данные, использует только GET и локально разрешает Node", () => {
  const source = fs.readFileSync(path.join(__dirname, "scripts", "ensure-node.ps1"), "utf8");
  const lower = source.toLowerCase();
  assert(source.includes("Invoke-WebRequest"));
  assert(source.includes("-Method Get"));
  assert(!/\-Method\s+(Post|Put|Patch|Delete)/i.test(source));
  assert(!lower.includes("localappdata"));
  assert(!lower.includes("credential-vault"));
  assert(!lower.includes("secure-store"));
  assert(fs.readFileSync(path.join(__dirname, ".gitignore"), "utf8").includes(".runtime/"));

  const resolved = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "scripts", "ensure-node.ps1"), "-ProjectRoot", __dirname, "-NoDownload"], { cwd: __dirname, encoding: "utf8", windowsHide: true });
  equal(resolved.status, 0, resolved.stderr || resolved.stdout);
  assert(/node\.exe/i.test(resolved.stdout));
});

test("Bootstrap fail-closed отклоняет неподдерживаемую архитектуру до загрузки", () => {
  const rejected = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "scripts", "ensure-node.ps1"), "-ProjectRoot", __dirname, "-NoDownload"], {
    cwd: __dirname,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, PROCESSOR_ARCHITEW6432: "", PROCESSOR_ARCHITECTURE: "MIPS" }
  });
  assert(rejected.status !== 0);
  assert(fs.readFileSync(path.join(__dirname, "scripts", "ensure-node.ps1"), "utf8").includes("Архитектура компьютера не поддерживается"));
});

(async () => {
  const results = [];
  for (const item of tests) {
    try { await item.fn(); results.push({ name: item.name, ok: true }); }
    catch (error) { results.push({ name: item.name, ok: false, error: error.stack || String(error) }); }
  }
  results.forEach((result) => process.stdout.write(`${result.ok ? "PASS" : "FAIL"} ${result.name}${result.error ? `\n${result.error}` : ""}\n`));
  const failed = results.filter((result) => !result.ok);
  process.stdout.write(`\n${failed.length ? "FAIL" : "PASS"}: ${results.length - failed.length}/${results.length}\n`);
  if (failed.length) process.exitCode = 1;
})();
