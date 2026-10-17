"""Bounded read-only Huawei 310-family HTTPS core and Bar 310 contract."""

from __future__ import annotations

import http.client
import json
import re
import socket
import ssl
import time
from html.parser import HTMLParser
from http.cookies import SimpleCookie
from typing import Any, Callable

from mvp_runtime.redaction import sanitize_result


CONTRACT_MODEL = "Bar 310"
SUPPORTED_PLAN_MODELS = frozenset({"bar 310", "cloudlink bar 310", "cloudlinc bar 310"})
CONTRACT_ID = "huawei-bar310-rest-v1"
BAR310_CONTRACT = {
    "contract_id": CONTRACT_ID,
    "contract_model": CONTRACT_MODEL,
    "plan_models": SUPPORTED_PLAN_MODELS,
    "evidence_status": "confirmed_user_validation",
    "evidence_label": "Huawei Bar 310 pre-auth model and v1 resource markers found",
    "management_action": "disable_insecure_management_services",
    "management_validation_status": "confirmed_local_validation",
}
MAIN_BUNDLE_PATTERN = re.compile(r"^/static/js/main\.[A-Za-z0-9._~-]{1,120}\.chunk\.js$")
MAX_COOKIE_COUNT = 16
MAX_COOKIE_LENGTH = 4096
MAC_PATTERN = re.compile(r"^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")

BAR310_RESOURCE_PATHS = {
    "version": "/v1/om/version",
    "specification": "/v1/om/version/specification",
    "systemTime": "/v1/om/config/systemtime",
    "license": "/v1/om/license",
    "deviceStatus": "/v1/om/device/status",
}

BUNDLE_MARKERS = (
    "/v1/login/device",
    "/v1/login/session",
    "/v1/login/account",
    "action.cgi?ActionID=WEB_ChangeSessionID",
    "X-Access-Token",
    *BAR310_RESOURCE_PATHS.values(),
)

DISABLE_INSECURE_SERVICES_ACTION = "disable_insecure_management_services"
HTTP_ONLY_MANAGEMENT_CONTRACT_IDS = frozenset({"huawei-bar310-rest-v1", "huawei-box310-rest-v1", "huawei-box610-rest-v1"})
MANAGEMENT_BUNDLE_MARKERS = (
    'reqGetCfgUrl="/v1/om/config"',
    'reqSaveCfgUrl="/v1/om/config"',
    "enable_http",
)
MANAGEMENT_CONFIG_PATH = "/v1/om/config"
MANAGEMENT_HTTP_TARGET = 0

RESOURCE_FIELDS: dict[str, dict[str, tuple[type, ...]]] = {
    "version": {
        "terminalType": (str,),
        "SN": (str,),
        "ESN": (str,),
        "softVersion": (str,),
        "hardVersion": (str,),
        "logicVersion": (str,),
        "cameraVersion": (list,),
        "micVersion": (list,),
        "licenseStatus": (int,),
        "licenseDeadLine": (str,),
    },
    "specification": {
        "ESN": (str,),
        "wanMac": (str,),
        "lanMac": (str,),
        "apMac": (str,),
        "staMac": (str,),
        "runMinute": (int,),
        "runHour": (int,),
        "runDay": (int,),
        "isRevoke": (int,),
    },
    "systemTime": {
        "year": (int,),
        "month": (int,),
        "day": (int,),
        "hour": (int,),
        "minute": (int,),
        "second": (int,),
        "daylight": (int,),
        "isDst": (int,),
    },
    "license": {
        "terminalType": (int,),
        "customerType": (int,),
        "maxBandwidth": (int,),
        "maxCodec": (int,),
        "maxResolve": (int,),
        "supportSvc": (int,),
        "supportWifi": (int,),
        "support3G": (int,),
        "supportPstn": (int,),
        "supportRecording": (int,),
        "supportEncrypted": (int,),
        "supportBrazilian": (int,),
        "licenseRemainDays": (int,),
        "forbiddenUSB": (int,),
        "enableCollaborate": (int,),
        "disable4K": (int,),
        "licenseStatus": (int,),
    },
    "deviceStatus": {"isSleep": (int,)},
}


class Bar310TransportError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class Bar310ContractError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class _MainBundleParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.paths: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.casefold() != "script":
            return
        source = dict(attrs).get("src")
        if isinstance(source, str) and MAIN_BUNDLE_PATTERN.fullmatch(source):
            self.paths.append(source)


def _utc_iso(now: Callable[[], float] | None = None) -> str:
    timestamp = float((now or time.time)())
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(timestamp)) + f".{int(timestamp % 1 * 1000):03d}Z"


def _transport_code(error: BaseException) -> str:
    if isinstance(error, Bar310TransportError):
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


def _https_context(reject_unauthorized: bool) -> ssl.SSLContext:
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
            raise Bar310TransportError("tls_handshake_failed") from error
    return context


def native_https_request(options: dict[str, Any]) -> dict[str, Any]:
    ip = str(options["ip"])
    method = str(options.get("method") or "GET").upper()
    path = str(options.get("path") or "/")
    if method not in {"GET", "POST", "PUT", "DELETE"} or not path.startswith("/") or "\r" in path or "\n" in path:
        raise Bar310TransportError("request_invalid")
    timeout = max(0.25, min(float(options.get("timeout_ms") or 8000) / 1000, 30.0))
    maximum = max(1, min(int(options.get("max_bytes") or 1024 * 1024), 8 * 1024 * 1024))
    context = _https_context(options.get("reject_unauthorized") is not False)
    body = options.get("body")
    if isinstance(body, str):
        body = body.encode("utf-8")
    connection = http.client.HTTPSConnection(ip, 443, timeout=timeout, context=context)
    try:
        connection.request(method, path, body=body, headers=dict(options.get("headers") or {}))
        response = connection.getresponse()
        raw = response.read(maximum + 1)
        if len(raw) > maximum:
            raise Bar310TransportError("response_too_large")
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
    values: list[str] = []
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
        raise Bar310ContractError("resource_http_error")
    try:
        outer = json.loads(str(response.get("body") or ""))
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        raise Bar310ContractError("resource_envelope_invalid") from error
    if not isinstance(outer, dict) or isinstance(outer.get("success"), bool) or not isinstance(outer.get("success"), int):
        raise Bar310ContractError("resource_envelope_invalid")
    data = outer.get("data")
    if isinstance(data, str):
        if not data.strip():
            return outer, None
        try:
            data = json.loads(data)
        except json.JSONDecodeError as error:
            raise Bar310ContractError("resource_envelope_invalid") from error
    return outer, data


def _validate_resource(key: str, data: Any) -> dict[str, Any]:
    if not isinstance(data, dict):
        raise Bar310ContractError("resource_schema_unconfirmed")
    output: dict[str, Any] = {}
    for field, types in RESOURCE_FIELDS[key].items():
        if field not in data or data[field] is None:
            continue
        value = data[field]
        if isinstance(value, bool) and bool not in types:
            continue
        if not isinstance(value, types):
            continue
        if isinstance(value, list):
            value = [item for item in value[:64] if item is None or isinstance(item, (bool, int, float, str))]
        output[field] = value
    if not output:
        raise Bar310ContractError("resource_schema_unconfirmed")
    return output


def _compact(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in value.items() if item is not None and item != ""}


def _planned_model(device: dict[str, Any]) -> str:
    return re.sub(r"\s+", " ", str(device.get("model") or device.get("modelRaw") or device.get("modelNormalized") or "").strip().casefold())


def _valid_mac(value: Any) -> str | None:
    item = str(value or "").strip()
    return item if MAC_PATTERN.fullmatch(item) else None


def _management_http_value(data: Any) -> int:
    if not isinstance(data, dict):
        raise Bar310ContractError("configuration_schema_unconfirmed")
    value = data.get("enable_http")
    if isinstance(value, int) and not isinstance(value, bool) and value in {0, 1}:
        return value
    collection = data.get("CfgItemInt")
    if isinstance(collection, list):
        for item in collection:
            if not isinstance(item, dict) or item.get("CfgItemID") != "enable_http":
                continue
            value = item.get("CfgItemInfo")
            if isinstance(value, int) and not isinstance(value, bool) and value in {0, 1}:
                return value
    raise Bar310ContractError("configuration_schema_unconfirmed")


def _management_state(http_value: int | None) -> dict[str, str]:
    return {
        "httpPort80": "disabled" if http_value == MANAGEMENT_HTTP_TARGET else "enabled" if http_value == 1 else "unknown",
        "telnetPort23": "not_exposed",
    }


def _disable_insecure_management_services(
    bundle_text: str,
    json_request: Callable[[str, str, Any, bool], tuple[dict[str, Any], Any]],
    settle: Callable[[], Any],
    validation_status: str,
) -> dict[str, Any]:
    base = {
        "id": DISABLE_INSECURE_SERVICES_ACTION,
        "transport": "https/443",
        "changed": False,
        "writeAttempted": False,
        "validationStatus": validation_status,
    }
    if not all(marker in bundle_text for marker in MANAGEMENT_BUNDLE_MARKERS):
        return {**base, "status": "failed", "safeError": "management_contract_unconfirmed"}

    def read_http() -> int:
        outer, data = json_request("POST", MANAGEMENT_CONFIG_PATH, {"CfgIDString": ["enable_http"]}, True)
        if outer.get("success") != 1:
            raise Bar310ContractError("configuration_read_failed")
        return _management_http_value(data)

    before = None
    after = None
    write_attempted = False
    try:
        before_value = read_http()
        before = _management_state(before_value)
        if before_value == MANAGEMENT_HTTP_TARGET:
            return {**base, "status": "already_compliant", "before": before, "after": before}
        payload = {
            "CfgItemInt": [{"CfgItemID": "enable_http", "CfgItemInfo": MANAGEMENT_HTTP_TARGET}],
            "CfgItemString": [],
        }
        outer, _data = json_request("PUT", MANAGEMENT_CONFIG_PATH, payload, True)
        write_attempted = True
        if outer.get("success") != 1:
            raise Bar310ContractError("configuration_write_failed")
        settle()
        after_value = read_http()
        after = _management_state(after_value)
        if after_value != MANAGEMENT_HTTP_TARGET:
            raise Bar310ContractError("configuration_verification_failed")
        return {
            **base,
            "status": "applied",
            "changed": True,
            "writeAttempted": True,
            "before": before,
            "after": after,
        }
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        code = error.code if isinstance(error, Bar310ContractError) else _transport_code(error)
        result = {**base, "status": "failed", "writeAttempted": write_attempted, "safeError": code}
        if before is not None:
            result["before"] = before
        if after is not None:
            result["after"] = after
        return result


def build_web_blocks(resources: dict[str, dict[str, Any]], ip: str) -> dict[str, Any]:
    version = resources.get("version") or {}
    specification = resources.get("specification") or {}
    system_time = resources.get("systemTime") or {}
    license_data = resources.get("license") or {}
    device_status = resources.get("deviceStatus") or {}
    date_value = None
    time_value = None
    try:
        date_value = f"{int(system_time['year']):04d}-{int(system_time['month']):02d}-{int(system_time['day']):02d}"
        time_value = f"{int(system_time['hour']):02d}:{int(system_time['minute']):02d}:{int(system_time['second']):02d}"
    except (KeyError, TypeError, ValueError):
        pass
    uptime_seconds = None
    uptime_values = [specification.get("runDay"), specification.get("runHour"), specification.get("runMinute")]
    if all(isinstance(item, int) and not isinstance(item, bool) and item >= 0 for item in uptime_values):
        uptime_seconds = int(uptime_values[0]) * 86400 + int(uptime_values[1]) * 3600 + int(uptime_values[2]) * 60
    mac_values = {
        "WAN MAC Address": _valid_mac(specification.get("wanMac")),
        "LAN MAC Address": _valid_mac(specification.get("lanMac")),
        "AP MAC Address": _valid_mac(specification.get("apMac")),
        "STA MAC Address": _valid_mac(specification.get("staMac")),
    }
    primary_mac = next((item for item in mac_values.values() if item), None)
    capability_labels = {
        "maxBandwidth": "Maximum Bandwidth",
        "maxCodec": "Maximum Codec",
        "maxResolve": "Maximum Resolution",
        "supportSvc": "SVC",
        "supportWifi": "Wi-Fi",
        "support3G": "3G",
        "supportPstn": "PSTN",
        "supportRecording": "Recording",
        "supportEncrypted": "Encryption",
        "enableCollaborate": "Collaboration",
        "disable4K": "4K Disabled",
        "licenseRemainDays": "License Remaining Days",
    }
    return {
        "Device Info": _compact({
            "Model": version.get("terminalType"),
            "Serial Number": version.get("SN") or version.get("ESN") or specification.get("ESN"),
        }),
        "Firmware": _compact({
            "Version": version.get("softVersion"),
            "Hardware Version": version.get("hardVersion"),
            "Logic Version": version.get("logicVersion"),
            "Camera Version": version.get("cameraVersion"),
            "Microphone Version": version.get("micVersion"),
            "License Status": version.get("licenseStatus"),
            "License Deadline": version.get("licenseDeadLine"),
        }),
        "Device Status": _compact({
            "Date": date_value,
            "Time": time_value,
            "Daylight": system_time.get("daylight"),
            "DST": system_time.get("isDst"),
            "Uptime Days": specification.get("runDay"),
            "Uptime Hours": specification.get("runHour"),
            "Uptime Minutes": specification.get("runMinute"),
            "Uptime Seconds": uptime_seconds,
            "Sleep": device_status.get("isSleep"),
        }),
        "LAN Settings": _compact({"IP Address": ip, "MAC Address": primary_mac, **mac_values}),
        "Capabilities": {
            label: license_data[key]
            for key, label in capability_labels.items()
            if key in license_data
        },
    }


def poll_huawei_310_family_device(
    device: dict[str, Any],
    credentials: Any,
    contract: dict[str, Any],
    options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from mvp_runtime.polling import normalize_ipv4

    settings = options or {}
    request = settings.get("request") or native_https_request
    ip = normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
    captured_at = _utc_iso(settings.get("now"))
    contract_id = str(contract.get("contract_id") or "")
    contract_model = str(contract.get("contract_model") or "")
    plan_models = frozenset(str(item) for item in contract.get("plan_models") or ())
    evidence_status = str(contract.get("evidence_status") or "provisional_user_validation")
    evidence_label = str(contract.get("evidence_label") or "Huawei 310-family guarded web contract found")
    requested_management_tasks = [str(item) for item in settings.get("management_tasks", []) if str(item).strip()]
    settle = settings.get("management_settle") or (lambda: time.sleep(1.0))
    base: dict[str, Any] = {
        "ip": ip,
        "capturedAt": captured_at,
        "ok": False,
        "failedStage": None,
        "loginAttempts": [],
        "credentialAttempts": 0,
        "vendorPolling": {
            "status": "supported",
            "contract": contract_id,
            "model": contract_model,
            "evidenceStatus": evidence_status,
        },
    }
    if not contract_id or not contract_model or not plan_models or not ip or _planned_model(device) not in plan_models:
        return {**base, "failedStage": "validation", "safeError": "invalid_or_unsupported_target"}
    pool = credentials if isinstance(credentials, list) else [credentials]
    pool = [item for item in pool if isinstance(item, dict) and item.get("username") and item.get("password")]
    if not pool:
        return {**base, "failedStage": "credentials", "safeError": "credential_missing"}

    reject_unauthorized = not (device.get("allowInsecureTls") is True or settings.get("allow_insecure_tls") is True)
    timeout_ms = settings.get("timeout_ms") or 8000
    cookies: dict[str, str] = {}
    access_token = ""
    session_opened = False

    def headers(accept: str = "application/json, text/plain, */*", token: bool = False) -> dict[str, str]:
        output = {
            "Accept": accept,
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            "ClientType": "browser",
            "Origin": f"https://{ip}",
            "Pragma": "no-cache",
            "Referer": f"https://{ip}/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
            "X-Requested-With": "XMLHttpRequest",
            "userType": "web",
        }
        if token and access_token:
            output["X-Access-Token"] = access_token
        return output

    def perform(method: str, path: str, request_headers: dict[str, str] | None = None, body: str | None = None, maximum: int = 1024 * 1024) -> dict[str, Any]:
        merged = dict(request_headers or {})
        cookie = _cookie_header(cookies)
        if cookie:
            merged["Cookie"] = cookie
        response = request({
            "ip": ip,
            "method": method,
            "path": path,
            "headers": merged,
            "body": body,
            "reject_unauthorized": reject_unauthorized,
            "timeout_ms": timeout_ms,
            "max_bytes": maximum,
        })
        _update_cookies(cookies, response.get("headers"))
        return response

    def json_request(method: str, path: str, body_value: Any = None, token: bool = False) -> tuple[dict[str, Any], Any]:
        request_headers = headers(token=token)
        request_headers["Content-Type"] = "application/json;charset=UTF-8"
        body = None if method == "GET" or method == "DELETE" else json.dumps(body_value, ensure_ascii=False, separators=(",", ":"))
        return _decode_envelope(perform(method, path, request_headers, body))

    def finalize(result: dict[str, Any]) -> dict[str, Any]:
        nonlocal access_token
        logout_error = None
        if session_opened:
            try:
                json_request("DELETE", "/v1/login/session", token=bool(access_token))
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                logout_error = error.code if isinstance(error, Bar310ContractError) else _transport_code(error)
        cookies.clear()
        access_token = ""
        if logout_error:
            diagnostics = dict(result.get("diagnostics") or {})
            diagnostics["logoutError"] = logout_error
            result["diagnostics"] = diagnostics
        return result

    try:
        root = perform("GET", "/", headers("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"), maximum=1024 * 1024)
        if int(root.get("status_code") or 0) != 200:
            return {**base, "failedStage": "adapter", "safeError": "web_bundle_unavailable"}
        parser = _MainBundleParser()
        parser.feed(str(root.get("body") or ""))
        bundle_paths = list(dict.fromkeys(parser.paths))
        if len(bundle_paths) != 1:
            return {**base, "failedStage": "adapter", "safeError": "unsupported_web_contract"}
        bundle = perform("GET", bundle_paths[0], headers("application/javascript,*/*;q=0.8"), maximum=8 * 1024 * 1024)
        bundle_text = str(bundle.get("body") or "")
        if int(bundle.get("status_code") or 0) != 200 or not all(marker in bundle_text for marker in BUNDLE_MARKERS):
            return {**base, "failedStage": "adapter", "safeError": "unsupported_web_contract"}
        outer, preauth_data = json_request("GET", "/v1/login/device")
        if outer.get("success") != 1 or not isinstance(preauth_data, dict):
            return {**base, "failedStage": "validation", "safeError": "resource_envelope_invalid"}
        if preauth_data.get("licenseEquipName") != contract_model:
            return {**base, "failedStage": "validation", "safeError": "target_model_mismatch"}
        outer, _session_data = json_request("POST", "/v1/login/session", None)
        if outer.get("success") != 1 or not cookies:
            return {**base, "failedStage": "login", "safeError": "session_request_failed"}
        session_opened = True
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        code = error.code if isinstance(error, Bar310ContractError) else _transport_code(error)
        return {**base, "failedStage": "login", "safeError": code}

    for index, candidate in enumerate(pool):
        try:
            outer, login_data = json_request("POST", "/v1/login/account", {
                "account": candidate["username"],
                "password": candidate["password"],
            })
            token = login_data.get("acCSRFToken") if outer.get("success") == 1 and isinstance(login_data, dict) else None
            access_token = token if isinstance(token, str) else ""
            base["loginAttempts"].append({"attempt": index + 1, "ok": bool(access_token)})
            base["credentialAttempts"] = index + 1
            if access_token:
                break
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            base["loginAttempts"].append({"attempt": index + 1, "ok": False})
            base["credentialAttempts"] = index + 1
            code = error.code if isinstance(error, Bar310ContractError) else _transport_code(error)
            return finalize({**base, "failedStage": "authorization", "safeError": code})
    if not access_token:
        return finalize({**base, "failedStage": "authorization", "safeError": "authorization_failed"})

    try:
        outer, _changed_data = json_request("POST", "/action.cgi?ActionID=WEB_ChangeSessionID", None, token=True)
        if outer.get("success") != 1:
            return finalize({**base, "failedStage": "authorization", "safeError": "session_change_failed"})
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        code = error.code if isinstance(error, Bar310ContractError) else _transport_code(error)
        return finalize({**base, "failedStage": "authorization", "safeError": code})

    resources: dict[str, dict[str, Any]] = {}
    resource_errors: dict[str, str] = {}
    for key, path in BAR310_RESOURCE_PATHS.items():
        try:
            outer, data = json_request("GET", path, token=True)
            if outer.get("success") != 1:
                resource_errors[key] = "resource_request_failed"
                continue
            resources[key] = _validate_resource(key, data)
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            resource_errors[key] = error.code if isinstance(error, Bar310ContractError) else _transport_code(error)

    version = resources.get("version") or {}
    specification = resources.get("specification") or {}
    exact_model = version.get("terminalType") == contract_model
    stable_identity = any(str(version.get(key) or "").strip() for key in ("SN", "ESN"))
    if not stable_identity:
        stable_identity = any(_valid_mac(specification.get(key)) for key in ("wanMac", "lanMac", "apMac", "staMac"))
    diagnostics = {"attemptedResourceKeys": list(BAR310_RESOURCE_PATHS), "resourceErrors": resource_errors}
    interface = {
        "ok": True,
        "evidence": evidence_label,
        "insecureTls": not reject_unauthorized,
        "tlsProfile": "system_default",
    }
    if not exact_model or not stable_identity:
        return finalize({
            **base,
            "failedStage": "resources",
            "safeError": "resource_schema_unconfirmed",
            "webInterface": interface,
            "diagnostics": diagnostics,
        })
    management_actions = []
    if (
        contract_id in HTTP_ONLY_MANAGEMENT_CONTRACT_IDS
        and contract.get("management_action") == DISABLE_INSECURE_SERVICES_ACTION
        and DISABLE_INSECURE_SERVICES_ACTION in requested_management_tasks
    ):
        management_actions.append(_disable_insecure_management_services(bundle_text, json_request, settle, str(contract.get("management_validation_status") or "provisional_user_validation")))
    result = {
        **base,
        "ok": True,
        "webInterface": interface,
        "webBlocks": build_web_blocks(resources, ip),
        "rawResources": sanitize_result(resources),
        "readMode": "targeted",
        "diagnostics": diagnostics,
    }
    if management_actions:
        result["managementActions"] = management_actions
        failed_action = next((item for item in management_actions if item.get("status") == "failed"), None)
        if failed_action:
            result["ok"] = False
            result["failedStage"] = "management_action"
            result["safeError"] = failed_action.get("safeError") or "management_action_failed"
    return finalize(result)


def poll_huawei_bar310_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_huawei_310_family_device(device, credentials, BAR310_CONTRACT, options)
