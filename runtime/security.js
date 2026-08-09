"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ENVELOPE_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const ENTROPY = Buffer.from("MVP_SPHERE_SR:DPAPI:v1", "utf8");

function runDpapi(operation, value) {
  if (process.platform !== "win32") throw new Error("DPAPI CurrentUser доступен только в Windows runtime");
  const method = operation === "protect" ? "Protect" : "Unprotect";
  const script = [
    "Add-Type -AssemblyName System.Security",
    `$data=[Convert]::FromBase64String('${Buffer.from(value).toString("base64")}')`,
    `$entropy=[Convert]::FromBase64String('${ENTROPY.toString("base64")}')`,
    `$result=[Security.Cryptography.ProtectedData]::${method}($data,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    "[Console]::Out.Write([Convert]::ToBase64String($result))"
  ].join("\n");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "-"], {
    input: script,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0 || !String(result.stdout || "").trim()) throw new Error("Windows DPAPI operation failed");
  return Buffer.from(String(result.stdout).trim(), "base64");
}

function getOrCreateMasterKey(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const keyPath = path.join(dataDir, "master-key.dpapi");
  if (fs.existsSync(keyPath)) {
    const protectedKey = Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64");
    const key = runDpapi("unprotect", protectedKey);
    if (key.length !== 32) throw new Error("Invalid protected master key length");
    return key;
  }
  const key = crypto.randomBytes(32);
  const protectedKey = runDpapi("protect", key).toString("base64");
  try {
    fs.writeFileSync(keyPath, protectedKey, { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return getOrCreateMasterKey(dataDir);
  }
  return key;
}

function encryptBuffer(plaintext, key, objectKey) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("AES-256 key must contain 32 bytes");
  const iv = crypto.randomBytes(12);
  const aad = Buffer.from(`MVP_SPHERE_SR|${ENVELOPE_VERSION}|${objectKey}`, "utf8");
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    plaintextSha256: crypto.createHash("sha256").update(plaintext).digest("hex"),
    updatedAt: new Date().toISOString()
  };
}

function decryptBuffer(envelope, key, objectKey) {
  if (!envelope || envelope.version !== ENVELOPE_VERSION || envelope.algorithm !== ALGORITHM) throw new Error("Unsupported encrypted object envelope");
  const iv = Buffer.from(envelope.iv, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid AES-GCM envelope");
  const aad = Buffer.from(`MVP_SPHERE_SR|${ENVELOPE_VERSION}|${objectKey}`, "utf8");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]);
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  if (hash !== envelope.plaintextSha256) throw new Error("Encrypted object integrity check failed");
  return plaintext;
}

module.exports = { ALGORITHM, ENVELOPE_VERSION, decryptBuffer, encryptBuffer, getOrCreateMasterKey, runDpapi };
