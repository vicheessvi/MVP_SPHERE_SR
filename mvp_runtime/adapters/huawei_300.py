"""Guarded, read-only Huawei CloudLink Bar 300 / Box 300 / Box 600 CGI polls."""

from __future__ import annotations

import http.client
import json
import re
import secrets
from typing import Any

from mvp_runtime.redaction import sanitize_result
from mvp_runtime.adapters.device_settings import unknown_device_settings

from .huawei_te40 import (
    MAC_PATTERN,
    RESOURCE_ACTIONS,
    HuaweiContractError,
    _HuaweiLogStream,
    _cookie_header,
    _decode_envelope,
    _https_context,
    _transport_code,
    _update_cookies,
    _utc_iso,
    browser_request_headers,
    build_web_blocks,
    native_https_request,
)


MODEL_CONTRACTS: dict[str, dict[str, Any]] = {
    "bar300": {"label": "Bar 300", "code": 18, "marker": "UI_TERM_BAR300:18", "contract": "huawei-bar300-web-cgi-v1", "validation": "confirmed_live_bar300"},
    "box300": {"label": "Box 300", "code": 19, "marker": "UI_TERM_BOX300:19", "contract": "huawei-box300-web-cgi-v1", "validation": "confirmed_user_validation"},
    "box600": {"label": "Box 600", "code": 22, "marker": "UI_TERM_BOX600:22", "contract": "huawei-box600-web-cgi-v1", "validation": "confirmed_user_validation"},
}

LOGIN_MARKERS = ("WEB_GetLoginInfo", "Web_RequestSessionID", "Web_RequestCertificate", "WEB_ChangeSessionID")
RESOURCE_MARKERS = tuple(RESOURCE_ACTIONS.values())
SITE_NAME_ACTION = "WEB_GetCfgParamAPI"
SITE_NAME_MARKER = "getSiteNameConfigs"
ALLOWED_ACTIONS = frozenset((*LOGIN_MARKERS, *RESOURCE_MARKERS, SITE_NAME_ACTION, "WEB_GetWifiStatModeAPI", "WEB_Logout"))
MAIN_BUNDLE_PATH = "/static/js/main.chunk.js"
LOG_EXPORT_BUNDLE_MARKERS = (
    'ExportLogBtn.onClick=i.handleExportLogData',
    'handleExportLogData=function(){window.open("log?rmd="+Math.random()',
)
MAX_SITE_NAME_LENGTH = 256
BAR300_HTTP_GROUP = re.compile(r'CfgIDString:\[[^\]]{0,250}"enable_http"[^\]]{0,250}\]')
BAR300_HTTP_FORM = re.compile(r'RGenable_http:\{id:"enable_http"[^{}]{0,300}data:\[\{[^{}]{0,100}value:1\},\{[^{}]{0,100}value:2\}\]')
BAR300_TELNET_GROUP = re.compile(r'CfgIDString:\[[^\]]{0,300}"enabletelnet"[^\]]{0,300}\]')
BAR300_TELNET_FORM = re.compile(r'RGenabletelnet:\{id:"enabletelnet"[^{}]{0,300}data:\[\{[^{}]{0,100}value:1\},\{[^{}]{0,100}value:2\}\]')
BAR300_SSH_GROUP = re.compile(r'CfgIDString:\[[^\]]{0,300}"enable_ssh"[^\]]{0,300}\]')
BAR300_SSH_FORM = re.compile(r'RGenable_ssh:\{id:"enable_ssh"[^{}]{0,300}data:\[\{[^{}]{0,100}value:1\},\{[^{}]{0,100}value:2\}\]')
BAR300_ANSWER_GROUP = re.compile(r'CfgIDString:\[[^\]]{0,1200}"autoreply"[^\]]{0,1200}\]')
BAR300_ANSWER_FORM = re.compile(r'SelectAutoreply:\{id:"autoreply"[\s\S]{0,400}options:\[\{value:0,[^{}]{0,100}\},\{value:1,[^{}]{0,100}\}\]')
BAR300_NTP_GROUP = re.compile(r'CfgIDString:\[(?=[^\]]{0,1200}"synSerTime")(?=[^\]]{0,1200}"ntpGetMode")(?=[^\]]{0,1200}"timeServer")[^\]]{1,1200}\]')
BAR300_NTP_ENABLE_FORM = re.compile(r'RadioGroupEnableNTP:\{id:"synSerTime"[\s\S]{0,350}data:\[\{[^{}]{0,100}value:1\},\{[^{}]{0,100}value:0\}\]')
BAR300_NTP_MODE_FORM = re.compile(r'RGntpGetMode:\{id:"ntpGetMode"[\s\S]{0,350}data:\[\{[^{}]{0,100}value:0\},\{[^{}]{0,100}value:1\}\]')
BAR300_NTP_SERVER_MARKER = 'TextFieldNTPSvrAddr:{id:"timeServer"'
BAR300_WIFI_STATUS_ACTION = "WEB_GetWifiStatModeAPI"
BAR300_WIFI_MARKERS = (
    'reqGetWifiStatModeUrl="action.cgi?ActionID=WEB_GetWifiStatModeAPI"',
    'this.post(this.reqGetWifiStatModeUrl,{},{}).then',
    'getCurrentWifiMode=function',
    'RGEnableSta',
    'RGEnableAp',
)
BAR300_SERVER_TYPE_MARKERS = (
    'cloudsetPanelObjRequest={CfgIDString:["cloudType","cloudCfgType","HwCloudName"]}',
    'SelCloudType:{id:"cloudType"',
    'Y=2,K=5,J=6,Q=7,Z=8,$=10,ee=11',
    'value:Q,text:a.resName.TXT_CONFIG_SIP_VIDEO_REQUEST_MANUAL',
)
BAR300_SERVER_TYPE_CODES = frozenset((2, 5, 6, 7, 8, 10, 11))
BAR300_SLEEP_MARKERS = (
    'powerMagParams={CfgIDString:["suppotReboot","sleepTime","enable_wol","autoReboot","sleepCloseAPP","autoRebootVal","faceWakeUp"]}',
    'SelSleepDuration:{id:"sleepTime"',
    'value:0,text:a.props.resName.TXT_VCT_NO_SLEEP',
    'value:10,text:a.props.resName.TXT_CFG_SITENAME_TIME_10_MINUTE_SLEEP',
)
BAR300_SLEEP_CODES = frozenset((0, 1, 5, 10, 15, 30, 60))
BAR300_WOL_FORM = re.compile(r'RGNetworkWakeUp:\{id:"enable_wol"[^{}]{0,300}data:\[\{[^{}]{0,100}value:1\},\{[^{}]{0,100}value:0\}\]')
BAR300_FACE_WAKE_FORM = re.compile(r'RGFaceWakeUp:\{id:"faceWakeUp"[^{}]{0,300}data:\[\{[^{}]{0,100}value:1\},\{[^{}]{0,100}value:0\}\]')
BAR300_SLEEP_CLEAN_FORM = re.compile(r'RGSleepClean:\{id:"sleepCloseAPP"[^{}]{0,300}data:\[\{[^{}]{0,100}value:1\},\{[^{}]{0,100}value:0\}\]')
BAR300_AUTO_REBOOT_FORM = re.compile(r'RGAutoReboot:\{id:"autoReboot"[^{}]{0,300}data:\[\{[^{}]{0,100}value:1\},\{[^{}]{0,100}value:0\}\]')
BAR300_POWER_SWITCHES = (
    ("enable_wol", BAR300_WOL_FORM, "networkWakeEnabled", "networkWake"),
    ("faceWakeUp", BAR300_FACE_WAKE_FORM, "faceWakeEnabled", "faceWake"),
    ("sleepCloseAPP", BAR300_SLEEP_CLEAN_FORM, "clearMemoryInSleepEnabled", "clearMemoryInSleep"),
    ("autoReboot", BAR300_AUTO_REBOOT_FORM, "automaticRestartEnabled", "automaticRestart"),
)


def _open_huawei_300_log_stream(options: dict[str, Any]) -> _HuaweiLogStream:
    """Open only the bundle-confirmed XML export and retain at most its prefix."""
    ip = str(options["ip"])
    cookie = str(options.get("cookie") or "")
    nonce = str(options.get("nonce") or "")
    if not cookie or not re.fullmatch(r"0\.\d{12}", nonce):
        raise HuaweiContractError("log_contract_unconfirmed")
    connection = http.client.HTTPSConnection(
        ip, 443, timeout=30, context=_https_context(options["reject_unauthorized"], None)
    )
    try:
        connection.request("GET", f"/log?rmd={nonce}", headers={
            "Cookie": cookie,
            "Referer": f"https://{ip}/",
            "Accept": "*/*",
            "User-Agent": browser_request_headers(ip)["User-Agent"],
        })
        response = connection.getresponse()
        content_type = str(response.getheader("Content-Type") or "").split(";", 1)[0].strip().lower()
        if response.status != 200 or content_type not in {
            "application/x-octet-stream", "application/octet-stream", "application/xml", "text/xml"
        }:
            raise HuaweiContractError("log_contract_unconfirmed")
        prefix = response.read(4096)
        if not prefix.lstrip().startswith(b"<?xml") or b"<LogModule" not in prefix:
            raise HuaweiContractError("log_contract_unconfirmed")
        return _HuaweiLogStream(connection, response, prefix)
    except Exception:
        connection.close()
        raise


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


def _read_bar300_http(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if not BAR300_HTTP_GROUP.search(bundle) or not BAR300_HTTP_FORM.search(bundle):
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(SITE_NAME_ACTION, {"CfgIDString": ["enable_http"], "acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    code = data.get("enable_http") if isinstance(data, dict) else None
    if outer.get("success") != 1 or type(code) is not int or code not in (0, 1, 2):
        return {"status": "unavailable", "value": None}
    return {"status": "read", "value": "enabled" if code == 1 else "disabled", "source": "WEB_GetCfgParamAPI:enable_http"}


def _read_bar300_telnet(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if not BAR300_TELNET_GROUP.search(bundle) or not BAR300_TELNET_FORM.search(bundle):
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(SITE_NAME_ACTION, {"CfgIDString": ["enabletelnet"], "acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    code = data.get("enabletelnet") if isinstance(data, dict) else None
    if outer.get("success") != 1 or type(code) is not int or code not in (0, 1, 2):
        return {"status": "unavailable", "value": None}
    return {"status": "read", "value": "enabled" if code == 1 else "disabled", "source": "WEB_GetCfgParamAPI:enabletelnet"}


def _read_bar300_ssh(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if not BAR300_SSH_GROUP.search(bundle) or not BAR300_SSH_FORM.search(bundle):
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(SITE_NAME_ACTION, {"CfgIDString": ["enable_ssh"], "acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    code = data.get("enable_ssh") if isinstance(data, dict) else None
    if outer.get("success") != 1 or type(code) is not int or code not in (0, 1, 2):
        return {"status": "unavailable", "value": None}
    return {"status": "read", "value": "enabled" if code == 1 else "disabled", "source": "WEB_GetCfgParamAPI:enable_ssh"}


def _read_bar300_auto_answer(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if not BAR300_ANSWER_GROUP.search(bundle) or not BAR300_ANSWER_FORM.search(bundle):
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(SITE_NAME_ACTION, {"CfgIDString": ["autoreply"], "acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    code = data.get("autoreply") if isinstance(data, dict) else None
    if outer.get("success") != 1 or type(code) is not int or code not in (0, 1):
        return {"status": "unavailable", "value": None}
    return {"status": "read", "value": "enabled" if code == 0 else "disabled", "source": "WEB_GetCfgParamAPI:autoreply"}


def _read_bar300_ntp(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if not (BAR300_NTP_GROUP.search(bundle) and BAR300_NTP_ENABLE_FORM.search(bundle)
            and BAR300_NTP_MODE_FORM.search(bundle) and BAR300_NTP_SERVER_MARKER in bundle):
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(SITE_NAME_ACTION, {"CfgIDString": ["synSerTime", "ntpGetMode", "timeServer"], "acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    enabled = data.get("synSerTime") if isinstance(data, dict) else None
    mode = data.get("ntpGetMode") if isinstance(data, dict) else None
    server = data.get("timeServer") if isinstance(data, dict) else None
    if (outer.get("success") != 1 or type(enabled) is not int or enabled not in (0, 1)
            or type(mode) is not int or mode not in (0, 1) or not isinstance(server, str)
            or len(server) > 255 or any(ord(char) < 32 for char in server)
            or (enabled == 1 and mode == 1 and not server)):
        return {"status": "unavailable", "value": None}
    return {"status": "read", "value": {"enabled": enabled == 1, "modeCode": mode,
                                        "mode": "manual" if mode == 1 else "automatic", "server": server},
            "source": "WEB_GetCfgParamAPI:synSerTime,ntpGetMode,timeServer"}


def _read_bar300_wifi(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if not all(marker in bundle for marker in BAR300_WIFI_MARKERS):
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(BAR300_WIFI_STATUS_ACTION, {"acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    mode = data.get("ucWifiMode") if isinstance(data, dict) else None
    if outer.get("success") != 1 or type(mode) is not int or mode not in (0, 1, 2, 3):
        return {"status": "unavailable", "value": None}
    return {"status": "read", "value": {"modeCode": mode, "clientEnabled": mode in (2, 3),
                                        "accessPointEnabled": mode in (1, 3)},
            "source": "WEB_GetWifiStatModeAPI:ucWifiMode"}


def _read_bar300_auto_update(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if not all(marker in bundle for marker in BAR300_SERVER_TYPE_MARKERS):
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(SITE_NAME_ACTION, {"CfgIDString": ["cloudType"], "acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    code = data.get("cloudType") if isinstance(data, dict) else None
    if outer.get("success") != 1 or type(code) is not int or code not in BAR300_SERVER_TYPE_CODES:
        return {"status": "unavailable", "value": None}
    return {"status": "read", "value": "disabled" if code == 7 else "enabled",
            "source": "WEB_GetCfgParamAPI:cloudType", "serverTypeCode": code,
            "basis": "server_type_audit_rule", "ruleVersion": "bar300-cloud-type-audit-v1",
            "meaning": "firmware_update_capability"}


def _read_bar300_sleep(bundle: str, action: Any, csrf: str) -> dict[str, Any]:
    if not all(marker in bundle for marker in BAR300_SLEEP_MARKERS):
        return {"status": "protocol_required", "value": None}
    try:
        outer, data = action(SITE_NAME_ACTION, {"CfgIDString": ["sleepTime"], "acCSRFToken": csrf})
    except Exception:
        return {"status": "unavailable", "value": None}
    code = data.get("sleepTime") if isinstance(data, dict) else None
    if outer.get("success") != 1 or type(code) is not int or code not in BAR300_SLEEP_CODES:
        return {"status": "unavailable", "value": None}
    field = {"status": "read", "value": {"sleepTimeCode": code,
                                         "sleepMode": "never" if code == 0 else "interval"},
             "source": "WEB_GetCfgParamAPI:sleepTime",
             "unconfirmedFields": ["networkWake", "faceWake", "clearMemoryInSleep", "automaticRestart"]}
    for setting_id, form, property_name, unknown_name in BAR300_POWER_SWITCHES:
        if not form.search(bundle):
            continue
        try:
            switch_outer, switch_data = action(SITE_NAME_ACTION, {"CfgIDString": [setting_id], "acCSRFToken": csrf})
            switch_code = switch_data.get(setting_id) if isinstance(switch_data, dict) else None
            if switch_outer.get("success") == 1 and type(switch_code) is int and switch_code in (0, 1):
                field["value"][property_name] = switch_code == 1
                field["source"] += "," + setting_id
                field["unconfirmedFields"].remove(unknown_name)
                if setting_id == "autoReboot" and switch_code == 1:
                    field["unconfirmedFields"].append("automaticRestartIntervalDays")
        except Exception:
            pass
    return field


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
        device_settings = unknown_device_settings(label, not_exposed=("snmpV2", "autoUpdate"))
        device_settings["fields"]["snmpV2"]["reason"] = "version_not_supported"
        if model_key in ("bar300", "box300", "box600"):
            device_settings["fields"]["autoUpdate"] = _read_bar300_auto_update(bundle, action, csrf)
            device_settings["fields"]["http"] = _read_bar300_http(bundle, action, csrf)
            device_settings["fields"]["telnet"] = _read_bar300_telnet(bundle, action, csrf)
            device_settings["fields"]["ssh"] = _read_bar300_ssh(bundle, action, csrf)
            device_settings["fields"]["autoAnswer"] = _read_bar300_auto_answer(bundle, action, csrf)
            device_settings["fields"]["ntp"] = _read_bar300_ntp(bundle, action, csrf)
            device_settings["fields"]["wifi"] = _read_bar300_wifi(bundle, action, csrf)
            device_settings["fields"]["powerManagement"] = _read_bar300_sleep(bundle, action, csrf)
        if model_key in ("box300", "box600"):
            device_settings["validationStatus"] = "confirmed_user_validation"
            for field in device_settings["fields"].values():
                if field.get("status") == "read":
                    field["validationStatus"] = "confirmed_user_validation"
        log_collection = None
        if settings.get("collect_logs") is True:
            if not callable(settings.get("on_log")):
                log_collection = {"status": "failed", "safeError": "log_sink_unavailable"}
            elif not all(marker in bundle for marker in LOG_EXPORT_BUNDLE_MARKERS) or not _cookie_header(cookies):
                log_collection = {"status": "protocol_required"}
            else:
                stream = None
                try:
                    opener = settings.get("log_opener") or _open_huawei_300_log_stream
                    stream = opener({"ip": ip, "cookie": _cookie_header(cookies),
                                     "nonce": f"0.{secrets.randbelow(10**12):012d}",
                                     "reject_unauthorized": reject_unauthorized})
                    response = settings["on_log"](stream, {"ip": ip, "filename": f"{ip}.xml"})
                    if not isinstance(response, dict) or response.get("status") not in {"saved", "failed"}:
                        raise HuaweiContractError("log_ack_invalid")
                    log_collection = {"status": response["status"],
                                      "validationStatus": "confirmed_user_validation"}
                    if response["status"] == "failed":
                        log_collection["safeError"] = "log_save_failed"
                except BaseException as error:
                    if isinstance(error, (KeyboardInterrupt, SystemExit)):
                        raise
                    log_collection = {"status": "failed", "safeError": error.code if isinstance(error, HuaweiContractError) else "log_download_failed"}
                finally:
                    if stream is not None:
                        try:
                            stream.close()
                        except Exception:
                            pass
        blocks = build_web_blocks(resources, ip)
        if site_name["status"] == "read":
            blocks["Device Info"]["Site Name"] = site_name["value"]
        poe = mac.get("system_poeMAC_addr")
        if poe:
            blocks["LAN Settings"]["POE MAC Address"] = poe
        for source, label_name in (("CPLDVersion", "CPLD Version"), ("FPGAVersion", "FPGA Version"), ("MBVersion", "Mainboard Version")):
            if version.get(source):
                blocks["Firmware"][label_name] = version[source]
        result = {
            **base, "ok": True,
            "webInterface": {"ok": True, "evidence": f"Huawei {label} current CGI and identity markers confirmed", "insecureTls": not reject_unauthorized},
            "webBlocks": blocks,
            "siteName": site_name,
            "deviceSettings": device_settings,
            "rawResources": sanitize_result(resources),
            "readMode": "targeted",
            "diagnostics": {"attemptedResourceKeys": list(RESOURCE_ACTIONS), "resourceErrors": resource_errors},
        }
        if log_collection is not None:
            result["logCollection"] = log_collection
        return result
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
