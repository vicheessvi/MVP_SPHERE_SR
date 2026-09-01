"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mvp-sphere-server-test-"));
  const child = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd: __dirname, env: { ...process.env, MVP_NO_BROWSER: "1", MVP_SPHERE_DATA_DIR: dataDir, MVP_SPHERE_PORT: "0" }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let errors = "";
  child.stderr.on("data", (chunk) => { errors += chunk.toString("utf8"); });
  const launchUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server launch timeout")), 20000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      const match = output.match(/Launch URL: (http:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${errors}`)); });
  });
  try {
    const launch = await fetch(launchUrl, { redirect: "manual" });
    if (launch.status !== 303) throw new Error(`Launch status ${launch.status}`);
    const cookie = String(launch.headers.get("set-cookie") || "").split(";", 1)[0];
    if (!cookie) throw new Error("Session cookie missing");
    const base = new URL(launchUrl).origin;
    const sessionResponse = await fetch(`${base}/api/session`, { headers: { Cookie: cookie } });
    const session = await sessionResponse.json();
    if (!session.secureRuntime || !session.csrfToken) throw new Error("Secure session missing");
    const catalogResponse = await fetch(`${base}/product-catalog.js`, { headers: { Cookie: cookie } });
    const catalogSource = await catalogResponse.text();
    if (!catalogResponse.ok || !catalogSource.includes("MODULE_CATALOG") || !catalogSource.includes("validateProductCatalog")) throw new Error("Product catalog was not served from authenticated loopback origin");
    const runtimeConfigResponse = await fetch(`${base}/runtime-config.js`, { headers: { Cookie: cookie } });
    const runtimeConfigSource = await runtimeConfigResponse.text();
    if (!runtimeConfigResponse.ok || !runtimeConfigSource.includes("__MVP_SECURE_RUNTIME__=true") || !runtimeConfigSource.includes(session.csrfToken) || runtimeConfigSource.includes("__MVP_FILE_RUNTIME__")) throw new Error("Dynamic secure runtime config contract failed");
    const state = JSON.stringify({ version: 3, synthetic: "x".repeat(5 * 1024 * 1024) });
    const put = await fetch(`${base}/api/storage/integration-state`, { method: "PUT", headers: { Cookie: cookie, Origin: base, "X-MVP-CSRF": session.csrfToken, "Content-Type": "application/json" }, body: state });
    if (!put.ok) throw new Error(`Storage PUT ${put.status}`);
    const get = await fetch(`${base}/api/storage/integration-state`, { headers: { Cookie: cookie } });
    if (await get.text() !== state) throw new Error("Storage round-trip mismatch");
    const secret = "SYNTHETIC-SERVER-SECRET";
    const XLSX = require("./vendor/xlsx.full.min.js");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ "Логин": "synthetic-user", "Пароль": secret }]), "Credentials");
    const credentialBytes = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const credentialSha256 = crypto.createHash("sha256").update(credentialBytes).digest("hex");
    const credentials = await fetch(`${base}/api/polling/credentials`, { method: "POST", headers: { Cookie: cookie, Origin: base, "X-MVP-CSRF": session.csrfToken, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "X-File-Name": "synthetic.xlsx" }, body: credentialBytes });
    const credentialResult = await credentials.json();
    if (!credentials.ok || JSON.stringify(credentialResult).includes(secret)) throw new Error("Credential import leaked or failed");
    if (credentialResult.sourceSha256 !== credentialSha256 || credentialResult.summary.acceptedCount !== 1) throw new Error("Credential fingerprint contract failed");
    const plan = { schemaVersion: 2, scheduledAt: new Date(0).toISOString(), intervalSeconds: 0, authenticationInputSha256: credentialSha256, devices: [{ ip: "192.0.2.20", category: "controller", manufacturer: "Extron", model: "Synthetic", pollingSupported: false }] };
    const startedResponse = await fetch(`${base}/api/polling/jobs`, { method: "POST", headers: { Cookie: cookie, Origin: base, "X-MVP-CSRF": session.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ planId: "synthetic-plan", plan, allowInsecureTls: true }) });
    const started = await startedResponse.json();
    if (startedResponse.status !== 202 || !started.jobId) throw new Error(`Polling job was not created: ${JSON.stringify(started)}`);
    let jobStatus;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const statusResponse = await fetch(`${base}/api/polling/jobs/${started.jobId}`, { headers: { Cookie: cookie } });
      jobStatus = await statusResponse.json();
      if (jobStatus.pendingResult) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (!jobStatus?.pendingResult || JSON.stringify(jobStatus).includes(secret)) throw new Error("Polling job did not wait for safe result ACK");
    const pendingResponse = await fetch(`${base}/api/polling/jobs/${started.jobId}/result`, { headers: { Cookie: cookie } });
    const pending = await pendingResponse.json();
    if (!pendingResponse.ok || JSON.stringify(pending).includes(secret) || pending.filename !== "192.0.2.20.json") throw new Error("Pending result contract failed");
    const ack = await fetch(`${base}/api/polling/jobs/${started.jobId}/result/${pending.resultId}/ack`, { method: "POST", headers: { Cookie: cookie, Origin: base, "X-MVP-CSRF": session.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ saved: true }) });
    if (!ack.ok) throw new Error("Result ACK failed");
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const statusResponse = await fetch(`${base}/api/polling/jobs/${started.jobId}`, { headers: { Cookie: cookie } });
      jobStatus = await statusResponse.json();
      if (jobStatus.status === "completed") break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (jobStatus.status !== "completed" || jobStatus.processed !== 1 || jobStatus.unsupported !== 1) throw new Error("Polling job did not complete after ACK");
    const noCredentialFallback = await fetch(`${base}/api/polling/jobs`, { method: "POST", headers: { Cookie: cookie, Origin: base, "X-MVP-CSRF": session.csrfToken, "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
    if (noCredentialFallback.status !== 400 || (await noCredentialFallback.json()).error !== "credentials_required") throw new Error("Credential pool was not cleared after job");
    const csrfRejected = await fetch(`${base}/api/storage/rejected`, { method: "PUT", headers: { Cookie: cookie, Origin: "http://evil.invalid", "X-MVP-CSRF": session.csrfToken }, body: "{}" });
    if (csrfRejected.status !== 403) throw new Error("Cross-origin mutation was not rejected");
    const persistedText = fs.readdirSync(path.join(dataDir, "objects")).map((name) => fs.readFileSync(path.join(dataDir, "objects", name), "utf8")).join("\n");
    if (persistedText.includes(secret) || persistedText.includes('"synthetic":"xxx')) throw new Error("Plaintext persisted");
    process.stdout.write("PASS local runtime session, CSRF, encrypted state and polling result ACK\n\nPASS: 1/1\n");
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => { process.stderr.write(`FAIL ${error.stack || error}\n\nFAIL: 0/1\n`); process.exitCode = 1; });
