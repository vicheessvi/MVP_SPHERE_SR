(function (global) {
  "use strict";

  const RULE_VERSION = "huawei-te-log-v1";
  const MAX_LINE = 8192;
  const CHUNK_BYTES = 65536;
  const EVENT_LINE = /^\[[^\]\r\n]{1,32}\]\[[^\]\r\n]{1,32}\]\s+(\d{4}-\d\d-\d\d\s+\d\d:\d\d:\d\d)\s+(LOG_MOD_[A-Z0-9_]{2,32})\s+\d{1,8}\s+(.{0,4096})$/;

  function localTimeValue(raw) {
    const parts = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(raw || "");
    if (!parts) return null;
    const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
    const value = Date.UTC(year, month - 1, day, hour, minute, second);
    const date = new Date(value);
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      && date.getUTCHours() === hour && date.getUTCMinutes() === minute && date.getUTCSeconds() === second ? value : null;
  }

  function parseEventLine(rawLine, lineNumber) {
    const line = String(rawLine || "").replace(/\r$/, "");
    if (!line || line.length > MAX_LINE || line.includes("\uFFFD")) return null;
    const match = EVENT_LINE.exec(line);
    if (!match) return null;
    const timeMs = localTimeValue(match[1]);
    if (timeMs === null) return null;
    const module = match[2];
    const message = match[3];
    let kind = null;
    if (module === "LOG_MOD_MC" && /\bsystem\s+start\b/i.test(message)) kind = "system_start";
    else if (module === "LOG_MOD_MC" && /\bnormal\b.{0,80}\breboot\b/i.test(message)) kind = "reboot_marker";
    else if (module === "LOG_MOD_BSP" && /\bterminal\b.{0,50}\bpowered\b.{0,30}\boff\b/i.test(message)) kind = "power_off";
    return kind ? { kind, localAt: match[1], timeMs, lineNumber } : null;
  }

  function collector() {
    const markers = [];
    const coverage = { lines: 0, oversizedLines: 0, malformedCandidates: 0 };
    let pending = "";
    let dropping = false;
    function process(line) {
      coverage.lines += 1;
      if (dropping || line.length > MAX_LINE) { coverage.oversizedLines += 1; dropping = false; return; }
      const marker = parseEventLine(line, coverage.lines);
      if (marker) markers.push(marker);
      else if (/system\s+start|\bnormal\b.{0,80}\breboot\b|terminal.{0,50}powered.{0,30}off/i.test(line)) coverage.malformedCandidates += 1;
    }
    return {
      feed(text) {
        const parts = (pending + text).split("\n");
        pending = parts.pop() || "";
        for (const line of parts) process(line);
        if (pending.length > MAX_LINE) { pending = ""; dropping = true; }
      },
      finish() { if (pending && !dropping) process(pending); else if (dropping) coverage.oversizedLines += 1; return { markers, coverage }; }
    };
  }

  function isHuaweiTeLogPrefix(prefix) {
    return /^\uFEFF?\s*<\?xml\b[\s\S]{0,512}<LogModule(?:\s|>)/i.test(String(prefix || ""));
  }

  function scanText(text) {
    if (!isHuaweiTeLogPrefix(String(text).slice(0, 2048))) return { ok: false, reason: "unsupported_log_format", markers: [], coverage: null };
    const parser = collector();
    parser.feed(String(text));
    return { ok: true, ...parser.finish() };
  }

  async function scanFile(file) {
    if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.slice !== "function") return { ok: false, reason: "invalid_file", markers: [], coverage: null };
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const prefixBytes = new Uint8Array(await file.slice(0, 2048).arrayBuffer());
    if (!isHuaweiTeLogPrefix(decoder.decode(prefixBytes))) return { ok: false, reason: "unsupported_log_format", markers: [], coverage: null };
    const parser = collector();
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      const bytes = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + CHUNK_BYTES)).arrayBuffer());
      parser.feed(decoder.decode(bytes, { stream: true }));
    }
    parser.feed(decoder.decode());
    return { ok: true, ...parser.finish() };
  }

  function deriveEvents(markers) {
    const starts = markers.filter((item) => item.kind === "system_start");
    const reboots = markers.filter((item) => item.kind === "reboot_marker");
    const sortedStarts = [...starts].sort((a, b) => a.timeMs - b.timeMs || a.lineNumber - b.lineNumber);
    const paired = new Map();
    for (const marker of reboots) {
      let low = 0; let high = sortedStarts.length;
      while (low < high) { const middle = (low + high) >>> 1; if (sortedStarts[middle].timeMs < marker.timeMs) low = middle + 1; else high = middle; }
      const nearest = [sortedStarts[low - 1], sortedStarts[low]].filter(Boolean)
        .sort((a, b) => Math.abs(a.timeMs - marker.timeMs) - Math.abs(b.timeMs - marker.timeMs) || a.lineNumber - b.lineNumber)[0];
      if (!nearest || Math.abs(nearest.timeMs - marker.timeMs) > 120000) continue;
      if (!paired.has(nearest.lineNumber)) paired.set(nearest.lineNumber, []);
      paired.get(nearest.lineNumber).push(marker.lineNumber);
    }
    const events = starts.map((start) => {
      const corroborating = paired.get(start.lineNumber) || [];
      return { kind: corroborating.length ? "confirmed_reboot" : "unknown_start", localAt: start.localAt,
        timeMs: start.timeMs, lineNumber: start.lineNumber, markerLineNumbers: corroborating };
    });
    markers.filter((item) => item.kind === "power_off").forEach((item) => events.push({ kind: "power_off", localAt: item.localAt, timeMs: item.timeMs, lineNumber: item.lineNumber, markerLineNumbers: [] }));
    const unique = new Map();
    for (const event of events) {
      const key = `${event.kind === "power_off" ? "power_off" : "start"}|${event.localAt}`;
      const previous = unique.get(key);
      if (!previous || (previous.kind === "unknown_start" && event.kind === "confirmed_reboot")) unique.set(key, event);
    }
    return [...unique.values()].sort((a, b) => b.timeMs - a.timeMs || a.kind.localeCompare(b.kind));
  }

  const api = Object.freeze({ RULE_VERSION, parseEventLine, isHuaweiTeLogPrefix, scanText, scanFile, deriveEvents });
  if (typeof module === "object" && module.exports) module.exports = api;
  global.MVP_HUAWEI_TE_LOG_EVENTS = api;
})(typeof window !== "undefined" ? window : globalThis);
