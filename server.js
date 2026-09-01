"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { parseCredentialWorkbook } = require("./runtime/credential-pool");
const { createPollingJob } = require("./runtime/polling-job");
const { assertNoPlanSecrets } = require("./scripts/poll-devices");
const { SecureStore } = require("./runtime/secure-store");
const XLSX = require("./vendor/xlsx.full.min.js");

const HOST = "127.0.0.1";
const requestedPort = Number(process.env.MVP_SPHERE_PORT) || 0;
const dataDir = path.resolve(process.env.MVP_SPHERE_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "MVP_SPHERE_SR"));
const store = new SecureStore({ dataDir });
const launchToken = crypto.randomBytes(32).toString("base64url");
const sessions = new Map();
const jobs = new Map();
let launchUsed = false;

function securityHeaders(response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
}

function send(response, status, body, contentType) {
  securityHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", contentType || "application/json; charset=utf-8");
  response.end(Buffer.isBuffer(body) ? body : String(body ?? ""));
}

function json(response, status, value) { send(response, status, JSON.stringify(value), "application/json; charset=utf-8"); }

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => { const index = part.indexOf("="); return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]; }));
}

function sessionFor(request) {
  const id = parseCookies(request).mvp_sphere_session;
  return id && sessions.get(id) || null;
}

function validHost(request) {
  const host = String(request.headers.host || "").toLowerCase();
  return host === `127.0.0.1:${server.address()?.port}` || host === `localhost:${server.address()?.port}`;
}

function requireSession(request, response, mutation) {
  if (!validHost(request)) { json(response, 403, { error: "invalid_host" }); return null; }
  const session = sessionFor(request);
  if (!session) { json(response, 401, { error: "local_session_required" }); return null; }
  if (mutation) {
    const expectedOrigin = `http://${request.headers.host}`;
    if (request.headers.origin !== expectedOrigin || request.headers["x-mvp-csrf"] !== session.csrfToken) { json(response, 403, { error: "csrf_or_origin_rejected" }); return null; }
  }
  return session;
}

function readBody(request, maximumBytes) {
  const limit = Math.max(1, Number(maximumBytes) || 1024 * 1024);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > limit) {
        const error = Object.assign(new Error("request_too_large"), { code: "REQUEST_TOO_LARGE" });
        reject(error);
        request.resume();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJson(request, maximumBytes) {
  const body = await readBody(request, maximumBytes);
  try { return JSON.parse(body.toString("utf8")); }
  catch { throw Object.assign(new Error("invalid_json"), { code: "INVALID_JSON" }); }
}

function clearSessionCredentials(session) {
  if (Array.isArray(session.credentialPool)) session.credentialPool.splice(0, session.credentialPool.length);
  session.credentialPool = null;
  session.credentialSha256 = null;
  session.credentialSummary = null;
}

function jobForSession(session, jobId) {
  if (!jobId || ![session.activeJobId, session.lastJobId].includes(jobId)) return null;
  return jobs.get(jobId) || null;
}

const PUBLIC_FILES = new Map([
  ["/app.js", [path.join(__dirname, "app.js"), "text/javascript; charset=utf-8"]],
  ["/product-catalog.js", [path.join(__dirname, "product-catalog.js"), "text/javascript; charset=utf-8"]],
  ["/styles.css", [path.join(__dirname, "styles.css"), "text/css; charset=utf-8"]],
  ["/vendor/xlsx.full.min.js", [path.join(__dirname, "vendor", "xlsx.full.min.js"), "text/javascript; charset=utf-8"]],
  ["/runtime/credential-pool.js", [path.join(__dirname, "runtime", "credential-pool.js"), "text/javascript; charset=utf-8"]]
]);

async function handle(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (url.pathname === "/launch" && request.method === "GET") {
      if (!validHost(request) || launchUsed || url.searchParams.get("token") !== launchToken) return json(response, 403, { error: "invalid_or_used_launch_token" });
      launchUsed = true;
      const id = crypto.randomBytes(32).toString("base64url");
      const csrfToken = crypto.randomBytes(32).toString("base64url");
      sessions.set(id, { csrfToken, createdAt: new Date().toISOString(), credentialPool: null, credentialSha256: null, credentialSummary: null, activeJobId: null, lastJobId: null });
      securityHeaders(response);
      response.statusCode = 303;
      response.setHeader("Set-Cookie", `mvp_sphere_session=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Strict`);
      response.setHeader("Location", "/");
      return response.end();
    }

    const session = requireSession(request, response, !["GET", "HEAD"].includes(request.method));
    if (!session) return;

    if (url.pathname === "/api/session" && request.method === "GET") return json(response, 200, { secureRuntime: true, role: "administrator", displayName: "Администратор МЦТП", csrfToken: session.csrfToken });

    if (url.pathname.startsWith("/api/storage/")) {
      const key = decodeURIComponent(url.pathname.slice("/api/storage/".length));
      if (!key || key.includes("credential")) return json(response, 403, { error: "forbidden_object_key" });
      if (request.method === "GET") {
        const value = store.readText(key);
        return value === null ? json(response, 404, { error: "not_found" }) : send(response, 200, value, "application/json; charset=utf-8");
      }
      if (request.method === "PUT") {
        const body = await readBody(request, 64 * 1024 * 1024);
        const result = store.writeBuffer(key, body);
        return json(response, 200, { ok: true, bytes: result.bytes, sha256: result.plaintextSha256 });
      }
      if (request.method === "DELETE") return json(response, 200, { ok: true, deleted: store.delete(key) });
    }

    if (url.pathname === "/api/polling/credentials" && request.method === "POST") {
      const filename = String(request.headers["x-file-name"] || "");
      if (!/\.xlsx$/i.test(filename)) return json(response, 400, { ok: false, error: "credential_file_invalid" });
      if (session.activeJobId) return json(response, 409, { ok: false, error: "job_already_active" });
      const body = await readBody(request, 10 * 1024 * 1024);
      try {
        const parsed = parseCredentialWorkbook(body, XLSX);
        clearSessionCredentials(session);
        session.credentialPool = parsed.credentials.slice();
        session.credentialSha256 = crypto.createHash("sha256").update(body).digest("hex");
        session.credentialSummary = { ...parsed.summary };
        return json(response, 200, { ok: true, summary: session.credentialSummary, sourceSha256: session.credentialSha256 });
      } catch {
        clearSessionCredentials(session);
        return json(response, 400, { ok: false, error: "credential_file_invalid" });
      }
    }
    if (url.pathname === "/api/polling/credentials" && request.method === "DELETE") {
      if (session.activeJobId) return json(response, 409, { ok: false, error: "job_already_active" });
      clearSessionCredentials(session);
      return json(response, 200, { ok: true });
    }

    if (url.pathname === "/api/polling/jobs" && request.method === "POST") {
      if (session.activeJobId) return json(response, 409, { ok: false, error: "job_already_active" });
      if (!session.credentialPool || !session.credentialPool.length) return json(response, 400, { ok: false, error: "credentials_required" });
      const input = await readJson(request, 5 * 1024 * 1024);
      try { assertNoPlanSecrets(input.plan); }
      catch { clearSessionCredentials(session); return json(response, 400, { ok: false, error: "plan_invalid" }); }
      const plan = input.plan;
      if (!plan || plan.schemaVersion !== 2 || !Array.isArray(plan.devices) || !plan.devices.length) { clearSessionCredentials(session); return json(response, 400, { ok: false, error: "plan_invalid" }); }
      if (!/^[0-9a-f]{64}$/i.test(String(plan.authenticationInputSha256 || "")) || String(plan.authenticationInputSha256).toLowerCase() !== session.credentialSha256) {
        clearSessionCredentials(session);
        return json(response, 400, { ok: false, error: "credential_sha_mismatch" });
      }
      if (session.lastJobId) jobs.delete(session.lastJobId);
      let job;
      try {
        job = createPollingJob({
          plan,
          planId: String(input.planId || "") || null,
          credentials: session.credentialPool,
          allowInsecureTls: input.allowInsecureTls === true,
          onTerminal(status) {
            clearSessionCredentials(session);
            session.activeJobId = null;
            session.lastJobId = status.id;
          }
        });
      } catch {
        clearSessionCredentials(session);
        return json(response, 400, { ok: false, error: "plan_invalid" });
      }
      jobs.set(job.id, job);
      session.activeJobId = job.id;
      session.lastJobId = job.id;
      return json(response, 202, { ok: true, jobId: job.id, status: job.status().status });
    }

    const jobRoute = url.pathname.match(/^\/api\/polling\/jobs\/([A-Za-z0-9_-]+)$/);
    if (jobRoute && request.method === "GET") {
      const job = jobForSession(session, jobRoute[1]);
      return job ? json(response, 200, { ok: true, ...job.status() }) : json(response, 404, { ok: false, error: "job_not_found" });
    }
    const cancelRoute = url.pathname.match(/^\/api\/polling\/jobs\/([A-Za-z0-9_-]+)\/cancel$/);
    if (cancelRoute && request.method === "POST") {
      const job = jobForSession(session, cancelRoute[1]);
      return job ? json(response, 200, { ok: true, ...job.cancel() }) : json(response, 404, { ok: false, error: "job_not_found" });
    }

    const pendingRoute = url.pathname.match(/^\/api\/polling\/jobs\/([A-Za-z0-9_-]+)\/result$/);
    if (pendingRoute && request.method === "GET") {
      const job = jobForSession(session, pendingRoute[1]);
      if (!job) return json(response, 404, { ok: false, error: "job_not_found" });
      const pending = job.result();
      if (!pending) { securityHeaders(response); response.statusCode = 204; return response.end(); }
      return json(response, 200, { ok: true, ...pending });
    }

    const ackRoute = url.pathname.match(/^\/api\/polling\/jobs\/([A-Za-z0-9_-]+)\/result\/([A-Za-z0-9_-]+)\/ack$/);
    if (ackRoute && request.method === "POST") {
      const job = jobForSession(session, ackRoute[1]);
      if (!job) return json(response, 404, { ok: false, error: "job_not_found" });
      const input = await readJson(request, 1024);
      if (typeof input.saved !== "boolean" || !job.acknowledge(ackRoute[2], input.saved)) return json(response, 409, { ok: false, error: "result_ack_rejected" });
      return json(response, 200, { ok: true, status: job.status().status });
    }

    if (url.pathname === "/runtime-config.js" && request.method === "GET") return send(response, 200, `globalThis.__MVP_SECURE_RUNTIME__=true;globalThis.__MVP_CSRF__=${JSON.stringify(session.csrfToken)};`, "text/javascript; charset=utf-8");

    if (url.pathname === "/" && request.method === "GET") {
      const index = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
      return send(response, 200, index, "text/html; charset=utf-8");
    }

    if (PUBLIC_FILES.has(url.pathname) && request.method === "GET") {
      const [file, type] = PUBLIC_FILES.get(url.pathname);
      return send(response, 200, fs.readFileSync(file), type);
    }
    return json(response, 404, { error: "not_found" });
  } catch (error) {
    const status = error && error.code === "REQUEST_TOO_LARGE" ? 413 : error && error.code === "INVALID_JSON" ? 400 : 500;
    return json(response, status, { error: status === 413 ? "request_too_large" : status === 400 ? "invalid_json" : "local_runtime_error", safeMessage: error.code === "ENOSPC" ? "Недостаточно места на диске" : "Локальная операция не выполнена" });
  }
}

const server = http.createServer(handle);
server.listen(requestedPort, HOST, () => {
  const port = server.address().port;
  const launchUrl = `http://${HOST}:${port}/launch?token=${launchToken}`;
  process.stdout.write(`MVP_SPHERE_SR local runtime: http://${HOST}:${port}\nData directory: ${dataDir}\n`);
  if (process.env.MVP_NO_BROWSER !== "1") {
    const opener = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", launchUrl], { detached: true, stdio: "ignore", windowsHide: true });
    opener.unref();
  } else process.stdout.write(`Launch URL: ${launchUrl}\n`);
});

function close() { return new Promise((resolve) => server.close(resolve)); }
module.exports = { clearSessionCredentials, close, dataDir, jobForSession, readBody, server };
