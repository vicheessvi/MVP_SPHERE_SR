(function (global) {
  "use strict";

  const SHUTDOWN=global.MVP_VCS_SHUTDOWN||(typeof require==="function"?require("./vcs-shutdown"):null);
  const RULE_VERSION = "huawei-bar310-log-v3";
  const CHUNK_BYTES = 1024 * 1024;
  const MAX_LINE = 8192;
  const REBOOT_WINDOW_MS = 3 * 60 * 1000;
  const STAMP = /\b(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)\b/;
  const WEB_REBOOT = /\bweb\b.{0,80}\buser\b.{0,120}\breboot\s+terminal\b.{0,100}\bsuccess\b/i;
  const WEB_SHUTDOWN = /\bweb\b.{0,80}\buser\b.{0,120}\bshut\b.{0,80}\bdown\b.{0,80}\bterminal\b/i;
  const REMOTE_POWER_BUTTON = /\bremote\b.{0,80}\bcontrol\b.{0,80}\bpower\b.{0,40}\bbutton\b/i;
  const REMOTE_SHUTDOWN = /\buser\b.{0,80}\bshut\b.{0,80}\bdown\b.{0,80}\bterminal\b/i;
  const SYSTEM_BOOT = /\bsystem\s+boot\b/i;
  const REMOTE_BUTTON_WINDOW_MS = 30 * 1000;
  const REMOTE_SHUTDOWN_WINDOW_MS = 10 * 1000;
  const START_AFTER_SHUTDOWN_MS = 10 * 60 * 1000;
  const BOOT_WINDOW_MS = 10 * 60 * 1000;
  const MAX_PLAUSIBLE_GAP_MS = 10 * 365 * 24 * 60 * 60 * 1000;

  function localTimeValue(raw) {
    const match = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(raw || "");
    if (!match) return null;
    const parts = match.slice(1).map(Number);
    const value = Date.UTC(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
    const date = new Date(value);
    return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2]
      && date.getUTCHours() === parts[3] && date.getUTCMinutes() === parts[4] && date.getUTCSeconds() === parts[5] ? value : null;
  }

  function isLogPrefix(text) {
    return /^\uFEFF?\s*<\?xml\b[\s\S]{0,512}<LogModule(?:\s|>)/i.test(String(text || ""));
  }

  function collector(requireComplete=false) {
    let pending = "",tail="";
    let dropping = false;
    const markers = [];
    const activityTimes = [];
    const coverage = { lines: 0, oversizedLines: 0, malformedCandidates: 0 };
    let lastActivityMs = null;
    let lastActivityStamp = null;
    let stampMs = null;
    function process(raw) {
      coverage.lines += 1;
      const line = raw.replace(/\r$/, "");
      if (dropping || line.length > MAX_LINE) { coverage.oversizedLines += 1; dropping = false; return; }
      const activityStamp = STAMP.exec(line);
      const localAt = activityStamp ? `${activityStamp[1]} ${activityStamp[2]}` : null;
      if (localAt && localAt !== lastActivityStamp) { lastActivityStamp = localAt; stampMs = localTimeValue(localAt); }
      if (localAt && stampMs !== null && stampMs !== lastActivityMs && !line.includes("\uFFFD")) { activityTimes.push(stampMs); lastActivityMs = stampMs; }
      const shutdownCandidate=/\bshut[ \t]+down\b/i.test(line);
      const body=shutdownCandidate?(activityStamp?line.slice(activityStamp.index+activityStamp[0].length).replace(/^\]?\[[^\]\r\n]{1,32}\]\[[^\]\r\n]{1,32}\]\s+LOG_MOD_[A-Z0-9_]+\s+\d+\s*/,""):line):"";
      const terminalShutdown=shutdownCandidate&&SHUTDOWN?.isTerminalShutdown(body)===true;
      const candidate = WEB_REBOOT.test(line) || terminalShutdown || REMOTE_POWER_BUTTON.test(line) || SYSTEM_BOOT.test(line);
      if (!candidate) return;
      const timeMs = localAt ? stampMs : null;
      if (timeMs === null || line.includes("\uFFFD")) { coverage.malformedCandidates += 1; return; }
      if (WEB_REBOOT.test(line) && !/\b(?:fail|failed|error|denied)\b/i.test(line)) markers.push({ kind: "web_reboot_command", localAt, timeMs, lineNumber: coverage.lines });
      const webChannel=WEB_SHUTDOWN.test(line)||/\bLOG_MOD_WEB\b/.test(line);
      if (terminalShutdown && webChannel) markers.push({ kind: "web_shutdown_command", localAt, timeMs, lineNumber: coverage.lines,method:"web" });
      if (terminalShutdown && !webChannel) markers.push({ kind: "terminal_shutdown_command", localAt, timeMs, lineNumber: coverage.lines,method:"unknown" });
      if (REMOTE_POWER_BUTTON.test(line)) markers.push({ kind: "remote_power_button", localAt, timeMs, lineNumber: coverage.lines });
      if (terminalShutdown && REMOTE_SHUTDOWN.test(line) && !WEB_SHUTDOWN.test(line)) markers.push({ kind: "remote_shutdown_command", localAt, timeMs, lineNumber: coverage.lines });
      if (SYSTEM_BOOT.test(line)) markers.push({ kind: "system_boot", localAt, timeMs, lineNumber: coverage.lines });
    }
    return {
      feed(text) {
        const nextTail = tail + text, trimmedTail = nextTail.trimEnd();
        tail = (trimmedTail + (trimmedTail.length < nextTail.length ? " " : "")).slice(-512);
        const parts = (pending + text).split("\n");
        pending = parts.pop() || "";
        for (const line of parts) process(line);
        if (pending.length > MAX_LINE) { pending = ""; dropping = true; }
      },
      finish() {
        if (pending && !dropping) process(pending);
        else if (dropping) coverage.oversizedLines += 1;
        if(requireComplete&&!/<\/LogModule>\s*$/.test(tail))return {ok:false,reason:"incomplete_log",markers:[],coverage,bootGaps:[]};
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
          const knownAction = markers.some((item) => ["web_reboot_command", "web_shutdown_command", "terminal_shutdown_command", "remote_power_button", "remote_shutdown_command"].includes(item.kind)
            && item.timeMs >= best.fromMs - 120000 && item.timeMs <= boot.timeMs);
          bootGaps.push({ bootLocalAt: boot.localAt, gapSeconds: Math.round((best.toMs - best.fromMs) / 1000),
            gapMinutes: Math.round((best.toMs - best.fromMs) / 6000) / 10,
            fromLocalAt: new Date(best.fromMs).toISOString().slice(0, 19).replace("T", " "),
            toLocalAt: new Date(best.toMs).toISOString().slice(0, 19).replace("T", " "),
            knownAction, clockAnomalyOrLongGap: best.toMs - best.fromMs > MAX_PLAUSIBLE_GAP_MS });
        }
        return { markers, coverage, bootGaps };
      }
    };
  }

  function scanText(text) {
    if (!isLogPrefix(String(text).slice(0, 2048))) return { ok: false, reason: "unsupported_log_format", markers: [], coverage: null };
    const parser = collector();
    parser.feed(String(text));
    return { ok: true, ...parser.finish() };
  }

  async function scanFile(file, options) {
    if (!file || !Number.isSafeInteger(file.size) || file.size < 0 || typeof file.slice !== "function") return { ok: false, reason: "invalid_file", markers: [], coverage: null };
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const prefix = decoder.decode(new Uint8Array(await file.slice(0, 2048).arrayBuffer()));
    if (!isLogPrefix(prefix)) return { ok: false, reason: "unsupported_log_format", markers: [], coverage: null };
    const parser = collector(true);
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      if (options?.shouldCancel?.()) throw new Error("log_scan_cancelled");
      const end = Math.min(file.size, offset + CHUNK_BYTES);
      const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
      parser.feed(decoder.decode(bytes, { stream: true }));
      await options?.onProgress?.(end, file.size, bytes);
    }
    if (options?.shouldCancel?.()) throw new Error("log_scan_cancelled");
    parser.feed(decoder.decode());
    return { ok: true, ...parser.finish() };
  }

  function deriveEvents(markers) {
    const commands = (markers || []).filter((item) => item.kind === "web_reboot_command").sort((a, b) => a.timeMs - b.timeMs);
    const buttons = (markers || []).filter((item) => item.kind === "remote_power_button").sort((a, b) => a.timeMs - b.timeMs);
    const shutdowns = (markers || []).filter((item) => item.kind === "remote_shutdown_command");
    const webShutdowns = (markers || []).filter((item) => item.kind === "web_shutdown_command");
    const terminalShutdowns=(markers||[]).filter(item=>item.kind==="terminal_shutdown_command");
    const starts = (markers || []).filter((item) => item.kind === "system_boot").sort((a, b) => a.timeMs - b.timeMs);
    const used = new Set();
    const usedButtons = new Set();
    const allShutdowns=[...webShutdowns,...terminalShutdowns].sort((a,b)=>a.timeMs-b.timeMs);
    const events = starts.map((start,startIndex) => {
      let command = null;
      for (let index = commands.length - 1; index >= 0; index -= 1) {
        const item = commands[index];
        if (!used.has(index) && item.timeMs <= start.timeMs && start.timeMs - item.timeMs <= REBOOT_WINDOW_MS) { command = item; used.add(index); break; }
      }
      const prior=SHUTDOWN?.preceding(allShutdowns,start.timeMs,startIndex?starts[startIndex-1].timeMs:-Infinity);
      if(prior&&(!command||command.timeMs<=prior.timeMs))return {kind:"start_after_shutdown",localAt:start.localAt,timeMs:start.timeMs,lineNumber:start.lineNumber,markerLineNumbers:[prior.lineNumber],method:prior.method||"unknown"};
      if (command) return { kind: "confirmed_reboot", localAt: start.localAt, timeMs: start.timeMs, lineNumber: start.lineNumber, markerLineNumbers: [command.lineNumber], method: "web" };
      for (let right = buttons.length - 1; right >= 1; right -= 1) {
        const second = buttons[right];
        if (usedButtons.has(right) || second.timeMs > start.timeMs || start.timeMs - second.timeMs > REBOOT_WINDOW_MS) continue;
        for (let left = right - 1; left >= 0; left -= 1) {
          const first = buttons[left];
          if (second.timeMs - first.timeMs > REMOTE_BUTTON_WINDOW_MS) break;
          if (usedButtons.has(left)) continue;
          if (first.timeMs === second.timeMs || shutdowns.some((item) => item.timeMs >= first.timeMs && item.timeMs <= start.timeMs)) continue;
          usedButtons.add(left); usedButtons.add(right);
          return { kind: "confirmed_reboot", localAt: start.localAt, timeMs: start.timeMs, lineNumber: start.lineNumber, markerLineNumbers: [first.lineNumber, second.lineNumber], method: "remote_control" };
        }
      }
      const recentWebShutdown = webShutdowns.filter((item) => item.timeMs <= start.timeMs && start.timeMs - item.timeMs <= START_AFTER_SHUTDOWN_MS).at(-1);
      const recentRemoteShutdown = shutdowns.filter((item) => item.timeMs <= start.timeMs && start.timeMs - item.timeMs <= START_AFTER_SHUTDOWN_MS
        && buttons.some((button) => button.timeMs <= item.timeMs && item.timeMs - button.timeMs <= REMOTE_SHUTDOWN_WINDOW_MS)).at(-1);
      const priorShutdown = [recentWebShutdown, recentRemoteShutdown].filter(Boolean).sort((a, b) => b.timeMs - a.timeMs)[0];
      if (priorShutdown) return { kind: "start_after_shutdown", localAt: start.localAt, timeMs: start.timeMs, lineNumber: start.lineNumber, markerLineNumbers: [priorShutdown.lineNumber] };
      return { kind: "unknown_start", localAt: start.localAt, timeMs: start.timeMs, lineNumber: start.lineNumber, markerLineNumbers: [] };
    });
    for (const item of webShutdowns) {
      events.push({ kind: "power_off", localAt: item.localAt, timeMs: item.timeMs, lineNumber: item.lineNumber, markerLineNumbers: [], method: "web" });
    }
    for(const item of terminalShutdowns)events.push({kind:"power_off",localAt:item.localAt,timeMs:item.timeMs,lineNumber:item.lineNumber,markerLineNumbers:[],method:"unknown"});
    for (const item of shutdowns) {
      const button = buttons.filter((candidate) => candidate.timeMs <= item.timeMs && item.timeMs - candidate.timeMs <= REMOTE_SHUTDOWN_WINDOW_MS).at(-1);
      if (button) events.push({ kind: "power_off", localAt: item.localAt, timeMs: item.timeMs, lineNumber: item.lineNumber, markerLineNumbers: [button.lineNumber], method: "remote_control" });
    }
    const unique=new Map(),priority={unknown_start:0,start_after_shutdown:1,confirmed_reboot:2,power_off:2};
    for(const item of events){const key=`${item.kind==="power_off"?"off":"start"}|${item.localAt}`,prior=unique.get(key);
      if(!prior||priority[item.kind]>priority[prior.kind]||item.kind==="power_off"&&prior.method==="unknown"&&item.method!=="unknown")unique.set(key,item);}
    return [...unique.values()].sort((a,b)=>b.timeMs-a.timeMs);
  }

  const api = Object.freeze({ RULE_VERSION, SHUTDOWN_RULESET:SHUTDOWN?.RULESET, isLogPrefix, scanText, scanFile, deriveEvents });
  if (typeof module === "object" && module.exports) module.exports = api;
  global.MVP_HUAWEI_310_LOG_EVENTS = api;
})(typeof window !== "undefined" ? window : globalThis);
