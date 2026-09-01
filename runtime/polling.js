"use strict";

const { spawn } = require("child_process");
const { normalizeIpv4 } = require("./credential-vault");
const { pollExtronDevice } = require("./extron-web-poller");
const { resolveManifest } = require("./model-catalog");

function pingDevice(ip, timeoutMs) {
  const normalizedIp = normalizeIpv4(ip);
  if (!normalizedIp) return Promise.resolve({ ok: false, durationMs: null, safeError: "invalid_or_forbidden_ip" });
  const timeout = Math.max(250, Math.min(Number(timeoutMs) || 3000, 30000));
  const args = process.platform === "win32"
    ? ["-n", "1", "-w", String(timeout), normalizedIp]
    : ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeout / 1000))), normalizedIp];
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn("ping", args, { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => child.kill(), timeout + 1000);
    child.once("error", () => { clearTimeout(timer); resolve({ ok: false, durationMs: Date.now() - startedAt, safeError: "ping_process_failed" }); });
    child.once("close", (code) => { clearTimeout(timer); resolve({ ok: code === 0, durationMs: Date.now() - startedAt, safeError: code === 0 ? null : "no_ping_response" }); });
  });
}

async function probeDevice(device, options) {
  const settings = options || {};
  const ip = normalizeIpv4(device && (device.ipNormalized || device.ip));
  const allowed = settings.allowedIps instanceof Set ? settings.allowedIps : new Set(settings.allowedIps || []);
  if (!ip || !allowed.has(ip)) throw new Error("Polling target is invalid or absent from the explicit plan allowlist");
  const capturedAt = new Date().toISOString();
  const manifest = resolveManifest(device);
  if (device.pollingSupported === false || !manifest.transport || manifest.protocolStatus !== "supported") {
    return { ip, capturedAt, adapterKey: manifest.key, ok: false, failedStage: "adapter", ping: { ok: null, durationMs: null }, networkAttempted: false, vendorPolling: { status: manifest.protocolStatus, knownModel: manifest.knownModel }, safeError: manifest.protocolStatus === "protocol_required" ? "verified_protocol_contract_required" : "adapter_unsupported" };
  }
  const ping = await (settings.ping || pingDevice)(ip, settings.timeoutMs);
  if (!ping.ok) return { ip, capturedAt, adapterKey: manifest.key, ok: false, failedStage: "ping", ping: { ok: false, durationMs: ping.durationMs }, vendorPolling: { status: "not_started" }, safeError: ping.safeError || "no_ping_response" };
  if (manifest.transport === "extron_web_dynamic_resources_v1") {
    const getCredential = typeof settings.getCredentials === "function"
      ? settings.getCredentials
      : typeof settings.getCredential === "function"
        ? settings.getCredential
        : () => null;
    const credential = await getCredential(ip, { ...device, ipNormalized: ip });
    const adapter = settings.extronAdapter || pollExtronDevice;
    try {
      const result = await adapter({ ...device, ipNormalized: ip, allowInsecureTls: device.allowInsecureTls === true || settings.allowInsecureTls === true }, credential, {
        request: settings.request,
        timeoutMs: settings.timeoutMs,
        now: settings.now,
        allowInsecureTls: settings.allowInsecureTls === true
      });
      return { ...result, ip, capturedAt: result.capturedAt || capturedAt, adapterKey: manifest.key, networkAttempted: true, ping: { ok: true, durationMs: ping.durationMs } };
    } catch {
      return { ip, capturedAt, adapterKey: manifest.key, ok: false, failedStage: "adapter", ping: { ok: true, durationMs: ping.durationMs }, vendorPolling: { status: "supported", knownModel: manifest.knownModel }, safeError: "adapter_failed" };
    }
  }
  return { ip, capturedAt, adapterKey: manifest.key, ok: false, failedStage: "adapter", ping: { ok: true, durationMs: ping.durationMs }, vendorPolling: { status: manifest.protocolStatus, knownModel: manifest.knownModel }, safeError: manifest.protocolStatus === "protocol_required" ? "verified_protocol_contract_required" : "adapter_unsupported" };
}

function abortableWait(milliseconds, signal, waitImplementation) {
  const duration = Math.max(0, Number(milliseconds) || 0);
  if (!duration) return Promise.resolve();
  if (typeof waitImplementation === "function") return waitImplementation(duration, signal);
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error("Polling cancelled"), { code: "POLLING_CANCELLED" }));
    const timer = setTimeout(resolve, duration);
    signal?.addEventListener?.("abort", () => { clearTimeout(timer); reject(Object.assign(new Error("Polling cancelled"), { code: "POLLING_CANCELLED" })); }, { once: true });
  });
}

function planDeviceSupported(device) {
  const manifest = resolveManifest(device);
  return device?.pollingSupported !== false && Boolean(normalizeIpv4(device?.ipNormalized || device?.ip) && manifest.transport && manifest.protocolStatus === "supported");
}

async function runPlan(plan, options) {
  if (!plan || !Array.isArray(plan.devices)) throw new Error("Polling plan must contain devices[]");
  const settings = options || {};
  const devices = plan.devices.map((device) => Object.freeze({ ...device }));
  const ips = devices.map((device) => normalizeIpv4(device.ipNormalized || device.ip)).filter(Boolean);
  if (new Set(ips).size !== ips.length) throw new Error("Polling plan contains duplicate IP");
  const allowedIps = new Set(ips);
  const results = [];
  const intervalSeconds = Number(plan.intervalSeconds || 0);
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 0 || !Number.isFinite(intervalSeconds)) throw new Error("Polling interval must be a non-negative integer");
  if (settings.honorSchedule && plan.scheduledAt) {
    const scheduledTime = new Date(plan.scheduledAt).getTime();
    if (!Number.isFinite(scheduledTime)) throw new Error("Polling schedule is invalid");
    const delay = scheduledTime - Number(settings.nowMs ? settings.nowMs() : Date.now());
    if (delay > 0) await abortableWait(delay, settings.signal, settings.wait);
  }
  for (let index = 0; index < devices.length; index += 1) {
    if (settings.signal?.aborted) break;
    const device = devices[index];
    const ip = normalizeIpv4(device.ipNormalized || device.ip);
    let result;
    if (!ip || !planDeviceSupported(device)) {
      const manifest = resolveManifest(device);
      result = { ip: ip || null, capturedAt: new Date().toISOString(), adapterKey: manifest.key, ok: false, failedStage: "adapter", ping: { ok: null, durationMs: null }, networkAttempted: false, vendorPolling: { status: manifest.protocolStatus || "protocol_required", knownModel: manifest.knownModel }, safeError: ip ? "verified_protocol_contract_required" : "invalid_or_missing_ip" };
    } else {
      settings.onProgress?.({ stage: "polling", index, total: devices.length, device: { ip, category: device.category, manufacturer: device.manufacturer, model: device.model } });
      result = await probeDevice(device, { ...settings, allowedIps });
    }
    results.push(result);
    if (typeof settings.onResult === "function") await settings.onResult(result, { index, total: devices.length, device });
    settings.onProgress?.({ stage: "processed", index: index + 1, total: devices.length, result });
    const hasNextSupported = devices.slice(index + 1).some(planDeviceSupported);
    if (result.networkAttempted !== false && hasNextSupported && intervalSeconds > 0) {
      settings.onProgress?.({ stage: "waiting", index: index + 1, total: devices.length, waitSeconds: intervalSeconds });
      await abortableWait(intervalSeconds * 1000, settings.signal, settings.wait);
    }
  }
  return results;
}

module.exports = { abortableWait, pingDevice, planDeviceSupported, probeDevice, runPlan };
