"""Guarded, read-only Huawei CloudLink Bar 300 / Box 300 / Box 600 CGI polls."""

from __future__ import annotations

import json
import re
from typing import Any

from mvp_runtime.redaction import sanitize_result

from .huawei_te40 import (
    MAC_PATTERN,
    RESOURCE_ACTIONS,
    HuaweiContractError,
    _cookie_header,
    _decode_envelope,
    _transport_code,
    _update_cookies,
    _utc_iso,
    browser_request_headers,
    build_web_blocks,
    native_https_request,
)


MODEL_CONTRACTS: dict[str, dict[str, Any]] = {
    "bar300": {"label": "Bar 300", "code": 18, "marker": "UI_TERM_BAR300:18", "contract": "huawei-bar300-web-cgi-v1", "validation": "confirmed_live_bar300"},
    "box300": {"label": "Box 300", "code": 19, "marker": "UI_TERM_BOX300:19", "contract": "huawei-box300-web-cgi-v1", "validation": "provisional_user_validation"},
    "box600": {"label": "Box 600", "code": 22, "marker": "UI_TERM_BOX600:22", "contract": "huawei-box600-web-cgi-v1", "validation": "provisional_user_validation"},
}

LOGIN_MARKERS = ("WEB_GetLoginInfo", "Web_RequestSessionID", "Web_RequestCertificate", "WEB_ChangeSessionID")
RESOURCE_MARKERS = tuple(RESOURCE_ACTIONS.values())
SITE_NAME_ACTION = "WEB_GetCfgParamAPI"
SITE_NAME_MARKER = "getSiteNameConfigs"
ALLOWED_ACTIONS = frozenset((*LOGIN_MARKERS, *RESOURCE_MARKERS, SITE_NAME_ACTION, "WEB_Logout"))
MAIN_BUNDLE_PATH = "/static/js/main.chunk.js"
MAX_SITE_NAME_LENGTH = 256


def _model_matches(value: Any, label: str) -> bool:
    normalized = re.sub(r"\s+", " ", str(value or "").strip()).casefold()
    expected = label.casefold()
    return normalized in {expected, f"huawei {expected}", f"cloudlink {expected}", f"huawei cloudlink {expected}"}


def _planned_model_matches(device: dict[str, Any], label: str) -> bool:
    value = device.get("model") or device.get("modelRaw") or device.get("modelNormalized")
    normalized = re.sub(r"\s+", " ", str(value or "").strip()).casefold()
    expected = label.casefold()
    return normalized in {expected, f"cloudlink {expected}", f"cloudlinc {expected}", f"huawei {expected}", f"huawei cloudlink {expected}"}


def _extra_resource_fields(key: str, data: dict[str, Any]) -> dict[str, Any]:
    from .huawei_te40 import _validate_resource

    validated = _validate_resource(key, data)
    if key == "systemMac":
        poe = data.get("system_poeMAC_addr")
        if isinstance(poe, str) and MAC_PATTERN.fullmatch(poe.strip()):
            validated["system_poeMAC_addr"] = poe.strip()
    elif key == "versionInfo":
        for field in ("CPLDVersion", "FPGAVersion", "MBVersion"):
            value = data.get(field)
            if isinstance(value, str) and len(value) <= 128:
                validated[field] = value
    elif key == "termSpecs":
        for field in ("CamType", "EnableCP", "ForbiddenUSB"):
            value = data.get(field)
            if type(value) is int:
                validated[field] = value
    return validated


def _read_site_name(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if SITE_NAME_ACTION not in bundle or SITE_NAME_MARKER not in bundle or 'CfgIDString:["sitename"]' not in bundle:
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(SITE_NAME_ACTION, {"CfgIDString": ["sitename"], "acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    value = data.get("sitename") if isinstance(data, dict) else None
    if outer.get("success") != 1 or not isinstance(value, str) or len(value) > MAX_SITE_NAME_LENGTH or any(ord(char) < 32 for char in value):
        return {"status": "unavailable", "value": None}
    return {"status": "read", "value": value, "source": "huawei_cfg_sitename"}


def poll_huawei_300_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None, *, model_key: str) -> dict[str, Any]:
    from mvp_runtime.polling import normalize_ipv4

    settings = options or {}
    contract = MODEL_CONTRACTS[model_key]
    label = str(contract["label"])
    ip = normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
    base: dict[str, Any] = {
        "ip": ip,
        "capturedAt": _utc_iso(settings.get("now")),
        "ok": False,
        "failedStage": None,
        "loginAttempts": [],
        "credentialAttempts": 0,
        "vendorPolling": {"status": "supported", "contract": contract["contract"], "model": label, "validationStatus": contract["validation"]},
    }
    if not ip or not _planned_model_matches(device, label):
        return {**base, "failedStage": "validation", "safeError": "invalid_or_unsupported_target"}
    pool = credentials if isinstance(credentials, list) else [credentials]
    pool = [item for item in pool if isinstance(item, dict) and item.get("username") and item.get("password")]
    if not pool:
        return {**base, "failedStage": "credentials", "safeError": "credential_missing"}
    request = settings.get("request") or native_https_request
    reject_unauthorized = not (device.get("allowInsecureTls") is True or settings.get("allow_insecure_tls") is True)
    timeout_ms = settings.get("timeout_ms") or 7000
    cookies: dict[str, str] = {}
    authenticated = False

    def perform(method: str, path: str, headers: dict[str, str] | None = None, body: str | None = None, maximum: int = 1024 * 1024) -> dict[str, Any]:
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
        if name not in ALLOWED_ACTIONS:
            raise HuaweiContractError("action_not_allowed")
        headers = browser_request_headers(ip)
        headers["Referer"] = f"https://{ip}/"
        headers["Content-Type"] = "application/json; charset=UTF-8" if payload is not None else "application/x-www-form-urlencoded"
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) if payload is not None else ""
        return _decode_envelope(perform("POST", f"/action.cgi?ActionID={name}", headers, body))

    try:
        try:
            root = perform("GET", "/", {"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"})
            if int(root.get("status_code") or 0) != 200 or MAIN_BUNDLE_PATH not in str(root.get("body") or ""):
                return {**base, "failedStage": "adapter", "safeError": "unsupported_web_contract"}
            bundle_response = perform("GET", MAIN_BUNDLE_PATH, {"Accept": "application/javascript,*/*;q=0.8"}, maximum=8 * 1024 * 1024)
            bundle = str(bundle_response.get("body") or "")
            if int(bundle_response.get("status_code") or 0) != 200 or not all(marker in bundle for marker in (*LOGIN_MARKERS, *RESOURCE_MARKERS, contract["marker"])):
                return {**base, "failedStage": "adapter", "safeError": "unsupported_web_contract"}
            outer, preauth = action("WEB_GetLoginInfo")
            if outer.get("success") != 1 or not isinstance(preauth, dict):
                return {**base, "failedStage": "validation", "safeError": "preauth_contract_unconfirmed"}
            if preauth.get("AlreadyLogin") == 1:
                return {**base, "failedStage": "authorization", "safeError": "interactive_session_active"}
            if (
                type(preauth.get("AlreadyLogin")) is not int or preauth.get("AlreadyLogin") != 0
                or type(preauth.get("ucTerType")) is not int or preauth.get("ucTerType") != contract["code"]
                or type(preauth.get("ucCustomType")) is not int or preauth.get("ucCustomType") != 0
                or not isinstance(preauth.get("acCSRFToken"), str)
            ):
                return {**base, "failedStage": "validation", "safeError": "target_model_mismatch"}
            outer, _ = action("Web_RequestSessionID")
            if outer.get("success") != 1:
                return {**base, "failedStage": "login", "safeError": "session_request_failed"}
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            return {**base, "failedStage": "login", "safeError": error.code if isinstance(error, HuaweiContractError) else _transport_code(error)}

        csrf = None
        for index, candidate in enumerate(pool):
            try:
                outer, data = action("Web_RequestCertificate", {"password": candidate["password"], "user": candidate["username"]})
                csrf = data.get("acCSRFToken") if outer.get("success") == 1 and isinstance(data, dict) else None
                base["loginAttempts"].append({"attempt": index + 1, "ok": bool(csrf)})
                base["credentialAttempts"] = index + 1
                if csrf:
                    authenticated = True
                    break
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                base["loginAttempts"].append({"attempt": index + 1, "ok": False})
                base["credentialAttempts"] = index + 1
                return {**base, "failedStage": "authorization", "safeError": error.code if isinstance(error, HuaweiContractError) else _transport_code(error)}
        if not csrf:
            return {**base, "failedStage": "authorization", "safeError": "authorization_failed"}

        try:
            outer, _ = action("WEB_ChangeSessionID")
            if outer.get("success") != 1:
                return {**base, "failedStage": "authorization", "safeError": "session_change_failed"}
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            return {**base, "failedStage": "authorization", "safeError": error.code if isinstance(error, HuaweiContractError) else _transport_code(error)}

        resources: dict[str, dict[str, Any]] = {}
        resource_errors: dict[str, str] = {}
        for key, action_name in RESOURCE_ACTIONS.items():
            try:
                outer, data = action(action_name, {"acCSRFToken": csrf})
                if outer.get("success") != 1:
                    resource_errors[key] = "resource_request_failed"
                    continue
                resources[key] = _extra_resource_fields(key, data)
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                resource_errors[key] = error.code if isinstance(error, HuaweiContractError) else _transport_code(error)

        version = resources.get("versionInfo") or {}
        serial = str((resources.get("productEsn") or {}).get("product_esn") or "").strip()
        mac = resources.get("systemMac") or {}
        has_mac = any(isinstance(value, str) and MAC_PATTERN.fullmatch(value.strip()) for value in mac.values())
        if not _model_matches(version.get("model"), label) or not (serial or has_mac):
            return {**base, "failedStage": "resources", "safeError": "resource_schema_unconfirmed", "diagnostics": {"attemptedResourceKeys": list(RESOURCE_ACTIONS), "resourceErrors": resource_errors}}

        site_name = _read_site_name(bundle, action, csrf)
        blocks = build_web_blocks(resources, ip)
        if site_name["status"] == "read":
            blocks["Device Info"]["Site Name"] = site_name["value"]
        poe = mac.get("system_poeMAC_addr")
        if poe:
            blocks["LAN Settings"]["POE MAC Address"] = poe
        for source, label_name in (("CPLDVersion", "CPLD Version"), ("FPGAVersion", "FPGA Version"), ("MBVersion", "Mainboard Version")):
            if version.get(source):
                blocks["Firmware"][label_name] = version[source]
        return {
            **base, "ok": True,
            "webInterface": {"ok": True, "evidence": f"Huawei {label} current CGI and identity markers confirmed", "insecureTls": not reject_unauthorized},
            "webBlocks": blocks,
            "siteName": site_name,
            "rawResources": sanitize_result(resources),
            "readMode": "targeted",
            "diagnostics": {"attemptedResourceKeys": list(RESOURCE_ACTIONS), "resourceErrors": resource_errors},
        }
    finally:
        if authenticated:
            try:
                action("WEB_Logout")
            except Exception:
                pass
        cookies.clear()


def poll_huawei_bar300_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_huawei_300_device(device, credentials, options, model_key="bar300")


def poll_huawei_box300_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_huawei_300_device(device, credentials, options, model_key="box300")


def poll_huawei_box600_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_huawei_300_device(device, credentials, options, model_key="box600")
