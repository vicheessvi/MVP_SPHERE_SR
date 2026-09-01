"use strict";

const crypto = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { CredentialVault, parseCredentialText } = require("./runtime/credential-vault");
const { parseCredentialRows, parseCredentialWorkbook } = require("./runtime/credential-pool");
const { extractResourceUris, pollExtronDevice } = require("./runtime/extron-web-poller");
const { CATALOG, resolveManifest } = require("./runtime/model-catalog");
const { probeDevice, runPlan } = require("./runtime/polling");
const { createPollingJob } = require("./runtime/polling-job");
const { decryptBuffer, encryptBuffer, getOrCreateMasterKey } = require("./runtime/security");
const { SecureStore } = require("./runtime/secure-store");
const { execute, formatCaptureFolder, readCredentialImport, resolveOutputDirectory, sanitizeResult } = require("./scripts/poll-devices");
const productCatalog = require("./product-catalog");

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
function assert(value, message) { if (!value) throw new Error(message || "Assertion failed"); }
function equal(actual, expected, message) { if (actual !== expected) throw new Error(`${message || "Values differ"}: expected ${expected}, got ${actual}`); }

function temporaryDirectory() { return fs.mkdtempSync(path.join(os.tmpdir(), "mvp-sphere-secure-test-")); }

function writeCredentialWorkbook(directory, rows) {
  const XLSX = require("./vendor/xlsx.full.min.js");
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows || [{ "Логин": "synthetic-user", "Пароль": "SYNTHETIC-XLSX-SECRET" }]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Credentials");
  const filename = path.join(directory, "credentials.xlsx");
  fs.writeFileSync(filename, XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }));
  return filename;
}

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
    const filename = writeCredentialWorkbook(directory, [{ "Логин": "synthetic-user", "Пароль": "SYNTHETIC-XLSX-SECRET" }, { "Логин": "synthetic-user", "Пароль": "SYNTHETIC-XLSX-SECRET" }, { "Логин": "", "Пароль": "missing-login" }]);
    const imported = readCredentialImport(filename);
    equal(imported.credentials.length, 1);
    equal(imported.summary.duplicateCount, 1);
    equal(imported.summary.rejectedCount, 1);
    assert(/^[0-9a-f]{64}$/.test(imported.sourceSha256));
    assert(!JSON.stringify(imported.summary).includes("SYNTHETIC-XLSX-SECRET"));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Credential pool требует Логин и Пароль и изолирует некорректные строки", () => {
  const parsed = parseCredentialRows([["Логин", "Пароль"], ["user-1", "secret-1"], ["", "secret-2"], ["user-1", "secret-1"], ["", ""]]);
  equal(parsed.credentials.length, 1);
  equal(parsed.summary.rejectedCount, 1);
  equal(parsed.summary.duplicateCount, 1);
  equal(parsed.summary.emptyRowCount, 1);
  let rejected = false;
  try { parseCredentialRows([["Логин"], ["user"]]); } catch { rejected = true; }
  assert(rejected);
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
  let pingCalls = 0;
  const results = await runPlan({ devices: [{ ip: "10.1.2.3", category: "vcs", manufacturer: "Cisco", model: "Webex Room Kit" }] }, { ping: async () => { pingCalls += 1; return { ok: true, durationMs: 1 }; } });
  equal(results[0].failedStage, "adapter");
  equal(results[0].vendorPolling.status, "protocol_required");
  equal(pingCalls, 0, "Unsupported device must not be pinged");
  assert(!JSON.stringify(results[0]).toLowerCase().includes("password"));
  let rejected = false;
  try { await probeDevice({ ip: "10.1.2.4" }, { allowedIps: new Set(["10.1.2.3"]), ping: async () => ({ ok: true }) }); } catch { rejected = true; }
  assert(rejected, "non-plan target must be rejected");
});

test("Polling interval начинается после сохранения и отсутствует после последнего устройства", async () => {
  const events = [];
  const plan = { intervalSeconds: 7, devices: [
    { ip: "10.1.2.3", category: "controller", manufacturer: "Extron" },
    { ip: "10.1.2.4", category: "panel", manufacturer: "Extron" }
  ] };
  const results = await runPlan(plan, {
    ping: async (ip) => ({ ok: true, durationMs: 1 }),
    getCredentials: () => [{ username: "synthetic", password: "SYNTHETIC" }],
    extronAdapter: async (device) => { events.push(`poll:${device.ipNormalized}`); return { ip: device.ipNormalized, ok: true, failedStage: null, vendorPolling: { status: "supported" }, webBlocks: {} }; },
    onResult: async (result) => { events.push(`save:${result.ip}`); },
    wait: async (milliseconds) => { events.push(`wait:${milliseconds}`); }
  });
  equal(results.length, 2);
  equal(events.join(","), "poll:10.1.2.3,save:10.1.2.3,wait:7000,poll:10.1.2.4,save:10.1.2.4");
});

test("Дата начала ожидается до первого устройства отдельно от межустройственного интервала", async () => {
  const events = [];
  await runPlan({ scheduledAt: "2026-09-01T10:00:01.000Z", intervalSeconds: 0, devices: [{ ip: "10.1.2.3", category: "controller", manufacturer: "Extron" }] }, {
    honorSchedule: true,
    nowMs: () => new Date("2026-09-01T10:00:00.000Z").getTime(),
    wait: async (milliseconds) => { events.push(`schedule:${milliseconds}`); },
    ping: async () => ({ ok: true, durationMs: 1 }),
    getCredentials: () => [{ username: "synthetic", password: "SYNTHETIC" }],
    extronAdapter: async (device) => { events.push(`poll:${device.ipNormalized}`); return { ip: device.ipNormalized, ok: true, vendorPolling: { status: "supported" } }; },
    onResult: async () => { events.push("save"); }
  });
  equal(events.join(","), "schedule:1000,poll:10.1.2.3,save");
});

test("Ошибка сохранения останавливает batch до следующего устройства", async () => {
  const polled = [];
  let failed = false;
  try {
    await runPlan({ intervalSeconds: 0, devices: [
      { ip: "10.1.2.3", category: "controller", manufacturer: "Extron" },
      { ip: "10.1.2.4", category: "controller", manufacturer: "Extron" }
    ] }, {
      ping: async () => ({ ok: true, durationMs: 1 }),
      getCredentials: () => [{ username: "synthetic", password: "SYNTHETIC" }],
      extronAdapter: async (device) => { polled.push(device.ipNormalized); return { ip: device.ipNormalized, ok: true, vendorPolling: { status: "supported" } }; },
      onResult: async () => { throw new Error("synthetic_save_failure"); }
    });
  } catch (error) { failed = error.message === "synthetic_save_failure"; }
  assert(failed);
  equal(polled.join(","), "10.1.2.3");
});

test("Отмена прерывает ожидание интервала", async () => {
  const abortController = new AbortController();
  let cancelled = false;
  try {
    await runPlan({ intervalSeconds: 5, devices: [
      { ip: "10.1.2.3", category: "controller", manufacturer: "Extron" },
      { ip: "10.1.2.4", category: "controller", manufacturer: "Extron" }
    ] }, {
      signal: abortController.signal,
      ping: async () => ({ ok: true, durationMs: 1 }),
      getCredentials: () => [{ username: "synthetic", password: "SYNTHETIC" }],
      extronAdapter: async (device) => ({ ip: device.ipNormalized, ok: true, vendorPolling: { status: "supported" } }),
      onResult: async () => {},
      wait: async (_milliseconds, signal) => { abortController.abort(); if (signal.aborted) throw Object.assign(new Error("Polling cancelled"), { code: "POLLING_CANCELLED" }); }
    });
  } catch (error) { cancelled = error.code === "POLLING_CANCELLED"; }
  assert(cancelled);
});

test("Extron перебирает общий credential pool без записи логинов в результат", async () => {
  let attempts = 0;
  const result = await pollExtronDevice({ ip: "10.1.2.3" }, [
    { username: "first-user", password: "FIRST-SECRET" },
    { username: "second-user", password: "SECOND-SECRET" }
  ], {
    request: async (request) => {
      if (request.path.startsWith("/api/login")) {
        attempts += 1;
        return attempts === 1 ? { statusCode: 401, headers: {}, body: "" } : { statusCode: 200, headers: { "set-cookie": "NortxeSession=SYNTHETIC" }, body: "" };
      }
      return { statusCode: 200, headers: {}, body: "window.app={unknown:true};" };
    }
  });
  equal(result.credentialAttempts, 2);
  assert(!JSON.stringify(result).includes("first-user"));
  assert(!JSON.stringify(result).includes("second-user"));
  assert(!JSON.stringify(result).includes("SECRET"));
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
    const credentialPath = writeCredentialWorkbook(directory);
    const clock = new Date(2026, 7, 31, 19, 41, 28);
    equal(formatCaptureFolder(clock), "2026-08-31_19-41-28");
    const resolved = resolveOutputDirectory(["--plan", planPath, "--output-root", directory], { now: () => clock });
    assert(resolved.endsWith(path.join("2026-08-31_19-41-28")));
    const summary = await execute(["--plan", planPath, "--credentials", credentialPath, "--output-root", directory], {
      now: () => clock,
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
    const sanitized = sanitizeResult({ headers: { Authorization: "Basic X" }, username: "hidden", successfulCredential: { username: "hidden" }, safe: "ok" });
    equal(JSON.stringify(sanitized), '{"safe":"ok"}');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Automatic CLI требует текущий XLSX и явный output root", async () => {
  const directory = temporaryDirectory();
  try {
    const planPath = path.join(directory, "plan.json");
    fs.writeFileSync(planPath, JSON.stringify({ devices: [{ ip: "10.1.2.3", category: "controller", manufacturer: "Extron" }] }));
    let credentialsRejected = false;
    try { await execute(["--plan", planPath, "--output-root", directory]); } catch (error) { credentialsRejected = /XLSX is required/.test(error.message); }
    assert(credentialsRejected);
    const credentialPath = writeCredentialWorkbook(directory);
    let outputRejected = false;
    try { await execute(["--plan", planPath, "--credentials", credentialPath]); } catch (error) { outputRejected = /Output directory is required/.test(error.message); }
    assert(outputRejected);
    fs.writeFileSync(planPath, JSON.stringify({ authenticationInputSha256: "0".repeat(64), devices: [{ ip: "10.1.2.3", category: "controller", manufacturer: "Extron" }] }));
    let fingerprintRejected = false;
    try { await execute(["--plan", planPath, "--credentials", credentialPath, "--output-root", directory]); } catch (error) { fingerprintRejected = /does not match/.test(error.message); }
    assert(fingerprintRejected);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Ошибка основной записи создаёт локальную recovery-копию и останавливает запуск", async () => {
  const directory = temporaryDirectory();
  try {
    const planPath = path.join(directory, "plan.json");
    const credentialPath = writeCredentialWorkbook(directory);
    const recoveryRoot = path.join(directory, "recovery");
    fs.writeFileSync(planPath, JSON.stringify({ devices: [{ ip: "10.1.2.3", category: "controller", manufacturer: "Extron" }] }));
    let recovered = false;
    try {
      await execute(["--plan", planPath, "--credentials", credentialPath, "--output-root", path.join(directory, "output")], {
        recoveryRoot,
        writeJson(target, value) {
          if (!target.startsWith(recoveryRoot)) throw new Error("synthetic_primary_write_failure");
          fs.writeFileSync(target, JSON.stringify(value), "utf8");
        },
        runPlan: async (plan, options) => {
          const result = { ip: plan.devices[0].ip, ok: true, vendorPolling: { status: "supported" } };
          await options.onResult(result, { index: 0, total: 1, device: plan.devices[0] });
          return [result];
        }
      });
    } catch (error) { recovered = error.code === "RESULT_SAVE_FAILED_RECOVERED"; }
    assert(recovered);
    const recoveryFiles = fs.readdirSync(path.join(recoveryRoot, fs.readdirSync(recoveryRoot)[0]));
    equal(recoveryFiles.join(","), "10.1.2.3.json");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("Loopback job ждёт подтверждения записи до завершения результата", async () => {
  const secret = "SYNTHETIC-JOB-SECRET";
  let advancedAfterResult = false;
  const job = createPollingJob({
    plan: { schemaVersion: 2, scheduledAt: new Date(0).toISOString(), intervalSeconds: 0, devices: [{ ip: "192.0.2.10", category: "controller", manufacturer: "Extron", pollingSupported: false }] },
    credentials: [{ username: "synthetic-user", password: secret }],
    runPlan: async (plan, options) => {
      const result = { ip: plan.devices[0].ip, ok: false, networkAttempted: false, safeError: "verified_protocol_contract_required" };
      await options.onResult(result, { index: 0, total: 1, device: plan.devices[0] });
      advancedAfterResult = true;
      options.onProgress({ stage: "processed", index: 1, total: 1, result });
      return [result];
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  equal(job.status().status, "waiting_for_save");
  assert(!advancedAfterResult, "Job продолжил выполнение до ACK записи");
  const pending = job.result();
  assert(pending && pending.filename === "192.0.2.10.json");
  assert(!JSON.stringify(pending).includes(secret));
  assert(job.acknowledge(pending.resultId, true));
  const completed = await job.done;
  equal(completed.status, "completed");
  assert(advancedAfterResult);
  equal(completed.processed, 1);
  equal(completed.unsupported, 1);
});

test("Loopback job отменяет отложенный запуск без обращения к устройству", async () => {
  let executed = false;
  const job = createPollingJob({
    plan: { schemaVersion: 2, scheduledAt: new Date(Date.now() + 60000).toISOString(), intervalSeconds: 0, devices: [{ ip: "192.0.2.11", category: "controller", manufacturer: "Extron" }] },
    credentials: [{ username: "synthetic-user", password: "SYNTHETIC-CANCEL-SECRET" }],
    runPlan: async () => { executed = true; return []; }
  });
  job.cancel();
  const cancelled = await job.done;
  equal(cancelled.status, "cancelled");
  assert(!executed, "Polling был запущен после отмены schedule");
});

test("Manual polling import остаётся доступен вместе с local polling CLI", () => {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const gitignore = fs.readFileSync(path.join(__dirname, ".gitignore"), "utf8");
  assert(source.includes("data-polling-import-form"));
  assert(source.includes("webkitdirectory directory multiple"));
  assert(gitignore.includes("poll-results/"));
});

test("Target navigation и загрузка сохраняют ручной file-mode и loopback automatic-mode", () => {
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

test("Прямой index.html остаётся непостоянным ручным режимом и не показывает удалённые уведомления", () => {
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
