(function (root) {
  "use strict";

  const defaultParsers = {
    te: root.MVP_HUAWEI_TE_LOG_EVENTS || (typeof require === "function" ? require("./huawei-te-log-events") : null),
    huawei310: root.MVP_HUAWEI_310_LOG_EVENTS || (typeof require === "function" ? require("./huawei-310-log-events") : null),
    huawei300: root.MVP_HUAWEI_300_LOG_EVENTS || (typeof require === "function" ? require("./huawei-300-log-events") : null)
  };

  function createLogScanClient(options) {
    const settings = options || {};
    const WorkerCtor = settings.WorkerCtor === undefined ? root.Worker : settings.WorkerCtor;
    const parsers = settings.parsers || defaultParsers;
    const recycleAfter = Number.isSafeInteger(settings.recycleAfter) && settings.recycleAfter > 0 ? settings.recycleAfter : 32;
    let worker = null;
    let active = null;
    let taskId = 0;
    let workerFiles = 0;
    let fallback = false;
    let failed = false;
    let cancelled = false;

    function terminate() {
      if (worker) worker.terminate();
      worker = null;
      workerFiles = 0;
    }

    function settle(message) {
      if (!active || message?.taskId !== active.taskId) return;
      if (message.type === "progress") {
        settings.onProgress?.(message.done, message.total);
        return;
      }
      const pending = active;
      active = null;
      if (message.type === "result") {
        workerFiles += 1;
        pending.resolve(message.scan);
        if (workerFiles >= recycleAfter) terminate();
      } else {
        pending.reject(new Error(message.reason === "cancelled" ? "log_scan_cancelled" : "log_scan_failed"));
      }
    }

    function ensureWorker() {
      if (worker || fallback || failed || typeof WorkerCtor !== "function") return;
      try {
        worker = new WorkerCtor(settings.workerUrl || "runtime/log-scan-worker.js");
      } catch {
        fallback = true;
        return;
      }
      worker.onmessage = (event) => settle(event.data);
      worker.onerror = () => {
        failed = true;
        const pending = active;
        active = null;
        terminate();
        pending?.reject(new Error("log_worker_failed"));
      };
    }

    async function scan(file, kind, model) {
      if (cancelled) throw new Error("log_scan_cancelled");
      if (failed) throw new Error("log_worker_failed");
      if (active) throw new Error("log_scan_busy");
      if (!parsers[kind]) throw new Error("unsupported_log_scan");
      ensureWorker();
      if (worker) {
        const id = ++taskId;
        return new Promise((resolve, reject) => {
          active = { taskId: id, resolve, reject };
          try { worker.postMessage({ type: "scan", taskId: id, file, kind, model }); }
          catch { active = null; reject(new Error("log_scan_failed")); }
        });
      }
      let lastYield = 0;
      const progress = async (done, total) => {
        settings.onProgress?.(done, total);
        if (done - lastYield >= 4 * 1024 * 1024) {
          lastYield = done;
          await new Promise((resolve) => root.setTimeout(resolve, 0));
        }
      };
      const direct = settings.parsers ? null : root.MVP_LOG_SCAN_WORKER
        || (typeof require === "function" ? require("./log-scan-worker") : null);
      if (direct?.scanLogFile) return direct.scanLogFile(file, kind, model, progress, () => cancelled);
      return parsers[kind].scanFile(file, {
        model,
        shouldCancel: () => cancelled,
        onProgress: progress
      });
    }

    function cancel() {
      cancelled = true;
      const pending = active;
      active = null;
      terminate();
      pending?.reject(new Error("log_scan_cancelled"));
    }

    function close() {
      const pending = active;
      active = null;
      terminate();
      pending?.reject(new Error("log_scan_cancelled"));
    }

    return Object.freeze({ scan, cancel, close, get mode() { return worker ? "worker" : "fallback"; } });
  }

  const api = Object.freeze({ createLogScanClient });
  if (typeof module === "object" && module.exports) module.exports = api;
  root.MVP_LOG_SCAN_CLIENT = api;
})(typeof window !== "undefined" ? window : globalThis);
