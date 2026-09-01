#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { parseCredentialWorkbook } = require("../runtime/credential-pool");
const { runPlan } = require("../runtime/polling");

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
    if (/^(password|pass|username|login|credential|credentials|authorization|cookie|token|secret)$/i.test(key)) throw new Error(`${location} must not contain credential fields`);
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
    if (/^(password|pass|username|login|credential|credentials|successfulCredential|authorization|cookie|set-cookie|token|secret|headers)$/i.test(key)) continue;
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
  if (extension === ".xlsx") return "excel";
  throw new Error("Credential file must use .xlsx");
}

function readCredentialImport(filename) {
  credentialFormat(filename);
  const XLSX = require("../vendor/xlsx.full.min.js");
  const buffer = fs.readFileSync(filename);
  const parsed = parseCredentialWorkbook(buffer, XLSX);
  return { ...parsed, sourceSha256: crypto.createHash("sha256").update(buffer).digest("hex") };
}

async function execute(argv, options) {
  const settings = options || {};
  const planPath = argument(argv, "--plan");
  if (!planPath) throw new Error("Usage: node scripts/poll-devices.js --plan <plan.json> --credentials <credentials.xlsx> --output-root <directory> [--timeout <ms>] [--allow-insecure-tls]");
  const plan = JSON.parse(fs.readFileSync(path.resolve(planPath), "utf8"));
  assertNoPlanSecrets(plan);
  const credentialPath = argument(argv, "--credentials");
  if (!credentialPath) throw new Error("Credential XLSX is required for automatic polling");
  if (!argument(argv, "--out") && !argument(argv, "--output-root")) throw new Error("Output directory is required for automatic polling");
  const outputDir = resolveOutputDirectory(argv, settings);
  fs.mkdirSync(outputDir, { recursive: true });

  const credentialImport = readCredentialImport(path.resolve(credentialPath));
  if (plan.authenticationInputSha256 && String(plan.authenticationInputSha256).toLowerCase() !== credentialImport.sourceSha256) throw new Error("Credential XLSX does not match the file selected when the plan was created");
  const credentialPool = credentialImport.credentials;

  const allowInsecureTls = hasFlag(argv, "--allow-insecure-tls");
  const savedResults = new Set();
  const saveResult = async (rawResult, context) => {
    const fallbackName = `unsupported-${String((context?.index || 0) + 1).padStart(4, "0")}`;
    const basename = rawResult.ip || fallbackName;
    const filename = `${basename}.json`;
    const result = sanitizeResult({ ...rawResult, outputFile: `.\\${path.basename(outputDir)}\\${filename}` });
    const writeJson = settings.writeJson || atomicWriteJson;
    try {
      writeJson(path.join(outputDir, filename), result);
    } catch {
      let recovered = false;
      try {
        const recoveryRoot = settings.recoveryRoot || path.join(defaultLocalDataRoot(settings.environment), "poll-results-recovery");
        const recoveryDir = path.join(recoveryRoot, path.basename(outputDir));
        fs.mkdirSync(recoveryDir, { recursive: true });
        writeJson(path.join(recoveryDir, filename), result);
        recovered = true;
      } catch { recovered = false; }
      const error = new Error(recovered ? "result_save_failed_recovery_copy_created" : "result_save_failed_recovery_unavailable");
      error.code = recovered ? "RESULT_SAVE_FAILED_RECOVERED" : "RESULT_SAVE_FAILED";
      throw error;
    }
    savedResults.add(rawResult);
    settings.onProgress?.({ stage: "saved", index: (context?.index || 0) + 1, total: context?.total || plan.devices.length, device: context?.device || null });
  };
  const results = await (settings.runPlan || runPlan)(plan, {
    timeoutMs: Number(argument(argv, "--timeout")) || 7000,
    getCredentials: () => credentialPool,
    allowInsecureTls,
    ping: settings.ping,
    request: settings.request,
    now: settings.clock,
    nowMs: settings.nowMs,
    wait: settings.wait,
    signal: settings.signal,
    honorSchedule: settings.honorSchedule !== false,
    onProgress: settings.onProgress,
    onResult: saveResult
  });
  for (let index = 0; index < results.length; index += 1) if (!savedResults.has(results[index])) await saveResult(results[index], { index, total: results.length, device: plan.devices[index] });
  return {
    outputDir,
    total: results.length,
    completed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    pingFailed: results.filter((result) => result.failedStage === "ping").length,
    authorizationFailed: results.filter((result) => result.failedStage === "authorization" || result.failedStage === "credentials").length,
    protocolRequired: results.filter((result) => result.vendorPolling && result.vendorPolling.status === "protocol_required").length,
    importedCredentials: credentialImport.summary.acceptedCount,
    rejectedCredentialRows: credentialImport.summary.rejectedCount,
    duplicateCredentials: credentialImport.summary.duplicateCount
  };
}

async function main() {
  const abortController = new AbortController();
  process.once("SIGINT", () => abortController.abort());
  const counters = { processed: 0, successful: 0, failed: 0, unsupported: 0 };
  const summary = await execute(process.argv.slice(2), {
    signal: abortController.signal,
    onProgress(progress) {
      if (progress.stage === "processed" && progress.result) {
        counters.processed += 1;
        if (progress.result.ok) counters.successful += 1;
        else if (progress.result.networkAttempted === false) counters.unsupported += 1;
        else counters.failed += 1;
      }
      const safe = { type: "progress", stage: progress.stage, index: progress.index, total: progress.total, processed: counters.processed, successful: counters.successful, failed: counters.failed, unsupported: counters.unsupported, percent: progress.total ? Math.round((counters.processed / progress.total) * 100) : 0, waitSeconds: progress.waitSeconds, device: progress.device ? { ip: progress.device.ip || null, category: progress.device.category || null, manufacturer: progress.device.manufacturer || null, model: progress.device.model || null } : null };
      process.stdout.write(`${JSON.stringify(safe)}\n`);
    }
  });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    if (error && error.code === "POLLING_CANCELLED") {
      process.stdout.write(`${JSON.stringify({ type: "cancelled", status: "cancelled" })}\n`);
      process.exitCode = 130;
    } else {
      process.stderr.write(`Polling failed: ${error && error.message ? error.message : "unknown_error"}\n`);
      process.exitCode = 1;
    }
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
