"use strict";

const https = require("https");
const { normalizeIpv4 } = require("./credential-vault");

const RESOURCE_ALIASES = Object.freeze({
  modelName: ["modelName", "modelname"],
  partNumber: ["partNumber", "partnumber", "partnum"],
  fwVersion: ["fwVersion", "firmwareVersion"],
  serialNumber: ["serialNumber"],
  hostName: ["hostName", "hostname"],
  temperature: ["temperature"],
  timeZone: ["timeZone", "timezone"],
  date: ["date", "systemDate"],
  uptime: ["uptime"],
  poeStatus: ["poeStatus"],
  poeSupport: ["poeSupport"],
  controllerType: ["controllerType"],
  controllerConfig: ["controllerConfig", "controllerconfig"],
  gvHost: ["gvHost", "isgvhost"],
  connectedDevices: ["connectedDevices", "systemdevs"],
  tlpProject: ["tlpProject"],
  dhcp: ["dhcp"],
  dnsServers: ["dnsServers", "dnsservers"],
  dnsSuffix: ["dnsSuffix"],
  linkLocal: ["linkLocal"],
  macAddress: ["macAddress", "macaddress"],
  isg: ["isg"],
  allLan: ["allLan", "lanSettings"]
});

const BUNDLE_MARKERS = Object.freeze(["serialNumber:", "this.unitInfo", "this.connectedDevices", "controllerConfig", "macAddress"]);
const SAFE_TRANSPORT_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT"]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSafeResourceUri(value) {
  return /^\/[A-Za-z0-9_-]{16,}={0,2}$/.test(String(value || ""));
}

function candidatesNearAlias(source, alias) {
  const escaped = escapeRegExp(alias);
  const path = "(\\/[A-Za-z0-9_-]{16,}={0,2})";
  const collect = (pattern) => {
    const results = new Set();
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const candidate = match[1];
      if (isSafeResourceUri(candidate)) results.add(candidate);
      if (results.size > 1) break;
    }
    return [...results];
  };
  const forward = collect(new RegExp(`(?:["']${escaped}["']|\\b${escaped}\\b)[\\s\\S]{0,360}?["']${path}["']`, "gi"));
  if (forward.length) return forward;
  return collect(new RegExp(`["']${path}["'][\\s\\S]{0,360}?(?:["']${escaped}["']|\\b${escaped}\\b)`, "gi"));
}

function extractResourceUris(bundleText) {
  const source = String(bundleText || "");
  const markers = BUNDLE_MARKERS.filter((marker) => source.includes(marker));
  const resources = {};
  Object.entries(RESOURCE_ALIASES).forEach(([key, aliases]) => {
    const candidates = new Set();
    aliases.forEach((alias) => candidatesNearAlias(source, alias).forEach((uri) => candidates.add(uri)));
    if (candidates.size === 1) resources[key] = [...candidates][0];
  });
  return { markers, resources };
}

function safeTransportError(error) {
  const code = error && SAFE_TRANSPORT_CODES.has(error.code) ? error.code.toLowerCase() : "transport_failed";
  return code;
}

function nativeHttpsRequest(options) {
  const settings = options || {};
  const ip = normalizeIpv4(settings.ip);
  if (!ip) return Promise.reject(Object.assign(new Error("invalid target"), { code: "INVALID_TARGET" }));
  const requestPath = String(settings.path || "");
  if (!requestPath.startsWith("/") || requestPath.includes("\r") || requestPath.includes("\n")) {
    return Promise.reject(Object.assign(new Error("invalid path"), { code: "INVALID_PATH" }));
  }
  const timeoutMs = Math.max(500, Math.min(Number(settings.timeoutMs) || 7000, 30000));
  const maxBytes = Math.max(1024, Math.min(Number(settings.maxBytes) || 8 * 1024 * 1024, 16 * 1024 * 1024));
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: ip,
      port: 443,
      method: settings.method || "GET",
      path: requestPath,
      headers: settings.headers || {},
      rejectUnauthorized: settings.rejectUnauthorized !== false,
      timeout: timeoutMs,
      agent: false
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          request.destroy(Object.assign(new Error("response too large"), { code: "RESPONSE_TOO_LARGE" }));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        statusCode: Number(response.statusCode) || 0,
        headers: response.headers || {},
        body: Buffer.concat(chunks).toString("utf8")
      }));
    });
    request.once("timeout", () => request.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    request.once("error", reject);
    if (settings.body) request.write(settings.body);
    request.end();
  });
}

function sessionCookie(headers) {
  const values = headers && headers["set-cookie"];
  const cookies = Array.isArray(values) ? values : values ? [values] : [];
  for (const value of cookies) {
    const match = String(value).match(/(?:^|;\s*)(NortxeSession=[^;\r\n]+)/i);
    if (match) return match[1];
  }
  return null;
}

function parseResourceBody(body) {
  try { return { ok: true, value: JSON.parse(String(body || "")) }; }
  catch { return { ok: false, safeError: "resource_json_invalid" }; }
}

function unwrapResource(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && ["value", "data", "result"].includes(keys[0])) return value[keys[0]];
  }
  return value;
}

function normalizedKey(value) {
  return String(value || "").toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
}

function deepFind(value, aliases, seen) {
  if (!value || typeof value !== "object") return undefined;
  const visited = seen || new Set();
  if (visited.has(value)) return undefined;
  visited.add(value);
  const aliasKeys = new Set(aliases.map(normalizedKey));
  for (const [key, child] of Object.entries(value)) if (aliasKeys.has(normalizedKey(key))) return child;
  for (const child of Object.values(value)) {
    const found = deepFind(child, aliases, visited);
    if (found !== undefined) return found;
  }
  return undefined;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function formatDhcp(value) {
  if (value === true || value === 1 || /^(on|true|enabled|yes|1)$/i.test(String(value))) return "On";
  if (value === false || value === 0 || /^(off|false|disabled|no|0)$/i.test(String(value))) return "Off";
  return value;
}

function formatUptime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return value;
  const whole = Math.floor(seconds);
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return `${days ? `${days}d ` : ""}${hours}h ${minutes}m ${secs}s`;
}

function firmwareProjection(rawValue) {
  const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
  if (typeof value !== "string") return value === undefined ? {} : { Version: value };
  const version = value.split("*(", 1)[0].trim();
  const dateMatch = value.match(/-\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),.+?UTC)\)?\s*$/i);
  return { Version: version || value, ...(dateMatch ? { "Last Updated": dateMatch[1].trim() } : {}), Raw: value };
}

function projectVersion(value) {
  const text = String(value || "");
  return /^\d+\.\d+\.\d+\.0$/.test(text) ? text.slice(0, -2) : value;
}

function buildWebBlocks(values, ip) {
  const lanSource = values.allLan && typeof values.allLan === "object" ? values.allLan : {};
  const tlp = values.tlpProject && typeof values.tlpProject === "object" ? values.tlpProject : {};
  const config = values.controllerConfig && typeof values.controllerConfig === "object"
    ? values.controllerConfig
    : (deepFind(tlp, ["controllerconfig"]) || {});
  const connected = Array.isArray(values.connectedDevices)
    ? values.connectedDevices
    : (Array.isArray(deepFind(tlp, ["systemdevs", "connecteddevices"])) ? deepFind(tlp, ["systemdevs", "connecteddevices"]) : []);
  const uptimeSeconds = Number(values.uptime);
  const projectInfo = {
    Project: firstDefined(config.filename, deepFind(tlp, ["filename"])),
    Version: projectVersion(firstDefined(config.projfilevers, config.version)),
    "Creation Date": firstDefined(config.cdate, config.creationdate),
    "Revision Date": firstDefined(config.rdate, config.revisiondate),
    "Saved with": config.cfgappvers ? `${config.cfgapp || "GS"} ${config.cfgappvers}` : config.cfgapp,
    "Target Firmware": firstDefined(config.targetfw, config.targetfirmware),
    Author: config.author,
    "Controller Type": values.controllerType,
    "GV Host": values.gvHost,
    "Connected Devices": connected,
    "TLP Project": Object.keys(tlp).length ? tlp : undefined
  };
  const lan = {
    DHCP: formatDhcp(firstDefined(values.dhcp, deepFind(lanSource, ["dhcp"]))),
    "Host Name": firstDefined(values.hostName, deepFind(lanSource, ["hostname"]), deepFind(tlp, ["hostname"])),
    "IP Address": firstDefined(deepFind(lanSource, ["ipaddress", "ip"]), ip),
    "Subnet Mask": deepFind(lanSource, ["subnetmask", "subnet"]),
    Gateway: deepFind(lanSource, ["gateway"]),
    "DNS Server": firstDefined(values.dnsServers, deepFind(lanSource, ["dnsservers", "dnsserver"]), []),
    "MAC Address": firstDefined(values.macAddress, deepFind(lanSource, ["macaddress", "mac"]), deepFind(tlp, ["macaddress"])),
    "Link Status": deepFind(lanSource, ["linkstatus"]),
    Ports: deepFind(lanSource, ["ports"])
  };
  const deviceInfo = {
    Model: values.modelName,
    "Part Number": values.partNumber,
    "Serial Number": values.serialNumber,
    "Host Name": lan["Host Name"],
    Hardware: deepFind(lanSource, ["hardware", "unitinfo"])
  };
  const status = {
    Date: values.date,
    Time: values.date,
    "Time Zone": values.timeZone,
    Uptime: formatUptime(values.uptime),
    "Uptime Seconds": Number.isFinite(uptimeSeconds) ? uptimeSeconds : undefined,
    PoE: firstDefined(values.poeStatus, values.poeSupport),
    Temperature: values.temperature
  };
  const gui = connected.flatMap((device) => {
    const pages = Array.isArray(device && device.vtlpweb) ? device.vtlpweb : [];
    return pages.filter((page) => page && typeof page.url === "string" && !page.url.includes("://") && !page.url.startsWith("/")).map((page) => ({
      device: device.name || device.modelname,
      addr: device.addr,
      gui: `https://${ip}/${page.url.replace(/^\/+/, "")}`,
      status: "Требует отдельной проверки доступности"
    }));
  });
  const compact = (object) => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
  return {
    "Device Info": compact(deviceInfo),
    Firmware: compact(firmwareProjection(values.fwVersion)),
    "Project Info": compact(projectInfo),
    "Device Status": compact(status),
    "LAN Settings": compact(lan),
    GUI: gui
  };
}

async function pollExtronDevice(device, credential, options) {
  const settings = options || {};
  const request = settings.request || nativeHttpsRequest;
  const ip = normalizeIpv4(device && (device.ipNormalized || device.ip));
  const capturedAt = new Date((settings.now ? settings.now() : Date.now())).toISOString();
  const base = {
    ip,
    capturedAt,
    ok: false,
    failedStage: null,
    loginAttempts: [],
    successfulCredential: null,
    vendorPolling: { status: "supported", contract: "extron-web-dynamic-resources-v1" }
  };
  if (!ip) return { ...base, failedStage: "validation", safeError: "invalid_or_forbidden_ip" };
  if (!credential || !credential.username || !credential.password) return { ...base, failedStage: "credentials", safeError: "credential_missing" };
  const rejectUnauthorized = !(device.allowInsecureTls === true || settings.allowInsecureTls === true);
  const timeoutMs = settings.timeoutMs;
  let cookie = null;
  try {
    const authorization = Buffer.from(`${credential.username}:${credential.password}`, "utf8").toString("base64");
    const login = await request({ ip, method: "POST", path: `/api/login?rnd=${Number(settings.now ? settings.now() : Date.now())}`, headers: { Authorization: `Basic ${authorization}`, "Content-Length": "0" }, body: "", rejectUnauthorized, timeoutMs, maxBytes: 1024 * 1024 });
    cookie = sessionCookie(login.headers);
    const loginOk = login.statusCode >= 200 && login.statusCode < 300 && Boolean(cookie);
    base.loginAttempts.push({ username: String(credential.username), ok: loginOk });
    if (!loginOk) return { ...base, failedStage: "authorization", safeError: "authorization_failed" };
    base.successfulCredential = { username: String(credential.username) };
  } catch (error) {
    base.loginAttempts.push({ username: String(credential.username), ok: false });
    return { ...base, failedStage: "login", safeError: safeTransportError(error) };
  }

  let discovery;
  try {
    const bundle = await request({ ip, method: "GET", path: "/www/main.js", headers: { Cookie: cookie }, rejectUnauthorized, timeoutMs, maxBytes: 8 * 1024 * 1024 });
    if (bundle.statusCode !== 200) return { ...base, failedStage: "bundle", safeError: "web_bundle_unavailable" };
    discovery = extractResourceUris(bundle.body);
    if (discovery.markers.length < 1 || Object.keys(discovery.resources).length < 2) {
      return { ...base, failedStage: "adapter", safeError: "unsupported_web_contract", webInterface: { ok: false, evidence: "confirmed_resource_contract_not_found", markerCount: discovery.markers.length } };
    }
  } catch (error) {
    return { ...base, failedStage: "bundle", safeError: safeTransportError(error) };
  }

  const values = {};
  const resourceErrors = {};
  for (const [key, uri] of Object.entries(discovery.resources)) {
    try {
      const response = await request({ ip, method: "GET", path: `/api/swis/resource${uri}`, headers: { Cookie: cookie }, rejectUnauthorized, timeoutMs, maxBytes: 8 * 1024 * 1024 });
      if (response.statusCode !== 200) { resourceErrors[key] = `http_${response.statusCode}`; continue; }
      const parsed = parseResourceBody(response.body);
      if (!parsed.ok) { resourceErrors[key] = parsed.safeError; continue; }
      const value = unwrapResource(parsed.value);
      if (value && typeof value === "object" && !Array.isArray(value) && typeof value.error === "string") {
        resourceErrors[key] = value.error;
        values[key] = value;
      } else values[key] = value;
    } catch (error) { resourceErrors[key] = safeTransportError(error); }
  }
  const webBlocks = buildWebBlocks(values, ip);
  const identityEvidence = [values.modelName, values.serialNumber, values.fwVersion, values.macAddress].filter((value) => value !== undefined).length;
  if (identityEvidence === 0) {
    return { ...base, failedStage: "resources", safeError: "resource_schema_unconfirmed", webInterface: { ok: true, evidence: "Extron web UI markers and dynamic resources found", markers: discovery.markers }, diagnostics: { discoveredResourceKeys: Object.keys(discovery.resources), resourceErrors } };
  }
  return {
    ...base,
    ok: true,
    webInterface: { ok: true, evidence: "Extron web UI markers and dynamic resources found", markers: discovery.markers, insecureTls: !rejectUnauthorized },
    webBlocks,
    readMode: "targeted",
    diagnostics: { discoveredResourceKeys: Object.keys(discovery.resources), resourceErrors }
  };
}

module.exports = {
  BUNDLE_MARKERS,
  RESOURCE_ALIASES,
  buildWebBlocks,
  extractResourceUris,
  isSafeResourceUri,
  nativeHttpsRequest,
  pollExtronDevice,
  sessionCookie
};
