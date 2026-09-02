"""Confirmed Extron HTTPS dynamic-resource adapter.

No endpoint in this module is speculative: the paths and projection preserve the
contract verified by feature 013.  The request function is injectable so tests
never contact a real device.
"""

from __future__ import annotations

import base64
import http.client
import json
import math
import re
import socket
import ssl
import time
from datetime import datetime, timezone
from typing import Any, Callable


RESOURCE_ALIASES = {
    "modelName": ("modelName", "modelname"),
    "partNumber": ("partNumber", "partnumber", "partnum"),
    "fwVersion": ("fwVersion", "firmwareVersion"),
    "serialNumber": ("serialNumber",),
    "hostName": ("hostName", "hostname"),
    "temperature": ("temperature",),
    "timeZone": ("timeZone", "timezone"),
    "date": ("date", "systemDate"),
    "uptime": ("uptime",),
    "poeStatus": ("poeStatus",),
    "poeSupport": ("poeSupport",),
    "controllerType": ("controllerType",),
    "controllerConfig": ("controllerConfig", "controllerconfig"),
    "gvHost": ("gvHost", "isgvhost"),
    "connectedDevices": ("connectedDevices", "systemdevs"),
    "tlpProject": ("tlpProject",),
    "dhcp": ("dhcp",),
    "dnsServers": ("dnsServers", "dnsservers"),
    "dnsSuffix": ("dnsSuffix",),
    "linkLocal": ("linkLocal",),
    "macAddress": ("macAddress", "macaddress"),
    "isg": ("isg",),
    "allLan": ("allLan", "lanSettings"),
}
BUNDLE_MARKERS = ("serialNumber:", "this.unitInfo", "this.connectedDevices", "controllerConfig", "macAddress")
SAFE_TRANSPORT_CODES = {
    "connection_refused",
    "connection_reset",
    "host_unreachable",
    "network_unreachable",
    "timed_out",
    "certificate_failed",
    "response_too_large",
}
RESOURCE_PATH = re.compile(r"^/[A-Za-z0-9_-]{16,}={0,2}$")
BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/147.0.0.0 Safari/537.36"
)


class ExtronTransportError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code if code in SAFE_TRANSPORT_CODES else "transport_failed"


def _utc_iso(now: Callable[[], float] | None = None) -> str:
    stamp = (now or time.time)()
    return datetime.fromtimestamp(float(stamp), timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def browser_request_headers(ip: str, accept: str = "application/json, text/plain, */*") -> dict[str, str]:
    """Headers required by the confirmed Extron browser login flow."""
    return {
        "Accept": accept,
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"https://{ip}/www/",
        "User-Agent": BROWSER_USER_AGENT,
    }


def is_safe_resource_uri(value: Any) -> bool:
    return bool(RESOURCE_PATH.fullmatch(str(value or "")))


def _candidates_near_alias(source: str, alias: str) -> set[str]:
    escaped = re.escape(alias)
    uri = r"(/[A-Za-z0-9_-]{16,}={0,2})"
    forward = re.compile(rf"(?:[\"']{escaped}[\"']|\b{escaped}\b)[\s\S]{{0,360}}?[\"']{uri}[\"']", re.I)
    reverse = re.compile(rf"[\"']{uri}[\"'][\s\S]{{0,360}}?(?:[\"']{escaped}[\"']|\b{escaped}\b)", re.I)
    candidates = {match.group(1) for match in forward.finditer(source) if is_safe_resource_uri(match.group(1))}
    if candidates:
        return candidates
    return {match.group(1) for match in reverse.finditer(source) if is_safe_resource_uri(match.group(1))}


def extract_resource_uris(bundle_text: Any) -> dict[str, Any]:
    source = str(bundle_text or "")
    resources: dict[str, str] = {}
    for key, aliases in RESOURCE_ALIASES.items():
        candidates: set[str] = set()
        for alias in aliases:
            candidates.update(_candidates_near_alias(source, alias))
        if len(candidates) == 1:
            resources[key] = next(iter(candidates))
    return {"markers": [marker for marker in BUNDLE_MARKERS if marker in source], "resources": resources}


def _transport_code(error: BaseException) -> str:
    if isinstance(error, ExtronTransportError):
        return error.code
    if isinstance(error, (socket.timeout, TimeoutError)):
        return "timed_out"
    if isinstance(error, ssl.SSLCertVerificationError):
        return "certificate_failed"
    if isinstance(error, ConnectionRefusedError):
        return "connection_refused"
    if isinstance(error, ConnectionResetError):
        return "connection_reset"
    return "transport_failed"


def native_https_request(options: dict[str, Any]) -> dict[str, Any]:
    from mvp_runtime.polling import normalize_ipv4

    ip = normalize_ipv4(options.get("ip"))
    path = str(options.get("path") or "")
    if not ip or not path.startswith("/") or "\r" in path or "\n" in path:
        raise ExtronTransportError("transport_failed")
    timeout = max(0.5, min(float(options.get("timeout_ms") or 7000) / 1000, 30.0))
    maximum = max(1024, min(int(options.get("max_bytes") or 8 * 1024 * 1024), 16 * 1024 * 1024))
    context = ssl.create_default_context()
    if options.get("reject_unauthorized") is False:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    connection = http.client.HTTPSConnection(ip, 443, timeout=timeout, context=context)
    try:
        connection.request(
            str(options.get("method") or "GET"),
            path,
            body=options.get("body") or None,
            headers=dict(options.get("headers") or {}),
        )
        response = connection.getresponse()
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = response.read(min(64 * 1024, maximum + 1 - total))
            if not chunk:
                break
            total += len(chunk)
            if total > maximum:
                raise ExtronTransportError("response_too_large")
            chunks.append(chunk)
        return {
            "status_code": int(response.status),
            "headers": response.getheaders(),
            "body": b"".join(chunks).decode("utf-8", errors="replace"),
        }
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        raise ExtronTransportError(_transport_code(error)) from None
    finally:
        connection.close()


def session_cookie(headers: Any) -> str | None:
    values: list[str] = []
    if isinstance(headers, dict):
        raw = headers.get("set-cookie") or headers.get("Set-Cookie")
        values = list(raw) if isinstance(raw, (list, tuple)) else [str(raw)] if raw else []
    elif isinstance(headers, (list, tuple)):
        values = [str(value) for key, value in headers if str(key).casefold() == "set-cookie"]
    for value in values:
        match = re.search(r"(?:^|;\s*)(NortxeSession=[^;\r\n]+)", value, re.I)
        if match:
            return match.group(1)
    return None


def _normalized_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").casefold())


def deep_find(value: Any, aliases: tuple[str, ...] | list[str], seen: set[int] | None = None) -> Any:
    if not isinstance(value, (dict, list)):
        return None
    visited = seen if seen is not None else set()
    if id(value) in visited:
        return None
    visited.add(id(value))
    keys = {_normalized_key(alias) for alias in aliases}
    if isinstance(value, dict):
        for key, child in value.items():
            if _normalized_key(key) in keys:
                return child
        children = value.values()
    else:
        children = value
    for child in children:
        found = deep_find(child, aliases, visited)
        if found is not None:
            return found
    return None


def _first_defined(*values: Any) -> Any:
    return next((value for value in values if value is not None and value != ""), None)


def _format_dhcp(value: Any) -> Any:
    if value is True or value == 1 or re.fullmatch(r"on|true|enabled|yes|1", str(value), re.I):
        return "On"
    if value is False or value == 0 or re.fullmatch(r"off|false|disabled|no|0", str(value), re.I):
        return "Off"
    return value


def _format_uptime(value: Any) -> Any:
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return value
    if not math.isfinite(seconds) or seconds < 0:
        return value
    whole = int(seconds)
    days, remainder = divmod(whole, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{f'{days}d ' if days else ''}{hours}h {minutes}m {secs}s"


def _firmware_projection(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, str):
        return {} if raw is None else {"Version": raw}
    value = raw.strip()
    version = value.split("*(", 1)[0].strip()
    date_match = re.search(r"-\s*((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),.+?UTC)\)?\s*$", value, re.I)
    return {"Version": version or value, **({"Last Updated": date_match.group(1).strip()} if date_match else {}), "Raw": value}


def _compact(value: dict[str, Any]) -> dict[str, Any]:
    return {key: child for key, child in value.items() if child is not None}


def build_web_blocks(values: dict[str, Any], ip: str) -> dict[str, Any]:
    lan_source = values.get("allLan") if isinstance(values.get("allLan"), dict) else {}
    tlp = values.get("tlpProject") if isinstance(values.get("tlpProject"), dict) else {}
    config = values.get("controllerConfig") if isinstance(values.get("controllerConfig"), dict) else (deep_find(tlp, ["controllerconfig"]) or {})
    connected = values.get("connectedDevices") if isinstance(values.get("connectedDevices"), list) else (deep_find(tlp, ["systemdevs", "connecteddevices"]) or [])
    if not isinstance(connected, list):
        connected = []
    uptime = values.get("uptime")
    try:
        uptime_seconds = float(uptime)
    except (TypeError, ValueError):
        uptime_seconds = None
    version = _first_defined(config.get("projfilevers"), config.get("version"))
    if isinstance(version, str) and re.fullmatch(r"\d+\.\d+\.\d+\.0", version):
        version = version[:-2]
    project = _compact({
        "Project": _first_defined(config.get("filename"), deep_find(tlp, ["filename"])),
        "Version": version,
        "Creation Date": _first_defined(config.get("cdate"), config.get("creationdate")),
        "Revision Date": _first_defined(config.get("rdate"), config.get("revisiondate")),
        "Saved with": f"{config.get('cfgapp') or 'GS'} {config.get('cfgappvers')}" if config.get("cfgappvers") else config.get("cfgapp"),
        "Target Firmware": _first_defined(config.get("targetfw"), config.get("targetfirmware")),
        "Author": config.get("author"),
        "Controller Type": values.get("controllerType"),
        "GV Host": values.get("gvHost"),
        "Connected Devices": connected,
        "TLP Project": tlp if tlp else None,
    })
    lan = _compact({
        "DHCP": _format_dhcp(_first_defined(values.get("dhcp"), deep_find(lan_source, ["dhcp"]))),
        "Host Name": _first_defined(values.get("hostName"), deep_find(lan_source, ["hostname"]), deep_find(tlp, ["hostname"])),
        "IP Address": _first_defined(deep_find(lan_source, ["ipaddress", "ip"]), ip),
        "Subnet Mask": deep_find(lan_source, ["subnetmask", "subnet"]),
        "Gateway": deep_find(lan_source, ["gateway"]),
        "DNS Server": _first_defined(values.get("dnsServers"), deep_find(lan_source, ["dnsservers", "dnsserver"]), []),
        "MAC Address": _first_defined(values.get("macAddress"), deep_find(lan_source, ["macaddress", "mac"]), deep_find(tlp, ["macaddress"])),
        "Link Status": deep_find(lan_source, ["linkstatus"]),
        "Ports": deep_find(lan_source, ["ports"]),
    })
    gui: list[dict[str, Any]] = []
    for device in connected:
        if not isinstance(device, dict) or not isinstance(device.get("vtlpweb"), list):
            continue
        for page in device["vtlpweb"]:
            url = page.get("url") if isinstance(page, dict) else None
            if isinstance(url, str) and "://" not in url and not url.startswith("/"):
                gui.append({"device": device.get("name") or device.get("modelname"), "addr": device.get("addr"), "gui": f"https://{ip}/{url.lstrip('/')}", "status": "Требует отдельной проверки доступности"})
    return {
        "Device Info": _compact({"Model": values.get("modelName"), "Part Number": values.get("partNumber"), "Serial Number": values.get("serialNumber"), "Host Name": lan.get("Host Name"), "Hardware": deep_find(lan_source, ["hardware", "unitinfo"])}),
        "Firmware": _compact(_firmware_projection(values.get("fwVersion"))),
        "Project Info": project,
        "Device Status": _compact({"Date": values.get("date"), "Time": values.get("date"), "Time Zone": values.get("timeZone"), "Uptime": _format_uptime(uptime), "Uptime Seconds": uptime_seconds if uptime_seconds is not None and math.isfinite(uptime_seconds) else None, "PoE": _first_defined(values.get("poeStatus"), values.get("poeSupport")), "Temperature": values.get("temperature")}),
        "LAN Settings": lan,
        "GUI": gui,
    }


def poll_extron_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    from mvp_runtime.polling import normalize_ipv4

    settings = options or {}
    request = settings.get("request") or native_https_request
    ip = normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
    captured_at = _utc_iso(settings.get("now"))
    base: dict[str, Any] = {"ip": ip, "capturedAt": captured_at, "ok": False, "failedStage": None, "loginAttempts": [], "credentialAttempts": 0, "vendorPolling": {"status": "supported", "contract": "extron-web-dynamic-resources-v1"}}
    if not ip:
        return {**base, "failedStage": "validation", "safeError": "invalid_or_forbidden_ip"}
    pool = credentials if isinstance(credentials, list) else [credentials]
    pool = [item for item in pool if isinstance(item, dict) and item.get("username") and item.get("password")]
    if not pool:
        return {**base, "failedStage": "credentials", "safeError": "credential_missing"}
    reject_unauthorized = not (device.get("allowInsecureTls") is True or settings.get("allow_insecure_tls") is True)
    timeout_ms = settings.get("timeout_ms")
    try:
        request({
            "ip": ip,
            "method": "GET",
            "path": "/www/index.html",
            "headers": browser_request_headers(ip, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
            "reject_unauthorized": reject_unauthorized,
            "timeout_ms": timeout_ms,
            "max_bytes": 2 * 1024 * 1024,
        })
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        return {**base, "failedStage": "login", "safeError": _transport_code(error)}
    cookie = None
    for index, candidate in enumerate(pool):
        try:
            authorization = base64.b64encode(f"{candidate['username']}:{candidate['password']}".encode()).decode("ascii")
            now_ms = int(float((settings.get("now") or time.time)()) * 1000)
            login = request({"ip": ip, "method": "POST", "path": f"/api/login?rnd={now_ms}", "headers": {**browser_request_headers(ip), "Authorization": f"Basic {authorization}", "Content-Length": "0"}, "body": b"", "reject_unauthorized": reject_unauthorized, "timeout_ms": timeout_ms, "max_bytes": 1024 * 1024})
            cookie = session_cookie(login.get("headers"))
            login_ok = 200 <= int(login.get("status_code") or 0) < 300 and bool(cookie)
            base["loginAttempts"].append({"attempt": index + 1, "ok": login_ok})
            base["credentialAttempts"] = index + 1
            if login_ok:
                break
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            base["loginAttempts"].append({"attempt": index + 1, "ok": False})
            base["credentialAttempts"] = index + 1
            return {**base, "failedStage": "login", "safeError": _transport_code(error)}
    if not cookie:
        return {**base, "failedStage": "authorization", "safeError": "authorization_failed"}
    try:
        bundle = request({"ip": ip, "method": "GET", "path": "/www/main.js", "headers": {**browser_request_headers(ip, "application/javascript,*/*;q=0.8"), "Cookie": cookie}, "reject_unauthorized": reject_unauthorized, "timeout_ms": timeout_ms, "max_bytes": 8 * 1024 * 1024})
        if int(bundle.get("status_code") or 0) != 200:
            return {**base, "failedStage": "bundle", "safeError": "web_bundle_unavailable"}
        discovery = extract_resource_uris(bundle.get("body"))
        if len(discovery["markers"]) < 1 or len(discovery["resources"]) < 2:
            return {**base, "failedStage": "adapter", "safeError": "unsupported_web_contract", "webInterface": {"ok": False, "evidence": "confirmed_resource_contract_not_found", "markerCount": len(discovery["markers"])}}
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        return {**base, "failedStage": "bundle", "safeError": _transport_code(error)}
    values: dict[str, Any] = {}
    resource_errors: dict[str, str] = {}
    uptime_observed_at: str | None = None
    for key, uri in discovery["resources"].items():
        try:
            response = request({"ip": ip, "method": "GET", "path": f"/api/swis/resource{uri}", "headers": {**browser_request_headers(ip), "Cookie": cookie}, "reject_unauthorized": reject_unauthorized, "timeout_ms": timeout_ms, "max_bytes": 8 * 1024 * 1024})
            status = int(response.get("status_code") or 0)
            if status != 200:
                resource_errors[key] = f"http_{status}"
                continue
            try:
                value = json.loads(str(response.get("body") or ""))
            except json.JSONDecodeError:
                resource_errors[key] = "resource_json_invalid"
                continue
            if isinstance(value, dict) and len(value) == 1 and next(iter(value)) in {"value", "data", "result"}:
                value = next(iter(value.values()))
            if isinstance(value, dict) and isinstance(value.get("error"), str):
                resource_errors[key] = value["error"]
            values[key] = value
            if key == "uptime":
                uptime_observed_at = _utc_iso(settings.get("now"))
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            resource_errors[key] = _transport_code(error)
    evidence = sum(values.get(key) is not None for key in ("modelName", "serialNumber", "fwVersion", "macAddress"))
    if evidence == 0:
        return {**base, "failedStage": "resources", "safeError": "resource_schema_unconfirmed", "webInterface": {"ok": True, "evidence": "Extron web UI markers and dynamic resources found", "markers": discovery["markers"]}, "diagnostics": {"discoveredResourceKeys": list(discovery["resources"]), "resourceErrors": resource_errors}}
    return {**base, "ok": True, "uptimeObservedAt": uptime_observed_at, "webInterface": {"ok": True, "evidence": "Extron web UI markers and dynamic resources found", "markers": discovery["markers"], "insecureTls": not reject_unauthorized}, "webBlocks": build_web_blocks(values, ip), "readMode": "targeted", "diagnostics": {"discoveredResourceKeys": list(discovery["resources"]), "resourceErrors": resource_errors}}
