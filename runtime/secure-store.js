"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { decryptBuffer, encryptBuffer, getOrCreateMasterKey } = require("./security");

function validateObjectKey(value) {
  const key = String(value || "");
  if (!/^[a-zA-Z0-9._-]{1,160}$/.test(key)) throw new Error("Invalid secure object key");
  return key;
}

class SecureStore {
  constructor(options) {
    const settings = options || {};
    this.dataDir = path.resolve(settings.dataDir);
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.objectsDir = path.join(this.dataDir, "objects");
    fs.mkdirSync(this.objectsDir, { recursive: true });
    this.key = settings.key ? Buffer.from(settings.key) : getOrCreateMasterKey(this.dataDir);
  }

  pathFor(key) {
    const safeKey = validateObjectKey(key);
    const filename = crypto.createHash("sha256").update(safeKey).digest("hex");
    return { safeKey, target: path.join(this.objectsDir, `${filename}.enc`) };
  }

  has(key) {
    return fs.existsSync(this.pathFor(key).target);
  }

  readBuffer(key) {
    const { safeKey, target } = this.pathFor(key);
    if (!fs.existsSync(target)) return null;
    const envelope = JSON.parse(fs.readFileSync(target, "utf8"));
    return decryptBuffer(envelope, this.key, safeKey);
  }

  readText(key) {
    const value = this.readBuffer(key);
    return value === null ? null : value.toString("utf8");
  }

  writeBuffer(key, value) {
    const { safeKey, target } = this.pathFor(key);
    const envelope = encryptBuffer(Buffer.from(value), this.key, safeKey);
    const temporary = `${target}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    const handle = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(handle, JSON.stringify(envelope), "utf8");
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, target);
    return { plaintextSha256: envelope.plaintextSha256, updatedAt: envelope.updatedAt, bytes: Buffer.byteLength(value) };
  }

  writeText(key, value) {
    return this.writeBuffer(key, Buffer.from(String(value), "utf8"));
  }

  delete(key) {
    const target = this.pathFor(key).target;
    if (!fs.existsSync(target)) return false;
    fs.unlinkSync(target);
    return true;
  }
}

module.exports = { SecureStore, validateObjectKey };
