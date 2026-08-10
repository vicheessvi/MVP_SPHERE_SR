"use strict";

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { CredentialVault, parseCredentialText } = require("./runtime/credential-vault");
const { CATALOG, resolveManifest } = require("./runtime/model-catalog");
const { probeDevice, runPlan } = require("./runtime/polling");
const { decryptBuffer, encryptBuffer, getOrCreateMasterKey } = require("./runtime/security");
const { SecureStore } = require("./runtime/secure-store");
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

test("Model catalog routes supplied manufacturers and preserves protocol_required", () => {
  assert(CATALOG.length >= 19);
  const huawei = resolveManifest({ category: "vcs", manufacturerRaw: "Huawey", modelRaw: "TE40" });
  equal(huawei.key, "vcs/huawei");
  assert(huawei.knownModel);
  equal(huawei.protocolStatus, "protocol_required");
  const tlp = resolveManifest({ category: "panel", manufacturerRaw: "Extron", modelRaw: "TLP Pro 725T" });
  equal(tlp.key, "panel/extron");
  assert(tlp.knownModel);
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

test("Target navigation и загрузка соответствуют единственному файловому режиму", () => {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const routes = productCatalog.buildNavigation().map((item) => item.route);
  equal(routes.join(","), "dashboard,vcs,controllers,panels,upload,settings,reference");
  assert(!routes.some((route) => ["projects", "events", "matches", "snapshots"].includes(route)));
  assert(source.includes("PRODUCT_CATALOG.buildNavigation()"));
  assert(source.includes("PRODUCT_CATALOG.buildModuleHelpSection()"));
  assert(source.includes('data-polling-import-form'));
  assert(source.includes('webkitdirectory directory multiple'));
  assert(!source.includes('data-import-credentials'));
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
