"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { CredentialVault } = require("./runtime/credential-vault");
const { SecureStore } = require("./runtime/secure-store");

const HOST = "127.0.0.1";
const requestedPort = Number(process.env.MVP_SPHERE_PORT) || 0;
const dataDir = path.resolve(process.env.MVP_SPHERE_DATA_DIR || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "MVP_SPHERE_SR"));
const store = new SecureStore({ dataDir });
const vault = new CredentialVault(store);
const launchToken = crypto.randomBytes(32).toString("base64url");
const sessions = new Map();
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

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

const PUBLIC_FILES = new Map([
  ["/app.js", [path.join(__dirname, "app.js"), "text/javascript; charset=utf-8"]],
  ["/product-catalog.js", [path.join(__dirname, "product-catalog.js"), "text/javascript; charset=utf-8"]],
  ["/styles.css", [path.join(__dirname, "styles.css"), "text/css; charset=utf-8"]],
  ["/vendor/xlsx.full.min.js", [path.join(__dirname, "vendor", "xlsx.full.min.js"), "text/javascript; charset=utf-8"]]
]);

async function handle(request, response) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (url.pathname === "/launch" && request.method === "GET") {
      if (!validHost(request) || launchUsed || url.searchParams.get("token") !== launchToken) return json(response, 403, { error: "invalid_or_used_launch_token" });
      launchUsed = true;
      const id = crypto.randomBytes(32).toString("base64url");
      const csrfToken = crypto.randomBytes(32).toString("base64url");
      sessions.set(id, { csrfToken, createdAt: new Date().toISOString() });
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
        const body = await readBody(request);
        const result = store.writeBuffer(key, body);
        return json(response, 200, { ok: true, bytes: result.bytes, sha256: result.plaintextSha256 });
      }
      if (request.method === "DELETE") return json(response, 200, { ok: true, deleted: store.delete(key) });
    }

    if (url.pathname === "/api/credentials/import" && request.method === "POST") {
      const body = await readBody(request);
      const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
      try { return json(response, 200, { ok: true, summary: vault.importText(body.toString("utf8"), format) }); }
      catch (error) { return json(response, 400, { ok: false, error: error.message || "credential_import_failed" }); }
    }

    if (url.pathname === "/api/credentials/summary" && request.method === "GET") return json(response, 200, { ok: true, summary: vault.summary() });

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
    return json(response, 500, { error: "local_runtime_error", safeMessage: error.code === "ENOSPC" ? "Недостаточно места на диске" : "Локальная операция не выполнена" });
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
module.exports = { close, dataDir, server };
