#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CredentialVault } = require("../runtime/credential-vault");
const { runPlan } = require("../runtime/polling");
const { SecureStore } = require("../runtime/secure-store");

function argument(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatCaptureFolder(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new Error("Capture date is invalid");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}_${pad(value.getHours())}-${pad(value.getMinutes())}-${pad(value.getSeconds())}`;
}

function defaultLocalDataRoot(environment) {
  const localAppData = String((environment || process.env).LOCALAPPDATA || "").trim();
  if (!localAppData) throw new Error("LOCALAPPDATA is unavailable; specify --out or --output-root");
  return path.resolve(localAppData, "MVP_SPHERE_SR");
}

function resolveOutputDirectory(argv, options) {
  const settings = options || {};
  const exact = argument(argv, "--out");
  if (exact) return path.resolve(exact);
  const rootArgument = argument(argv, "--output-root");
  const root = rootArgument ? path.resolve(rootArgument) : path.join(defaultLocalDataRoot(settings.environment), "poll-results");
  return path.join(root, formatCaptureFolder(settings.now ? settings.now() : new Date()));
}

function assertNoPlanSecrets(value, trail) {
  const location = trail || "plan";
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (/^(password|pass|authorization|cookie|token|secret)$/i.test(key)) throw new Error(`${location} must not contain credential fields`);
    assertNoPlanSecrets(child, `${location}.${key}`);
  }
}

function sanitizeResult(value, seen) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (/\bBasic\s+[A-Za-z0-9+/=]+/i.test(value) || /NortxeSession=/i.test(value)) return "[REDACTED]";
    return value;
  }
  if (typeof value !== "object") return value;
  const visited = seen || new WeakSet();
  if (visited.has(value)) return "[CIRCULAR]";
  visited.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeResult(item, visited));
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(password|pass|authorization|cookie|set-cookie|token|secret|headers)$/i.test(key)) continue;
    output[key] = sanitizeResult(child, visited);
  }
  return output;
}

function atomicWriteJson(target, value) {
  const temporary = `${target}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  let handle;
  try {
    handle = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(handle, JSON.stringify(value, null, 2), "utf8");
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = null;
    fs.renameSync(temporary, target);
  } finally {
    if (handle !== undefined && handle !== null) fs.closeSync(handle);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function credentialFormat(filename) {
  const extension = path.extname(filename).toLocaleLowerCase("en-US");
  if (extension === ".csv") return "csv";
  if (extension === ".json") return "json";
  if (extension === ".xlsx" || extension === ".xls") return "excel";
  throw new Error("Credential file must use .xlsx, .xls, .json or .csv");
}

function readCredentialImport(filename) {
  const format = credentialFormat(filename);
  if (format !== "excel") return { text: fs.readFileSync(filename, "utf8"), format };
  const XLSX = require("../vendor/xlsx.full.min.js");
  const workbook = XLSX.read(fs.readFileSync(filename), { type: "buffer", cellFormula: false, cellHTML: false, cellNF: false, cellStyles: false });
  const firstSheetName = workbook.SheetNames && workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Credential workbook contains no worksheets");
  const records = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: "", raw: true });
  return { text: JSON.stringify(records), format: "json" };
}

async function execute(argv, options) {
  const settings = options || {};
  const planPath = argument(argv, "--plan");
  if (!planPath) throw new Error("Usage: node scripts/poll-devices.js --plan <plan.json> [--credentials <json|csv>] [--out <directory>|--output-root <directory>] [--timeout <ms>] [--allow-insecure-tls]");
  const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8"));
  assertNoPlanSecrets(plan);
  const outputDir = resolveOutputDirectory(argv, settings);
  fs.mkdirSync(outputDir, { recursive: true });

  const secureRoot = settings.secureRoot || defaultLocalDataRoot(settings.environment);
  const vault = settings.vault || new CredentialVault(settings.store || new SecureStore({ dataDir: secureRoot }));
  const credentialPath = argument(argv, "--credentials");
  let importedCredentials = 0;
  if (credentialPath) {
    const resolvedCredentialPath = path.resolve(credentialPath);
    const imported = readCredentialImport(resolvedCredentialPath);
    const summary = vault.importText(imported.text, imported.format);
    importedCredentials = summary.recordCount;
  }

  const allowInsecureTls = hasFlag(argv, "--allow-insecure-tls");
  const results = await (settings.runPlan || runPlan)(plan, {
    timeoutMs: Number(argument(argv, "--timeout")) || 7000,
    credentialVault: vault,
    allowInsecureTls,
    ping: settings.ping,
    request: settings.request,
    now: settings.clock
  });
  for (const rawResult of results) {
    const filename = `${rawResult.ip}.json`;
    const result = sanitizeResult({ ...rawResult, outputFile: `.\\${path.basename(outputDir)}\\${filename}` });
    atomicWriteJson(path.join(outputDir, filename), result);
  }
  return {
    outputDir,
    total: results.length,
    completed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    pingFailed: results.filter((result) => result.failedStage === "ping").length,
    authorizationFailed: results.filter((result) => result.failedStage === "authorization" || result.failedStage === "credentials").length,
    protocolRequired: results.filter((result) => result.vendorPolling && result.vendorPolling.status === "protocol_required").length,
    importedCredentials
  };
}

async function main() {
  const summary = await execute(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Polling failed: ${error && error.message ? error.message : "unknown_error"}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  argument,
  assertNoPlanSecrets,
  atomicWriteJson,
  credentialFormat,
  defaultLocalDataRoot,
  execute,
  formatCaptureFolder,
  readCredentialImport,
  resolveOutputDirectory,
  sanitizeResult
};
