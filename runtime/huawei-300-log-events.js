(function (global) {
  "use strict";

  const SHUTDOWN=global.MVP_VCS_SHUTDOWN||(typeof require==="function"?require("./vcs-shutdown"):null);
  const RULE_VERSION = "huawei-bar300-log-v3";
  const CHUNK_BYTES = 1024 * 1024;
  const MAX_LINE = 8192;
  const BOOT_WINDOW_MS = 10 * 60 * 1000;
  const MAX_PLAUSIBLE_GAP_MS = 10 * 365 * 24 * 60 * 60 * 1000;
  const ACTIVITY_LINE = /^\[(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(?:\.\d{1,6})?[^\]\r\n]{0,8}\]\[[^\]\r\n]{1,32}\]\[[^\]\r\n]{1,32}\]\s+(LOG_MOD_[A-Z0-9_]{2,32})\b/;
  const BOOT_LINE = /^\[(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d)(?:\.\d{1,6})?[^\]\r\n]{0,8}\]\[[^\]\r\n]{1,32}\]\[[^\]\r\n]{1,32}\]\s+LOG_MOD_MC\b.{0,512}\bsystem\s+boot\b/i;
  const ACTION_FAILURE = /\b(?:fail|failed|error|denied)\b/i;

  function localTimeValue(raw) {
    const parts = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(raw || "");
    if (!parts) return null;
    const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
    const value = Date.UTC(year, month - 1, day, hour, minute, second);
    const date = new Date(value);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      && date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second ? value : null;
  }

  function isLogPrefix(prefix) {
    return /^\uFEFF?\s*<\?xml\b[\s\S]{0,512}<LogModule(?:\s|>)/i.test(String(prefix || ""));
  }

  function collector() {
    let pending = "";
    let dropping = false;
    let tail = "";
    const markers = [];
    const activityTimes = [];
    const coverage = { lines: 0, oversizedLines: 0, malformedCandidates: 0 };
    let lastActivityMs = null;
    let lastActivityStamp = null;
    function process(raw) {
      coverage.lines += 1;
      const line = raw.replace(/\r$/, "");
      if (dropping || line.length > MAX_LINE) { coverage.oversizedLines += 1; dropping = false; return; }
      const activity = ACTIVITY_LINE.exec(line);
      if (activity) {
        const stamp = `${activity[1]} ${activity[2]}`;
        if (stamp !== lastActivityStamp && !line.includes("\uFFFD")) {
          lastActivityStamp = stamp;
          const at = localTimeValue(stamp);
          if (at !== null && at !== lastActivityMs) { activityTimes.push(at); lastActivityMs = at; }
        }
      }
      const bootCandidate = /\bsystem\s+boot\b/i.test(line);
      const shutdownCandidate = activity&&SHUTDOWN?.isTerminalShutdown(line.slice(activity[0].length));
      if (!bootCandidate && !shutdownCandidate) return;
      const boot = bootCandidate ? BOOT_LINE.exec(line) : null;
      if (bootCandidate && !boot) { coverage.malformedCandidates += 1; return; }
      if (!activity || line.includes("\uFFFD")) { coverage.malformedCandidates += 1; return; }
      const localAt = `${activity[1]} ${activity[2]}`;
      const timeMs = localTimeValue(localAt);
      if (timeMs === null) { coverage.malformedCandidates += 1; return; }
      if (boot) markers.push({ kind: "system_boot", localAt, timeMs, lineNumber: coverage.lines });
      if (shutdownCandidate && !ACTION_FAILURE.test(line.slice(activity[0].length))) markers.push({ kind: activity[3]==="LOG_MOD_WEB"?"web_shutdown_command":"terminal_shutdown_command", localAt, timeMs, lineNumber: coverage.lines,method:activity[3]==="LOG_MOD_WEB"?"web":"unknown" });
    }
    return {
      feed(text) {
        const nextTail = tail + text, trimmedTail = nextTail.trimEnd();
        tail = (trimmedTail + (trimmedTail.length < nextTail.length ? " " : "")).slice(-2048);
        const parts = (pending + text).split("\n");
        pending = parts.pop() || "";
        for (const line of parts) process(line);
        if (pending.length > MAX_LINE) { pending = ""; dropping = true; }
      },
      finish() {
        if (pending && !dropping) process(pending);
        else if (dropping) coverage.oversizedLines += 1;
        if (!/<\/LogModule>\s*$/.test(tail)) return { ok: false, reason: "incomplete_log", markers: [], coverage, bootGaps: [] };
        activityTimes.sort((a, b) => a - b);
        let uniqueCount = 0;
        for (let index = 0; index < activityTimes.length; index += 1) {
          if (!uniqueCount || activityTimes[index] !== activityTimes[uniqueCount - 1]) activityTimes[uniqueCount++] = activityTimes[index];
        }
        activityTimes.length = uniqueCount;
        const sorted = activityTimes;
        const bootGaps = [];
        for (const boot of markers.filter((item) => item.kind === "system_boot")) {
          let low = 0; let high = sorted.length;
          while (low < high) { const middle = (low + high) >>> 1; if (sorted[middle] < boot.timeMs) low = middle + 1; else high = middle; }
          let best = null;
          for (let index = low - 1; index >= 0 && sorted[index + 1] >= boot.timeMs - BOOT_WINDOW_MS; index -= 1) {
            const fromMs = sorted[index]; const toMs = sorted[index + 1];
            if (toMs > boot.timeMs || toMs <= fromMs) continue;
            if (!best || toMs - fromMs > best.toMs - best.fromMs) best = { fromMs, toMs };
          }
          if (!best) continue;
          const seconds = Math.round((best.toMs - best.fromMs) / 1000);
          bootGaps.push({ bootLocalAt: boot.localAt, gapSeconds: seconds, gapMinutes: Math.round(seconds / 6) / 10,
            fromLocalAt: new Date(best.fromMs).toISOString().slice(0, 19).replace("T", " "),
            toLocalAt: new Date(best.toMs).toISOString().slice(0, 19).replace("T", " "),
            knownAction: markers.some((item) => ["web_shutdown_command","terminal_shutdown_command"].includes(item.kind) && item.timeMs >= best.fromMs - 120000 && item.timeMs <= boot.timeMs),
            clockAnomalyOrLongGap: best.toMs - best.fromMs > MAX_PLAUSIBLE_GAP_MS });
        }
        return { ok: true, markers, coverage, bootGaps };
      }
    };
  }

  function scanText(text) {
    if (!isLogPrefix(String(text).slice(0, 2048))) return { ok: false, reason: "unsupported_log_format", markers: [], coverage: null, bootGaps: [] };
    const parser = collector();
    parser.feed(String(text));
    return parser.finish();
  }

  async function scanFile(file, options) {
    if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.slice !== "function") return { ok: false, reason: "invalid_file", markers: [], coverage: null, bootGaps: [] };
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const prefix = decoder.decode(new Uint8Array(await file.slice(0, 2048).arrayBuffer()));
    if (!isLogPrefix(prefix)) return { ok: false, reason: "unsupported_log_format", markers: [], coverage: null, bootGaps: [] };
    const parser = collector();
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      if (options?.shouldCancel?.()) throw new Error("log_scan_cancelled");
      const end = Math.min(file.size, offset + CHUNK_BYTES);
      const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
      parser.feed(decoder.decode(bytes, { stream: true }));
      await options?.onProgress?.(end, file.size, bytes);
    }
    if (options?.shouldCancel?.()) throw new Error("log_scan_cancelled");
    parser.feed(decoder.decode());
    return parser.finish();
  }

  function deriveEvents(markers) {
    const starts = (markers || []).filter((item) => item.kind === "system_boot").sort((a, b) => a.timeMs - b.timeMs || a.lineNumber - b.lineNumber);
    const shutdowns = (markers || []).filter((item) => ["web_shutdown_command","terminal_shutdown_command"].includes(item.kind)).sort((a, b) => a.timeMs - b.timeMs || a.lineNumber - b.lineNumber);
    const unique = new Map();
    for (let index = 0; index < starts.length; index += 1) {
      const marker = starts[index];
      const previousBoot = index ? starts[index - 1].timeMs : -Infinity;
      const action = SHUTDOWN?.preceding(shutdowns,marker.timeMs,previousBoot);
      const key = `start|${marker.localAt}`;
      if (!unique.has(key) || (action && unique.get(key).kind === "unknown_start")) unique.set(key, {
        kind: action ? "start_after_shutdown" : "unknown_start", localAt: marker.localAt, timeMs: marker.timeMs,
        lineNumber: marker.lineNumber, markerLineNumbers: action ? [action.lineNumber] : [], method: action ? action.method||"web" : null });
    }
    for (const marker of shutdowns) {
      const key = `power_off|${marker.localAt}`;
      if (!unique.has(key)) unique.set(key, { kind: "power_off", localAt: marker.localAt, timeMs: marker.timeMs,
        lineNumber: marker.lineNumber, markerLineNumbers: [], method: marker.method||"web" });
      else if(unique.get(key).method==="unknown"&&marker.method&&marker.method!=="unknown")unique.get(key).method=marker.method;
    }
    return [...unique.values()].sort((a, b) => b.timeMs - a.timeMs || a.lineNumber - b.lineNumber);
  }

  const api = Object.freeze({ RULE_VERSION, SHUTDOWN_RULESET:SHUTDOWN?.RULESET, isLogPrefix, scanText, scanFile, deriveEvents });
  if (typeof module === "object" && module.exports) module.exports = api;
  global.MVP_HUAWEI_300_LOG_EVENTS = api;
})(typeof window !== "undefined" ? window : globalThis);
