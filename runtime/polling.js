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
  const ping = await (settings.ping || pingDevice)(ip, settings.timeoutMs);
  if (!ping.ok) return { ip, capturedAt, adapterKey: manifest.key, ok: false, failedStage: "ping", ping: { ok: false, durationMs: ping.durationMs }, vendorPolling: { status: "not_started" }, safeError: ping.safeError || "no_ping_response" };
  if (manifest.transport === "extron_web_dynamic_resources_v1") {
    const getCredential = typeof settings.getCredential === "function"
      ? settings.getCredential
      : settings.credentialVault && typeof settings.credentialVault.getForDevice === "function"
        ? (_targetIp, targetDevice) => settings.credentialVault.getForDevice(targetDevice)
        : settings.credentialVault && typeof settings.credentialVault.getForIp === "function"
          ? (targetIp) => settings.credentialVault.getForIp(targetIp)
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
      return { ...result, ip, capturedAt: result.capturedAt || capturedAt, adapterKey: manifest.key, ping: { ok: true, durationMs: ping.durationMs } };
    } catch {
      return { ip, capturedAt, adapterKey: manifest.key, ok: false, failedStage: "adapter", ping: { ok: true, durationMs: ping.durationMs }, vendorPolling: { status: "supported", knownModel: manifest.knownModel }, safeError: "adapter_failed" };
    }
  }
  return { ip, capturedAt, adapterKey: manifest.key, ok: false, failedStage: "adapter", ping: { ok: true, durationMs: ping.durationMs }, vendorPolling: { status: manifest.protocolStatus, knownModel: manifest.knownModel }, safeError: manifest.protocolStatus === "protocol_required" ? "verified_protocol_contract_required" : "adapter_unsupported" };
}

async function runPlan(plan, options) {
  if (!plan || !Array.isArray(plan.devices)) throw new Error("Polling plan must contain devices[]");
  const ips = plan.devices.map((device) => normalizeIpv4(device.ipNormalized || device.ip));
  if (ips.some((ip) => !ip) || new Set(ips).size !== ips.length) throw new Error("Polling plan contains invalid or duplicate IP");
  const allowedIps = new Set(ips);
  const results = [];
  for (const device of plan.devices) results.push(await probeDevice(device, { ...(options || {}), allowedIps }));
  return results;
}

module.exports = { pingDevice, probeDevice, runPlan };
