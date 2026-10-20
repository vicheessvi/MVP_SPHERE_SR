(function (global) {
  "use strict";

  const KIND = "mvp-sphere-polling-recovery";
  const VERSION = 1;
  const FILE = "polling-recovery.json";
  const SECRET_KEY = /^(password|pass|username|login|credential|credentials|authorization|cookie|token|secret)$/i;

  function rejectSecrets(value) {
    if (Array.isArray(value)) { value.forEach(rejectSecrets); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) throw new Error("recovery_secret_field");
      rejectSecrets(child);
    }
  }

  function create(plan, allowInsecureTls, createdAt) {
    if (!plan || !Array.isArray(plan.devices) || !plan.devices.length) throw new Error("recovery_plan_invalid");
    const safePlan = JSON.parse(JSON.stringify(plan));
    delete safePlan.authenticationInputSha256;
    rejectSecrets(safePlan);
    return { kind: KIND, version: VERSION, createdAt: createdAt || new Date().toISOString(), status: "interrupted", allowInsecureTls: allowInsecureTls === true, plan: safePlan, savedIndices: [], saveFailures: [], nextIndex: 0 };
  }

  function validate(value) {
    if (!value || value.kind !== KIND || value.version !== VERSION || !value.plan || value.plan.schemaVersion !== 3 || !Array.isArray(value.plan.devices) || !value.plan.devices.length || !Array.isArray(value.savedIndices) || !Array.isArray(value.saveFailures) || !Number.isInteger(value.nextIndex) || value.nextIndex < 0 || value.nextIndex > value.plan.devices.length || typeof value.allowInsecureTls !== "boolean" || !["interrupted", "running", "completed", "completed_with_errors", "cancelled"].includes(value.status)) throw new Error("recovery_manifest_invalid");
    if (Object.hasOwn(value.plan, "authenticationInputSha256")) throw new Error("recovery_secret_field");
    rejectSecrets(value.plan);
    const count = value.plan.devices.length;
    if (value.savedIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= count) || new Set(value.savedIndices).size !== value.savedIndices.length || value.saveFailures.some((event) => !event || !Number.isInteger(event.index) || event.index < 0 || event.index >= count || event.code !== "result_save_failed")) throw new Error("recovery_manifest_invalid");
    if (value.jobId !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(String(value.jobId))) throw new Error("recovery_manifest_invalid");
    if (value.activeOriginalIndices !== undefined && (!Array.isArray(value.activeOriginalIndices) || value.activeOriginalIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= count) || new Set(value.activeOriginalIndices).size !== value.activeOriginalIndices.length)) throw new Error("recovery_manifest_invalid");
    return value;
  }

  function record(value, index, saved) {
    validate(value);
    if (!Number.isInteger(index) || index < 0 || index >= value.plan.devices.length) throw new Error("recovery_index_invalid");
    if (saved) {
      if (!value.savedIndices.includes(index)) value.savedIndices.push(index);
      value.saveFailures = value.saveFailures.filter((event) => event.index !== index);
    }
    if (!saved && !value.saveFailures.some((event) => event.index === index)) value.saveFailures.push({ index, code: "result_save_failed" });
    value.nextIndex = Math.max(value.nextIndex, index + 1);
    return value;
  }

  function remaining(value, verifiedSavedIndices) {
    validate(value);
    const saved = new Set(verifiedSavedIndices);
    const writes = value.plan.managementTasks?.length > 0;
    const skippedForReview = [];
    const originalIndices = [];
    const devices = [];
    value.plan.devices.forEach((device, index) => {
      if (saved.has(index)) return;
      if (writes && index <= value.nextIndex) { skippedForReview.push(index); return; }
      originalIndices.push(index);
      devices.push(device);
    });
    return { originalIndices, skippedForReview, plan: { ...value.plan, scheduledAt: new Date().toISOString(), devices } };
  }

  const api = { FILE, create, validate, record, remaining };
  global.MVP_POLLING_RECOVERY = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
