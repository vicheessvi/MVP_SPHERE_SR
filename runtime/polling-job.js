"use strict";

const crypto = require("crypto");
const { abortableWait, runPlan } = require("./polling");
const { assertNoPlanSecrets, sanitizeResult } = require("../scripts/poll-devices");

const TERMINAL_STATUSES = new Set(["completed", "cancelled", "failed"]);

function safeDevice(device) {
  if (!device) return null;
  return {
    ip: device.ipNormalized || device.ip || null,
    category: device.category || null,
    manufacturer: device.manufacturer || null,
    model: device.model || null
  };
}

function safeJobError(error) {
  const code = String(error && error.code || "");
  if (code === "POLLING_CANCELLED") return "polling_cancelled";
  if (code === "RESULT_SAVE_FAILED") return "result_save_failed";
  if (code === "CREDENTIAL_SHA_MISMATCH") return "credential_sha_mismatch";
  return "local_runtime_error";
}

function resultFilename(result, index) {
  const fallback = `unsupported-${String(index + 1).padStart(4, "0")}`;
  return `${result && result.ip || fallback}.json`;
}

function createPollingJob(input) {
  const settings = input || {};
  const plan = JSON.parse(JSON.stringify(settings.plan || null));
  assertNoPlanSecrets(plan);
  if (!plan || !Array.isArray(plan.devices) || !plan.devices.length) throw Object.assign(new Error("plan_invalid"), { code: "PLAN_INVALID" });
  const credentials = Array.isArray(settings.credentials) ? settings.credentials.slice() : [];
  if (!credentials.length) throw Object.assign(new Error("credentials_required"), { code: "CREDENTIALS_REQUIRED" });
  const controller = new AbortController();
  const clock = typeof settings.clock === "function" ? settings.clock : () => new Date();
  const nowMs = typeof settings.nowMs === "function" ? settings.nowMs : () => Date.now();
  const runPlanImpl = settings.runPlan || runPlan;
  const job = {
    id: settings.id || crypto.randomBytes(18).toString("base64url"),
    planId: settings.planId || null,
    createdAt: clock().toISOString(),
    scheduledAt: plan.scheduledAt || null,
    startedAt: null,
    finishedAt: null,
    allowInsecureTls: settings.allowInsecureTls === true,
    status: "scheduled",
    total: plan.devices.length,
    processed: 0,
    successful: 0,
    failed: 0,
    unsupported: 0,
    currentDevice: null,
    safeError: null,
    pendingResult: null,
    ack: null,
    promise: null
  };

  function publicStatus() {
    return Object.freeze({
      id: job.id,
      planId: job.planId,
      createdAt: job.createdAt,
      scheduledAt: job.scheduledAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      allowInsecureTls: job.allowInsecureTls,
      status: job.status,
      total: job.total,
      processed: job.processed,
      successful: job.successful,
      failed: job.failed,
      unsupported: job.unsupported,
      currentDevice: job.currentDevice,
      pendingResult: Boolean(job.pendingResult),
      safeError: job.safeError
    });
  }

  function pendingResult() {
    if (!job.pendingResult) return null;
    return Object.freeze({ ...job.pendingResult });
  }

  function acknowledge(resultId, saved) {
    if (!job.pendingResult || job.pendingResult.resultId !== resultId || !job.ack) return false;
    const ack = job.ack;
    job.ack = null;
    job.pendingResult = null;
    if (saved) ack.resolve();
    else ack.reject(Object.assign(new Error("result_save_failed"), { code: "RESULT_SAVE_FAILED" }));
    return true;
  }

  function cancel() {
    if (TERMINAL_STATUSES.has(job.status)) return publicStatus();
    controller.abort();
    if (job.ack) {
      const ack = job.ack;
      job.ack = null;
      job.pendingResult = null;
      ack.reject(Object.assign(new Error("Polling cancelled"), { code: "POLLING_CANCELLED" }));
    }
    return publicStatus();
  }

  async function waitForSave(rawResult, context) {
    const filename = resultFilename(rawResult, context.index);
    const resultId = crypto.randomBytes(18).toString("base64url");
    const payload = sanitizeResult({ ...rawResult, outputFile: `.\\${filename}` });
    job.pendingResult = { resultId, filename, payload, index: context.index, total: context.total };
    job.status = "waiting_for_save";
    await new Promise((resolve, reject) => {
      job.ack = { resolve, reject };
      if (controller.signal.aborted) cancel();
    });
  }

  async function execute() {
    try {
      if (plan.scheduledAt) {
        const target = new Date(plan.scheduledAt).getTime();
        if (!Number.isFinite(target)) throw Object.assign(new Error("plan_invalid"), { code: "PLAN_INVALID" });
        const delay = target - nowMs();
        if (delay > 0) await abortableWait(delay, controller.signal, settings.wait);
      }
      job.startedAt = clock().toISOString();
      job.status = "running";
      await runPlanImpl(plan, {
        timeoutMs: settings.timeoutMs || 7000,
        getCredentials: () => credentials,
        allowInsecureTls: job.allowInsecureTls,
        ping: settings.ping,
        request: settings.request,
        signal: controller.signal,
        honorSchedule: false,
        wait: settings.wait,
        now: settings.adapterNow,
        nowMs,
        onResult: waitForSave,
        onProgress(progress) {
          job.currentDevice = safeDevice(progress.device);
          if (progress.stage === "waiting") job.status = "waiting_interval";
          else if (progress.stage === "polling") job.status = "running";
          if (progress.stage === "processed" && progress.result) {
            job.processed += 1;
            if (progress.result.ok) job.successful += 1;
            else if (progress.result.networkAttempted === false) job.unsupported += 1;
            else job.failed += 1;
          }
          settings.onProgress?.(publicStatus());
        }
      });
      job.status = controller.signal.aborted ? "cancelled" : "completed";
      if (job.status === "cancelled") job.safeError = "polling_cancelled";
    } catch (error) {
      job.safeError = safeJobError(error);
      job.status = job.safeError === "polling_cancelled" ? "cancelled" : "failed";
    } finally {
      job.finishedAt = clock().toISOString();
      job.currentDevice = null;
      job.pendingResult = null;
      job.ack = null;
      credentials.splice(0, credentials.length);
      settings.onTerminal?.(publicStatus());
    }
    return publicStatus();
  }

  job.promise = execute();
  return Object.freeze({ id: job.id, status: publicStatus, result: pendingResult, acknowledge, cancel, done: job.promise });
}

module.exports = { TERMINAL_STATUSES, createPollingJob, resultFilename, safeDevice, safeJobError };
