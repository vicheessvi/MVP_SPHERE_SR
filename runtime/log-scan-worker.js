(function (root) {
  "use strict";

  if (typeof importScripts === "function") {
    importScripts("huawei-te-log-events.js", "huawei-310-log-events.js", "huawei-300-log-events.js");
  }

  const parsers = {
    te: root.MVP_HUAWEI_TE_LOG_EVENTS || (typeof require === "function" ? require("./huawei-te-log-events") : null),
    huawei310: root.MVP_HUAWEI_310_LOG_EVENTS || (typeof require === "function" ? require("./huawei-310-log-events") : null),
    huawei300: root.MVP_HUAWEI_300_LOG_EVENTS || (typeof require === "function" ? require("./huawei-300-log-events") : null)
  };

  async function scanLogFile(file, kind, model, onProgress, shouldCancel) {
    const parser = parsers[kind];
    if (!parser || !file || !Number.isSafeInteger(file.size) || file.size < 0) throw new Error("unsupported_log_scan");
    let lastBytes = 0;
    let lastAt = 0;
    let hashEnabled = Boolean(root.crypto?.subtle);
    let buffered = [];
    let bufferedBytes = 0;
    const digests = [];
    async function flushHashChunk() {
      if (!hashEnabled || !bufferedBytes) return;
      const combined = new Uint8Array(bufferedBytes);
      let offset = 0;
      for (const part of buffered) { combined.set(part, offset); offset += part.byteLength; }
      buffered = [];
      bufferedBytes = 0;
      try { digests.push(new Uint8Array(await root.crypto.subtle.digest("SHA-256", combined))); }
      catch { hashEnabled = false; digests.length = 0; }
    }
    const scan = await parser.scanFile(file, {
      model,
      shouldCancel,
      async onProgress(done, total, bytes) {
        if (hashEnabled && bytes?.byteLength) {
          buffered.push(bytes);
          bufferedBytes += bytes.byteLength;
          if (bufferedBytes >= 4 * 1024 * 1024) await flushHashChunk();
        }
        const now = Date.now();
        if (typeof onProgress === "function" && (done === total || done - lastBytes >= 4 * 1024 * 1024 || now - lastAt >= 250)) {
          lastBytes = done;
          lastAt = now;
          await onProgress(done, total);
        }
      }
    });
    if (!scan.ok || !hashEnabled) return scan;
    await flushHashChunk();
    if (!hashEnabled) return scan;
    const marker = new TextEncoder().encode("MVP_SPHERE_SR:sha256-chunk-merkle-v1\0");
    const material = new Uint8Array(marker.byteLength + 8 + digests.length * 32);
    material.set(marker);
    new DataView(material.buffer).setBigUint64(marker.byteLength, BigInt(file.size), false);
    digests.forEach((digest, index) => material.set(digest, marker.byteLength + 8 + index * 32));
    const finalHash = new Uint8Array(await root.crypto.subtle.digest("SHA-256", material));
    return { ...scan, digestAlgorithm: "sha256-chunk-merkle-v1",
      contentDigest: [...finalHash].map((byte) => byte.toString(16).padStart(2, "0")).join("") };
  }

  if (typeof importScripts === "function" && typeof root.addEventListener === "function") {
    root.addEventListener("message", async (event) => {
      const request = event.data || {};
      if (request.type !== "scan" || !Number.isSafeInteger(request.taskId) || request.taskId < 0) return;
      try {
        const scan = await scanLogFile(request.file, request.kind, request.model, (done, total) => {
          root.postMessage({ type: "progress", taskId: request.taskId, done, total });
        });
        root.postMessage({ type: "result", taskId: request.taskId, scan });
      } catch (error) {
        root.postMessage({ type: "failed", taskId: request.taskId,
          reason: error?.message === "log_scan_cancelled" ? "cancelled" : "read_failed" });
      }
    });
  }

  const api = Object.freeze({ scanLogFile });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MVP_LOG_SCAN_WORKER = api;
})(typeof self !== "undefined" ? self : globalThis);
