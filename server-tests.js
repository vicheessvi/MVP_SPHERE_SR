"use strict";

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
    const state = JSON.stringify({ version: 3, synthetic: "x".repeat(5 * 1024 * 1024) });
    const put = await fetch(`${base}/api/storage/integration-state`, { method: "PUT", headers: { Cookie: cookie, Origin: base, "X-MVP-CSRF": session.csrfToken, "Content-Type": "application/json" }, body: state });
    if (!put.ok) throw new Error(`Storage PUT ${put.status}`);
    const get = await fetch(`${base}/api/storage/integration-state`, { headers: { Cookie: cookie } });
    if (await get.text() !== state) throw new Error("Storage round-trip mismatch");
    const secret = "SYNTHETIC-SERVER-SECRET";
    const credentials = await fetch(`${base}/api/credentials/import?format=json`, { method: "POST", headers: { Cookie: cookie, Origin: base, "X-MVP-CSRF": session.csrfToken, "Content-Type": "text/plain" }, body: JSON.stringify([{ ip: "10.9.8.7", login: "admin", password: secret }]) });
    const credentialResult = await credentials.json();
    if (!credentials.ok || JSON.stringify(credentialResult).includes(secret)) throw new Error("Credential import leaked or failed");
    const forbidden = await fetch(`${base}/api/storage/credential-vault-v1`, { headers: { Cookie: cookie } });
    if (forbidden.status !== 403) throw new Error("Vault read endpoint was not blocked");
    const csrfRejected = await fetch(`${base}/api/storage/rejected`, { method: "PUT", headers: { Cookie: cookie, Origin: "http://evil.invalid", "X-MVP-CSRF": session.csrfToken }, body: "{}" });
    if (csrfRejected.status !== 403) throw new Error("Cross-origin mutation was not rejected");
    const persistedText = fs.readdirSync(path.join(dataDir, "objects")).map((name) => fs.readFileSync(path.join(dataDir, "objects", name), "utf8")).join("\n");
    if (persistedText.includes(secret) || persistedText.includes('"synthetic":"xxx')) throw new Error("Plaintext persisted");
    process.stdout.write("PASS local runtime session, CSRF, encrypted >4 MiB state and write-only vault\n\nPASS: 1/1\n");
  } finally {
    child.kill();
    await new Promise((resolve) => child.once("exit", resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((error) => { process.stderr.write(`FAIL ${error.stack || error}\n\nFAIL: 0/1\n`); process.exitCode = 1; });
