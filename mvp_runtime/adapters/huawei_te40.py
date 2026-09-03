"""Bounded Huawei TE40 legacy web CGI polling adapter."""

from __future__ import annotations

import http.client
import json
import random
import re
import socket
import ssl
import time
from http.cookies import SimpleCookie
from typing import Any, Callable

from mvp_runtime.redaction import sanitize_result


LOGIN_MARKERS = (
    "WEB_GetLoginInfo",
    "Web_RequestSessionID",
    "Web_RequestCertificate",
    "WEB_ChangeSessionID",
)

RESOURCE_ACTIONS = {
    "productEsn": "WEB_GetProductEsnAPI",
    "systemMac": "WEB_GetSystemMacAddrAPI",
    "versionInfo": "WEB_GetVersionInfoAPI",
    "termSpecs": "WEB_GetTermSpecsInfoAPI",
    "localTime": "WEB_GetSysLocalTimeAPI",
    "dhcpInfo": "WEB_GetDhcpIPInfoAPI",
}

RESOURCE_FIELDS: dict[str, dict[str, tuple[type, ...]]] = {
    "productEsn": {"product_esn": (str,)},
    "systemMac": {"system_wanMAC_addr": (str,), "system_lanMAC_addr": (str,)},
    "versionInfo": {
        "model": (str,), "lisence": (str,), "softVersion": (str,), "hardVersion": (str,),
        "logicVersion": (str,), "micVersion": (list,), "inCamVersion": (str,),
    },
    "termSpecs": {
        "audioProtocol": (str,), "videoProtocol": (str,), "ipSpeed": (int,), "e1Speed": (int,),
        "ipOverE1Speed": (int,), "pstnSpeed": (int,), "supportMiniMcu": (int,), "VideoSiteNum": (int,),
        "PSTNSiteNum": (int,), "miniMcuMaxBandwidth": (int,), "supportSip": (int,),
        "supportMutiStream": (int,), "supportSignalEn": (int,), "supportStreamEn": (int,),
        "support3G": (int,), "netDiagConnectd": (int,), "maxEnc": (int,), "maxDec": (int,),
        "maxResolve": (int,), "pstn": (int,), "EnableWifi": (int,), "IsEnableSvc": (int,),
        "IsEnableRec": (int,), "IsEnableSkype": (int,), "IsEnableLync": (int,),
        "IsEnableEspace": (int,), "Deadline": (str,),
    },
    "localTime": {
        "year": (int,), "month": (int,), "day": (int,), "hour": (int,), "minute": (int,),
        "second": (int,), "daylight": (int,), "isDst": (int,),
    },
    "dhcpInfo": {
        "IPv4DhcpAddr": (str,), "IPv4DhcpNetMask": (str,), "IPv4DhcpGaweWay": (str,),
        "IPv6DhcpAddr": (str,), "IPv6DhcpNetMask": (str, int), "IPv6DhcpGaweWay": (str,),
    },
}

MAC_PATTERN = re.compile(r"^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")
MAX_COOKIE_COUNT = 16
MAX_COOKIE_LENGTH = 4096


class HuaweiTransportError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class HuaweiContractError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def _utc_iso(now: Callable[[], float] | None = None) -> str:
    timestamp = float((now or time.time)())
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(timestamp)) + f".{int(timestamp % 1 * 1000):03d}Z"


def browser_request_headers(ip: str, accept: str = "*/*") -> dict[str, str]:
    return {
        "Accept": accept,
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "Origin": f"https://{ip}",
        "Referer": f"https://{ip}/login.html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "userType": "web",
    }


def _transport_code(error: BaseException) -> str:
    if isinstance(error, HuaweiTransportError):
        return error.code
    if isinstance(error, ssl.SSLCertVerificationError):
        return "tls_certificate_rejected"
    if isinstance(error, ssl.SSLError):
        return "tls_handshake_failed"
    if isinstance(error, (TimeoutError, socket.timeout)):
        return "request_timeout"
    if isinstance(error, (ConnectionError, OSError)):
        return "transport_error"
    return "adapter_failed"


def native_https_request(options: dict[str, Any]) -> dict[str, Any]:
    ip = str(options["ip"])
    method = str(options.get("method") or "GET").upper()
    path = str(options.get("path") or "/")
    if method not in {"GET", "POST"} or not path.startswith("/") or "\r" in path or "\n" in path:
        raise HuaweiTransportError("request_invalid")
    timeout = max(0.25, min(float(options.get("timeout_ms") or 8000) / 1000, 30.0))
    maximum = max(1, min(int(options.get("max_bytes") or 1024 * 1024), 8 * 1024 * 1024))
    reject_unauthorized = options.get("reject_unauthorized") is not False
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    if reject_unauthorized:
        context.check_hostname = True
        context.verify_mode = ssl.CERT_REQUIRED
        context.load_default_certs()
    else:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        context.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0)
        try:
            context.set_ciphers("DEFAULT:@SECLEVEL=0")
        except ssl.SSLError as error:
            raise HuaweiTransportError("tls_handshake_failed") from error
    body = options.get("body")
    if isinstance(body, str):
        body = body.encode("utf-8")
    connection = http.client.HTTPSConnection(ip, 443, timeout=timeout, context=context)
    try:
        connection.request(method, path, body=body, headers=dict(options.get("headers") or {}))
        response = connection.getresponse()
        raw = response.read(maximum + 1)
        if len(raw) > maximum:
            raise HuaweiTransportError("response_too_large")
        return {
            "status_code": response.status,
            "headers": response.getheaders(),
            "body": raw.decode("utf-8", "replace"),
        }
    finally:
        connection.close()


def _header_values(headers: Any, name: str) -> list[str]:
    expected = name.casefold()
    if isinstance(headers, dict):
        return [str(value) for key, value in headers.items() if str(key).casefold() == expected]
    values = []
    if isinstance(headers, (list, tuple)):
        for item in headers:
            if isinstance(item, (list, tuple)) and len(item) >= 2 and str(item[0]).casefold() == expected:
                values.append(str(item[1]))
    return values


def _update_cookies(cookies: dict[str, str], headers: Any) -> None:
    for value in _header_values(headers, "set-cookie"):
        if len(value) > MAX_COOKIE_LENGTH:
            continue
        parsed = SimpleCookie()
        try:
            parsed.load(value)
        except Exception:
            continue
        for name, morsel in parsed.items():
            if len(cookies) >= MAX_COOKIE_COUNT and name not in cookies:
                continue
            if re.fullmatch(r"[!#$%&'*+.^_`|~0-9A-Za-z-]+", name) and len(morsel.value) <= MAX_COOKIE_LENGTH:
                cookies[name] = morsel.value


def _cookie_header(cookies: dict[str, str]) -> str | None:
    return "; ".join(f"{name}={value}" for name, value in cookies.items()) or None


def _decode_envelope(response: dict[str, Any]) -> tuple[dict[str, Any], Any]:
    if int(response.get("status_code") or 0) != 200:
        raise HuaweiContractError("resource_http_error")
    try:
        outer = json.loads(str(response.get("body") or ""))
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        raise HuaweiContractError("resource_envelope_invalid") from error
    if not isinstance(outer, dict) or isinstance(outer.get("success"), bool) or not isinstance(outer.get("success"), int):
        raise HuaweiContractError("resource_envelope_invalid")
    data = outer.get("data")
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError as error:
            raise HuaweiContractError("resource_envelope_invalid") from error
    return outer, data


def _validate_resource(key: str, data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise HuaweiContractError("resource_schema_unconfirmed")
    allowed = RESOURCE_FIELDS[key]
    output = {}
    for field, types in allowed.items():
        if field not in data or data[field] is None:
            continue
        value = data[field]
        if isinstance(value, bool) and bool not in types:
            continue
        if not isinstance(value, types):
            continue
        if isinstance(value, list):
            value = [item for item in value[:128] if item is None or isinstance(item, (bool, int, float, str))]
        output[field] = value
    if not output:
        raise HuaweiContractError("resource_schema_unconfirmed")
    return output


def _compact(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in value.items() if item is not None and item != ""}


def _resource(resources: dict[str, Any], key: str) -> dict[str, Any]:
    return resources.get(key) or resources.get(RESOURCE_ACTIONS[key]) or {}


def build_web_blocks(resources: dict[str, Any], ip: str) -> dict[str, Any]:
    esn = _resource(resources, "productEsn")
    mac = _resource(resources, "systemMac")
    version = _resource(resources, "versionInfo")
    specs = _resource(resources, "termSpecs")
    local_time = _resource(resources, "localTime")
    dhcp = _resource(resources, "dhcpInfo")
    date_value = None
    time_value = None
    try:
        date_value = f"{int(local_time['year']):04d}-{int(local_time['month']):02d}-{int(local_time['day']):02d}"
        time_value = f"{int(local_time['hour']):02d}:{int(local_time['minute']):02d}:{int(local_time['second']):02d}"
    except (KeyError, TypeError, ValueError):
        pass
    wan_mac = mac.get("system_wanMAC_addr")
    lan_mac = mac.get("system_lanMAC_addr")
    primary_mac = wan_mac if isinstance(wan_mac, str) and MAC_PATTERN.fullmatch(wan_mac.strip()) else lan_mac
    capability_labels = {
        "audioProtocol": "Audio Protocol", "videoProtocol": "Video Protocol", "ipSpeed": "IP Speed",
        "maxEnc": "Maximum Encoders", "maxDec": "Maximum Decoders", "maxResolve": "Maximum Resolution",
        "supportMiniMcu": "Mini MCU", "supportSip": "SIP", "supportMutiStream": "Multi Stream",
        "EnableWifi": "Wi-Fi", "IsEnableSvc": "SVC", "IsEnableRec": "Recording",
    }
    capabilities = {capability_labels[key]: specs[key] for key in capability_labels if key in specs}
    return {
        "Device Info": _compact({"Model": version.get("model"), "Serial Number": esn.get("product_esn")}),
        "Firmware": _compact({
            "Version": version.get("softVersion"), "Hardware Version": version.get("hardVersion"),
            "Logic Version": version.get("logicVersion"), "Microphone Version": version.get("micVersion"),
            "Camera Version": version.get("inCamVersion"), "License": version.get("lisence"),
        }),
        "Device Status": _compact({"Date": date_value, "Time": time_value, "Daylight": local_time.get("daylight"), "DST": local_time.get("isDst")}),
        "LAN Settings": _compact({
            "IP Address": ip, "MAC Address": primary_mac, "WAN MAC Address": wan_mac, "LAN MAC Address": lan_mac,
            "DHCP IPv4 Address": dhcp.get("IPv4DhcpAddr"), "Subnet Mask": dhcp.get("IPv4DhcpNetMask"),
            "Gateway": dhcp.get("IPv4DhcpGaweWay"), "DHCP IPv6 Address": dhcp.get("IPv6DhcpAddr"),
            "IPv6 Prefix": dhcp.get("IPv6DhcpNetMask"), "IPv6 Gateway": dhcp.get("IPv6DhcpGaweWay"),
        }),
        "Capabilities": capabilities,
    }


def poll_huawei_te40_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    from mvp_runtime.polling import normalize_ipv4

    settings = options or {}
    request = settings.get("request") or native_https_request
    nonce = settings.get("nonce") or (lambda: str(random.random()))
    ip = normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
    captured_at = _utc_iso(settings.get("now"))
    base: dict[str, Any] = {
        "ip": ip,
        "capturedAt": captured_at,
        "ok": False,
        "failedStage": None,
        "loginAttempts": [],
        "credentialAttempts": 0,
        "vendorPolling": {"status": "supported", "contract": "huawei-te40-web-cgi-v1"},
    }
    if not ip or str(device.get("model") or device.get("modelRaw") or device.get("modelNormalized") or "").strip().casefold() != "te40":
        return {**base, "failedStage": "validation", "safeError": "invalid_or_unsupported_target"}
    pool = credentials if isinstance(credentials, list) else [credentials]
    pool = [item for item in pool if isinstance(item, dict) and item.get("username") and item.get("password")]
    if not pool:
        return {**base, "failedStage": "credentials", "safeError": "credential_missing"}
    reject_unauthorized = not (device.get("allowInsecureTls") is True or settings.get("allow_insecure_tls") is True)
    timeout_ms = settings.get("timeout_ms") or 8000
    cookies: dict[str, str] = {}

    def perform(method: str, path: str, headers: dict[str, str] | None = None, body: str | bytes | None = None, maximum: int = 1024 * 1024) -> dict[str, Any]:
        merged = dict(headers or {})
        cookie = _cookie_header(cookies)
        if cookie:
            merged["Cookie"] = cookie
        response = request({
            "ip": ip, "method": method, "path": path, "headers": merged, "body": body,
            "reject_unauthorized": reject_unauthorized, "timeout_ms": timeout_ms, "max_bytes": maximum,
        })
        _update_cookies(cookies, response.get("headers"))
        return response

    def action(name: str, payload: dict[str, Any] | None = None) -> tuple[dict[str, Any], Any]:
        body = "" if payload is None else json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        headers = browser_request_headers(ip)
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8" if payload is None else "application/json; charset=UTF-8"
        return _decode_envelope(perform("POST", f"/action.cgi?ActionID={name}?rmd={nonce()}", headers, body))

    try:
        static_headers = {"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "User-Agent": browser_request_headers(ip)["User-Agent"]}
        for path in ("/", "/index.html", "/hidden_frame.html", "/login.html"):
            response = perform("GET", path, static_headers)
            if int(response.get("status_code") or 0) != 200:
                return {**base, "failedStage": "login", "safeError": "web_bundle_unavailable"}
        login_bundle = perform("GET", "/system/login/login.js", static_headers, maximum=8 * 1024 * 1024)
        if int(login_bundle.get("status_code") or 0) != 200 or not all(marker in str(login_bundle.get("body") or "") for marker in LOGIN_MARKERS):
            return {**base, "failedStage": "adapter", "safeError": "unsupported_web_contract"}
        outer, data = action("WEB_GetLoginInfo")
        if outer.get("success") != 1 or not isinstance(data, dict):
            return {**base, "failedStage": "login", "safeError": "resource_envelope_invalid"}
        if data.get("AlreadyLogin") == 1:
            return {**base, "failedStage": "authorization", "safeError": "interactive_session_active"}
        outer, _data = action("Web_RequestSessionID")
        if outer.get("success") != 1:
            return {**base, "failedStage": "login", "safeError": "session_request_failed"}
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        code = error.code if isinstance(error, HuaweiContractError) else _transport_code(error)
        return {**base, "failedStage": "login", "safeError": code}

    csrf_token = None
    for index, candidate in enumerate(pool):
        try:
            outer, data = action("Web_RequestCertificate", {"password": candidate["password"], "user": candidate["username"]})
            csrf_token = data.get("acCSRFToken") if outer.get("success") == 1 and isinstance(data, dict) else None
            base["loginAttempts"].append({"attempt": index + 1, "ok": bool(csrf_token)})
            base["credentialAttempts"] = index + 1
            if csrf_token:
                break
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            base["loginAttempts"].append({"attempt": index + 1, "ok": False})
            base["credentialAttempts"] = index + 1
            code = error.code if isinstance(error, HuaweiContractError) else _transport_code(error)
            return {**base, "failedStage": "authorization", "safeError": code}
    if not csrf_token:
        return {**base, "failedStage": "authorization", "safeError": "authorization_failed"}

    try:
        outer, _data = action("WEB_ChangeSessionID")
        if outer.get("success") != 1:
            return {**base, "failedStage": "authorization", "safeError": "session_change_failed"}
        bundle = perform("GET", "/system/web_all.js", {"Accept": "application/javascript,*/*;q=0.8", "User-Agent": browser_request_headers(ip)["User-Agent"], "Referer": f"https://{ip}/desktop.html"}, maximum=8 * 1024 * 1024)
        if int(bundle.get("status_code") or 0) != 200:
            return {**base, "failedStage": "bundle", "safeError": "web_bundle_unavailable"}
        bundle_text = str(bundle.get("body") or "")
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        code = error.code if isinstance(error, HuaweiContractError) else _transport_code(error)
        return {**base, "failedStage": "bundle", "safeError": code}

    resources: dict[str, dict[str, Any]] = {}
    resource_errors: dict[str, str] = {}
    for key, action_name in RESOURCE_ACTIONS.items():
        if action_name not in bundle_text:
            resource_errors[key] = "resource_marker_missing"
            continue
        try:
            outer, data = action(action_name, {"acCSRFToken": csrf_token})
            if outer.get("success") != 1:
                resource_errors[key] = "resource_request_failed"
                continue
            resources[key] = _validate_resource(key, data)
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            resource_errors[key] = error.code if isinstance(error, HuaweiContractError) else _transport_code(error)

    version = resources.get("versionInfo") or {}
    model = str(version.get("model") or "").strip()
    model_matches_te40 = bool(re.search(r"(?:^|[^a-z0-9])te40(?:[^a-z0-9]|$)", model, re.IGNORECASE))
    esn = str((resources.get("productEsn") or {}).get("product_esn") or "").strip()
    mac_data = resources.get("systemMac") or {}
    has_mac = any(isinstance(value, str) and MAC_PATTERN.fullmatch(value.strip()) for value in mac_data.values())
    if not model_matches_te40 or not (esn or has_mac):
        return {
            **base,
            "failedStage": "resources",
            "safeError": "resource_schema_unconfirmed",
            "webInterface": {"ok": True, "evidence": "Huawei TE40 login and resource markers found", "insecureTls": not reject_unauthorized},
            "diagnostics": {"attemptedResourceKeys": list(RESOURCE_ACTIONS), "resourceErrors": resource_errors},
        }
    safe_resources = sanitize_result(resources)
    return {
        **base,
        "ok": True,
        "webInterface": {"ok": True, "evidence": "Huawei TE40 login and resource markers found", "insecureTls": not reject_unauthorized},
        "webBlocks": build_web_blocks(resources, ip),
        "rawResources": safe_resources,
        "readMode": "targeted",
        "diagnostics": {"attemptedResourceKeys": list(RESOURCE_ACTIONS), "resourceErrors": resource_errors},
    }
