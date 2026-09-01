"use strict";

const crypto = require("crypto");

const VAULT_KEY = "credential-vault-v1";

function normalizeHeader(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function normalizeIdentity(value) {
  return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

function normalizeCredentialCategory(value) {
  const normalized = normalizeIdentity(value);
  if (["controller", "controllers", "контроллер", "контроллеры"].includes(normalized)) return "controller";
  if (["panel", "panels", "панель", "панель управления", "панели управления"].includes(normalized)) return "panel";
  return null;
}

function normalizeIpv4(value) {
  const raw = String(value || "").trim();
  const parts = raw.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((part) => part < 0 || part > 255)) return null;
  if (numbers[0] === 0 || numbers[0] === 127 || numbers[0] >= 224 || numbers.every((part) => part === 255)) return null;
  return numbers.join(".");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const delimiter = String(text).split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  for (let index = 0; index < String(text).length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).filter((values) => values.some((value) => String(value).trim())).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function parseCredentialText(text, format) {
  const source = String(text || "");
  if (!source.trim()) throw new Error("Credential file is empty");
  if (format === "csv") return parseCsv(source);
  let parsed;
  try { parsed = JSON.parse(source); } catch { throw new Error("Credential JSON is malformed"); }
  const records = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.credentials) ? parsed.credentials : null;
  if (!records) throw new Error("Credential JSON must be an array or contain credentials[]");
  return records;
}

function valueByAliases(record, aliases) {
  const entries = Object.entries(record || {});
  for (const alias of aliases) {
    const match = entries.find(([key]) => normalizeHeader(key) === alias);
    if (match) return match[1];
  }
  return "";
}

function normalizeCredentialRecords(records) {
  const normalized = [];
  const seen = new Set();
  records.forEach((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`Credential row ${index + 1} must be an object`);
    const rawIp = String(valueByAliases(record, ["ip", "ip-адрес", "ip адрес"]) || "").trim();
    const ip = normalizeIpv4(rawIp);
    const category = normalizeCredentialCategory(valueByAliases(record, ["category", "device type", "type", "тип", "тип устройства", "тип оборудования", "категория"]));
    const manufacturerNormalized = normalizeIdentity(valueByAliases(record, ["manufacturer", "vendor", "производитель", "марка"]));
    const modelNormalized = normalizeIdentity(valueByAliases(record, ["model", "модель"]));
    const username = String(valueByAliases(record, ["username", "login", "user", "логин", "имя пользователя"]) || "").trim();
    const password = String(valueByAliases(record, ["password", "pass", "пароль"]) || "");
    if (rawIp && !ip) throw new Error(`Credential row ${index + 1}: invalid or forbidden IP`);
    if (!ip && (!category || !manufacturerNormalized)) throw new Error(`Credential row ${index + 1}: specify IP or device type and manufacturer`);
    if (!username) throw new Error(`Credential row ${index + 1}: login is empty`);
    if (!password) throw new Error(`Credential row ${index + 1}: password is empty`);
    const scope = ip ? "ip" : modelNormalized ? "device_model" : "device_type";
    const scopeKey = ip ? `ip:${ip}` : `device:${category}:${manufacturerNormalized}:${modelNormalized || "*"}`;
    if (seen.has(scopeKey)) throw new Error(`Credential row ${index + 1}: duplicate credential scope`);
    seen.add(scopeKey);
    normalized.push({
      scope,
      scopeKey,
      ...(ip ? { ipNormalized: ip } : { category, manufacturerNormalized, ...(modelNormalized ? { modelNormalized } : {}) }),
      username,
      password,
      importedAt: new Date().toISOString()
    });
  });
  if (!normalized.length) throw new Error("Credential file contains no records");
  return normalized;
}

function maskIp(ip) {
  const parts = String(ip).split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.*.${parts[3]}` : "***";
}

function maskScope(record) {
  if (record.ipNormalized) return maskIp(record.ipNormalized);
  return `${record.category}/${record.manufacturerNormalized}/${record.modelNormalized || "*"}`;
}

class CredentialVault {
  constructor(store) {
    this.store = store;
  }

  importText(text, format) {
    const records = normalizeCredentialRecords(parseCredentialText(text, format));
    const importedAt = new Date().toISOString();
    const sourceSha256 = crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
    const payload = { version: 1, importedAt, sourceSha256, records };
    this.store.writeText(VAULT_KEY, JSON.stringify(payload));
    const maskedScopes = records.slice(0, 20).map(maskScope);
    return { recordCount: records.length, sourceSha256, importedAt, maskedIps: records.filter((record) => record.ipNormalized).slice(0, 20).map((record) => maskIp(record.ipNormalized)), maskedScopes };
  }

  summary() {
    const text = this.store.readText(VAULT_KEY);
    if (!text) return { recordCount: 0, sourceSha256: null, importedAt: null, maskedIps: [], maskedScopes: [] };
    const payload = JSON.parse(text);
    return { recordCount: payload.records.length, sourceSha256: payload.sourceSha256, importedAt: payload.importedAt, maskedIps: payload.records.filter((record) => record.ipNormalized).slice(0, 20).map((record) => maskIp(record.ipNormalized)), maskedScopes: payload.records.slice(0, 20).map(maskScope) };
  }

  getForIp(ip) {
    const normalizedIp = normalizeIpv4(ip);
    const text = this.store.readText(VAULT_KEY);
    if (!normalizedIp || !text) return null;
    const record = JSON.parse(text).records.find((item) => item.ipNormalized === normalizedIp);
    return record ? { ipNormalized: record.ipNormalized, username: record.username, password: record.password } : null;
  }

  getForDevice(device) {
    const text = this.store.readText(VAULT_KEY);
    if (!text) return null;
    const records = JSON.parse(text).records || [];
    const ip = normalizeIpv4(device && (device.ipNormalized || device.ip));
    const category = normalizeCredentialCategory(device && device.category);
    const manufacturer = normalizeIdentity(device && (device.manufacturerNormalized || device.manufacturerRaw || device.manufacturer));
    const model = normalizeIdentity(device && (device.modelNormalized || device.modelRaw || device.model));
    const record = records.find((item) => ip && item.ipNormalized === ip)
      || records.find((item) => item.category === category && item.manufacturerNormalized === manufacturer && item.modelNormalized && item.modelNormalized === model)
      || records.find((item) => item.category === category && item.manufacturerNormalized === manufacturer && !item.modelNormalized);
    return record ? { ...(record.ipNormalized ? { ipNormalized: record.ipNormalized } : {}), username: record.username, password: record.password, scope: record.scope } : null;
  }
}

module.exports = { CredentialVault, VAULT_KEY, maskIp, maskScope, normalizeCredentialCategory, normalizeCredentialRecords, normalizeIpv4, parseCredentialText, parseCsv };
