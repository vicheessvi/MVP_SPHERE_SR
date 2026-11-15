"""Guarded read-only HTTPS polling for exact Polycom RealPresence Group models."""

from __future__ import annotations

import gzip
import http.client
import io
import json
import math
import re
import socket
import ssl
import time
from http.cookies import SimpleCookie
from typing import Any, Callable

from mvp_runtime.redaction import sanitize_result
from mvp_runtime.adapters.device_settings import unknown_device_settings


MAC_NAME = "system.network.wired.ethernet.macaddress"
SETTING_CONFIG_NAMES = {
    "telnet": ("security.remoteaccess.telnet.enabled",),
    "http": ("security.remoteaccess.web.enabled", "security.remoteaccess.web.httpsonly",
             "security.remoteaccess.web.httpport"),
    "snmpV2": ("management.snmp.enabled", "management.snmp.versiontwo"),
    "autoUpdate": ("softupdate.pollingenabled",),
    "autoAnswer": ("comm.callsetting.callfeatures.autoanswer.answersinglecall",
                   "comm.callsetting.callfeatures.autoanswer.answermultipointcall"),
    "ntp": ("time.timeserver.mode", "time.timeserver.address", "time.timeserver.address1"),
    "ssh": ("security.remoteaccess.ssh.enabled",),
    "powerManagement": ("system.remote.hangupkeylongpressfunc",),
}
SAFE_CONFIG_NAMES = frozenset({name for names in SETTING_CONFIG_NAMES.values() for name in names})
TELNET_BUNDLE_MARKERS = (
    'SECURITY_REMOTEACCESS_TELNET_ENABLED:"security.remoteaccess.telnet.enabled"',
    'name:"enableTelnetAccess",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_TELNET_ENABLED',
)
HTTP_BUNDLE_MARKERS = (
    'SECURITY_REMOTEACCESS_WEB_ENABLED:"security.remoteaccess.web.enabled"',
    'SECURITY_REMOTEACCESS_WEB_HTTPSONLY:"security.remoteaccess.web.httpsonly"',
    'SECURITY_REMOTEACCESS_WEB_HTTPPORT:"security.remoteaccess.web.httpport"',
    'name:"enableWebAccess",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_WEB_ENABLED',
    'name:"httpsOnly",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_WEB_HTTPSONLY',
    'name:"webAccessPort",type:"int",varsName:configfqnames.SECURITY_REMOTEACCESS_WEB_HTTPPORT',
)
SNMP_BUNDLE_MARKERS = (
    'MANAGEMENT_SNMP_ENABLED:"management.snmp.enabled"',
    'MANAGEMENT_SNMP_VERSIONTWO:"management.snmp.versiontwo"',
    'name:"enableSNMPAccess",type:"boolean",varsName:configfqnames.MANAGEMENT_SNMP_ENABLED',
    'varsName:configfqnames.MANAGEMENT_SNMP_VERSIONTWO',
)
AUTO_UPDATE_BUNDLE_MARKERS = (
    'SOFTUPDATE_POLLINGENABLED:"softupdate.pollingenabled"',
    'name:"enableAutomaticUpdates",type:"boolean",varsName:configfqnames.SOFTUPDATE_POLLINGENABLED',
)
AUTO_ANSWER_BUNDLE_MARKERS = (
    'COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERSINGLECALL:"comm.callsetting.callfeatures.autoanswer.answersinglecall"',
    'COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERMULTIPOINTCALL:"comm.callsetting.callfeatures.autoanswer.answermultipointcall"',
    'name:"autoAnswerSingleCall",type:"string",varsName:configfqnames.COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERSINGLECALL',
    'name:"autoAnswerMultiPointCall",type:"string",varsName:configfqnames.COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERMULTIPOINTCALL',
)
NTP_BUNDLE_MARKERS = (
    'TIME_TIMESERVER_MODE:"time.timeserver.mode"',
    'TIME_TIMESERVER_ADDRESS:"time.timeserver.address"',
    'name:"timeServerMode",type:"string",varsName:configfqnames.TIME_TIMESERVER_MODE',
    'name:"timeServerAddress",type:"string",varsName:configfqnames.TIME_TIMESERVER_ADDRESS',
    'name:"secondaryTimeServerAddress",type:"string",varsName:configfqnames.TIME_TIMESERVER_ADDRESS,instanceName:"1"',
    'a[b-1]+=c.instanceName',
)
SSH_LEGACY_BUNDLE_MARKERS = (
    'SECURITY_REMOTEACCESS_SSH_ENABLED:"security.remoteaccess.ssh.enabled"',
    'name:"enableSshAccess",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_SSH_ENABLED',
)
POWER_BUTTON_BUNDLE_MARKERS = (
    'SYSTEM_REMOTE_HANGUPKEYLONGPRESSFUNC:"system.remote.hangupkeylongpressfunc"',
    'addIndividualStoreVar("hangupButtonLongPress","SYSTEM_REMOTE_HANGUPKEYLONGPRESSFUNC")',
)
MAC_PATTERN = re.compile(r"^(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$")
SCRIPT_PATTERN = re.compile(r"(?:^|/)\b(login|main)\.js\?build=([0-9]{1,12})$")
SCRIPT_SRC_PATTERN = re.compile(r"<script\b[^>]*\bsrc\s*=\s*['\"]([^'\"]+)['\"]", re.I)
LOGIN_MARKERS = ("Polycom", "/rest/session", 'action:"Login"', 'action:"Logout"')
MAIN_MARKERS = (
    '"/rest/system","GET"',
    '"/rest/system/status"',
    '"/rest/system/time"',
    '"/rest/system/uptime"',
    '"/rest/config"',
    "generateReadJson:function",
    "names:d",
    MAC_NAME,
)
SYSTEM_PATH = "/rest/system"
STATUS_PATH = "/rest/system/status"
TIME_PATH = "/rest/system/time"
UPTIME_PATH = "/rest/system/uptime"
CONFIG_PATH = "/rest/config"
SESSION_PATH = "/rest/session"

CONTRACTS = {
    310: {"id": "polycom-group310-web-v1", "model": "RealPresence Group 310", "evidence": "confirmed_user_validation"},
    300: {"id": "polycom-group300-web-v1", "model": "RealPresence Group 300", "evidence": "confirmed_user_validation"},
    500: {"id": "polycom-group500-web-v1", "model": "RealPresence Group 500", "evidence": "confirmed_user_validation"},
    700: {"id": "polycom-group700-web-v1", "model": "RealPresence Group 700", "evidence": "confirmed_user_validation"},
}


class PolycomContractError(RuntimeError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _error_code(error: BaseException) -> str:
    if isinstance(error, PolycomContractError):
        return error.code
    if isinstance(error, ssl.SSLCertVerificationError):
        return "tls_certificate_rejected"
    if isinstance(error, ssl.SSLError):
        return "tls_handshake_failed"
    if isinstance(error, (TimeoutError, socket.timeout)):
        return "request_timeout"
    if isinstance(error, (OSError, ConnectionError)):
        return "transport_error"
    return "adapter_failed"


def _utc_iso(now: Callable[[], float] | None = None) -> str:
    timestamp = float((now or time.time)())
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(timestamp)) + f".{int(timestamp % 1 * 1000):03d}Z"


def _tls_context(reject_unauthorized: bool) -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    if reject_unauthorized:
        context.check_hostname = True
        context.verify_mode = ssl.CERT_REQUIRED
        context.load_default_certs()
    else:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
        context.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0)
        context.set_ciphers("DEFAULT:@SECLEVEL=0")
    return context


def native_https_request(options: dict[str, Any]) -> dict[str, Any]:
    """The sole production transport: one exact IP, HTTPS/443, bounded GET/POST."""
    from mvp_runtime.polling import normalize_ipv4

    ip = normalize_ipv4(options.get("ip"))
    method = str(options.get("method") or "GET").upper()
    path = str(options.get("path") or "")
    if not ip or method not in {"GET", "POST"} or not path.startswith("/") or path.startswith("//") or "\r" in path or "\n" in path:
        raise PolycomContractError("request_invalid")
    timeout = max(0.25, min(float(options.get("timeout_ms") or 8000) / 1000, 30.0))
    maximum = max(1, min(int(options.get("max_bytes") or 1024 * 1024), 8 * 1024 * 1024))
    body = options.get("body")
    if isinstance(body, str):
        body = body.encode("utf-8")
    connection = http.client.HTTPSConnection(ip, 443, timeout=timeout, context=_tls_context(options.get("reject_unauthorized") is not False))
    try:
        connection.request(method, path, body=body, headers=dict(options.get("headers") or {}))
        response = connection.getresponse()
        raw = response.read(maximum + 1)
        if len(raw) > maximum:
            raise PolycomContractError("response_too_large")
        return {"status_code": response.status, "headers": response.getheaders(), "body": raw}
    finally:
        connection.close()


def _header_values(headers: Any, name: str) -> list[str]:
    expected = name.casefold()
    if isinstance(headers, dict):
        return [str(value) for key, value in headers.items() if str(key).casefold() == expected]
    if isinstance(headers, (list, tuple)):
        return [str(item[1]) for item in headers if isinstance(item, (tuple, list)) and len(item) >= 2 and str(item[0]).casefold() == expected]
    return []


def _body_text(response: dict[str, Any], decoded_limit: int = 1024 * 1024) -> str:
    body = response.get("body")
    if isinstance(body, str):
        raw = body.encode("utf-8")
    elif isinstance(body, bytes):
        raw = body
    else:
        raise PolycomContractError("response_schema_unconfirmed")
    encodings = _header_values(response.get("headers"), "Content-Encoding")
    if encodings:
        if len(encodings) != 1 or encodings[0].casefold() != "gzip":
            raise PolycomContractError("response_encoding_unconfirmed")
        try:
            with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
                raw = stream.read(decoded_limit + 1)
        except (OSError, EOFError) as error:
            raise PolycomContractError("response_encoding_unconfirmed") from error
    if len(raw) > decoded_limit:
        raise PolycomContractError("response_too_large")
    return raw.decode("utf-8", "replace")


def _json_response(response: dict[str, Any]) -> Any:
    if int(response.get("status_code") or 0) != 200:
        raise PolycomContractError("resource_http_error")
    try:
        return json.loads(_body_text(response))
    except (json.JSONDecodeError, UnicodeError) as error:
        raise PolycomContractError("response_schema_unconfirmed") from error


def _script_path(html: str, name: str) -> tuple[str, str]:
    candidates = []
    for source in SCRIPT_SRC_PATTERN.findall(html):
        match = SCRIPT_PATTERN.fullmatch(source)
        if match and match.group(1) == name:
            candidates.append((f"/{name}.js?build={match.group(2)}", match.group(2)))
    if len(candidates) != 1:
        raise PolycomContractError("unsupported_web_contract")
    return candidates[0]


def _update_session_cookie(cookies: dict[str, str], headers: Any) -> None:
    for value in _header_values(headers, "Set-Cookie"):
        if len(value) > 4096:
            continue
        parsed = SimpleCookie()
        try:
            parsed.load(value)
        except Exception:
            continue
        morsel = parsed.get("session_id")
        if morsel is not None and re.fullmatch(r"[A-Za-z0-9._~+/=-]{1,512}", morsel.value):
            cookies["session_id"] = morsel.value


def _safe_text(value: Any, secrets: tuple[str, ...], limit: int = 256) -> str | None:
    if not isinstance(value, str) or not value.strip() or len(value) > limit or any(ord(char) < 32 for char in value):
        return None
    cleaned = value.strip()
    if any(secret and (cleaned == secret or len(secret) >= 8 and secret in cleaned) for secret in secrets):
        return None
    return cleaned


def _safe_number(value: Any) -> int | float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        return None
    return value


def _safe_mac(value: Any) -> str | None:
    return value.upper().replace("-", ":") if isinstance(value, str) and MAC_PATTERN.fullmatch(value) else None


def _read_exact_config_value(perform: Callable[..., dict[str, Any]], name: str) -> str:
    """Read one bundle-confirmed, non-secret setting without a neighboring config dump."""
    if name not in SAFE_CONFIG_NAMES:
        raise PolycomContractError("configuration_name_unconfirmed")
    config = _json_response(perform("POST", CONFIG_PATH, {"names": [name]}, maximum=65536))
    values = config.get("vars") if isinstance(config, dict) else None
    if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], dict) or values[0].get("name") != name:
        raise PolycomContractError("configuration_schema_unconfirmed")
    row = values[0]
    if row.get("isSecure") not in (None, False, "False", "false"):
        raise PolycomContractError("configuration_schema_unconfirmed")
    value = row.get("value")
    if not isinstance(value, str) or len(value) > 256 or any(ord(char) < 32 for char in value):
        raise PolycomContractError("configuration_schema_unconfirmed")
    return value


def _polycom_string_bool(value: str) -> bool | None:
    normalized = value.strip().casefold()
    return True if normalized == "true" else False if normalized == "false" else None


def _polycom_yes_no(value: str) -> str | None:
    normalized = value.strip().casefold()
    return "enabled" if normalized == "yes" else "disabled" if normalized == "no" else None


def _planned_model(device: dict[str, Any]) -> str:
    return re.sub(r"\s+", " ", str(device.get("modelRaw") or device.get("model") or device.get("modelNormalized") or "").strip().casefold())


def poll_polycom_group_device(device: dict[str, Any], credentials: Any, model_number: int, options: dict[str, Any] | None = None) -> dict[str, Any]:
    """Poll an exact Group model; no management command or config write exists here."""
    from mvp_runtime.polling import normalize_ipv4

    contract = CONTRACTS[model_number]
    settings = options or {}
    ip = normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
    base: dict[str, Any] = {
        "ip": ip,
        "capturedAt": _utc_iso(settings.get("now")),
        "ok": False,
        "failedStage": None,
        "loginAttempts": [],
        "credentialAttempts": 0,
        "vendorPolling": {"status": "supported", "contract": contract["id"], "model": contract["model"], "evidenceStatus": contract["evidence"]},
    }
    planned = _planned_model(device)
    allowed_names = {contract["model"].casefold(), f"polycom {contract['model']}".casefold()}
    if not ip or planned not in allowed_names:
        return {**base, "failedStage": "validation", "safeError": "invalid_or_unsupported_target"}
    pool = credentials if isinstance(credentials, list) else [credentials]
    pool = [item for item in pool if isinstance(item, dict) and item.get("username") and item.get("password")]
    if not pool:
        return {**base, "failedStage": "credentials", "safeError": "credential_missing"}
    secrets = tuple(str(value) for item in pool for value in (item["username"], item["password"]))
    request = settings.get("request") or native_https_request
    reject_unauthorized = not (device.get("allowInsecureTls") is True or settings.get("allow_insecure_tls") is True)
    timeout_ms = settings.get("timeout_ms") or 8000
    cookies: dict[str, str] = {}
    session_opened = False

    def perform(method: str, path: str, body: dict[str, Any] | None = None, maximum: int = 1024 * 1024) -> dict[str, Any]:
        headers = {
            "Accept": "application/json, text/html, */*",
            "Content-Type": "application/json;charset=UTF-8",
            "Origin": f"https://{ip}",
            "Referer": f"https://{ip}/login.html",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36",
        }
        if cookies:
            headers["Cookie"] = "; ".join(f"{key}={value}" for key, value in cookies.items())
        response = request({
            "ip": ip,
            "method": method,
            "path": path,
            "headers": headers,
            "body": None if body is None else json.dumps(body, ensure_ascii=False, separators=(",", ":")),
            "reject_unauthorized": reject_unauthorized,
            "timeout_ms": timeout_ms,
            "max_bytes": maximum,
        })
        _update_session_cookie(cookies, response.get("headers"))
        return response

    try:
        login_page = perform("GET", "/login.html")
        if int(login_page.get("status_code") or 0) != 200:
            raise PolycomContractError("unsupported_web_contract")
        html = _body_text(login_page)
        if not re.search(r"<title[^>]*>\s*Polycom Login\s*</title>", html, re.I):
            raise PolycomContractError("unsupported_web_contract")
        login_path, login_build = _script_path(html, "login")
        login_bundle = perform("GET", login_path, maximum=4 * 1024 * 1024)
        if int(login_bundle.get("status_code") or 0) != 200 or not all(marker in _body_text(login_bundle, 8 * 1024 * 1024) for marker in LOGIN_MARKERS):
            raise PolycomContractError("unsupported_web_contract")
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        cookies.clear()
        return {**base, "failedStage": "validation", "safeError": _error_code(error)}

    for index, candidate in enumerate(pool):
        try:
            login_response = perform("POST", SESSION_PATH, {"action": "Login", "user": candidate["username"], "password": candidate["password"]})
            login_data = _json_response(login_response)
            accepted = isinstance(login_data, dict) and login_data.get("success") is True and bool(cookies.get("session_id"))
            base["loginAttempts"].append({"attempt": index + 1, "ok": accepted})
            base["credentialAttempts"] = index + 1
            if accepted:
                session_opened = True
                break
            cookies.clear()
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            cookies.clear()
            return {**base, "failedStage": "authorization", "safeError": _error_code(error)}
    if not session_opened:
        return {**base, "failedStage": "authorization", "safeError": "authorization_failed"}

    result: dict[str, Any]
    try:
        index_page = perform("GET", "/index.html")
        if int(index_page.get("status_code") or 0) != 200:
            raise PolycomContractError("unsupported_web_contract")
        main_path, main_build = _script_path(_body_text(index_page), "main")
        if main_build != login_build:
            raise PolycomContractError("unsupported_web_contract")
        main_bundle = perform("GET", main_path, maximum=8 * 1024 * 1024)
        if int(main_bundle.get("status_code") or 0) != 200:
            raise PolycomContractError("unsupported_web_contract")
        main_text = _body_text(main_bundle, 16 * 1024 * 1024)
        if not all(marker in main_text for marker in MAIN_MARKERS):
            raise PolycomContractError("unsupported_web_contract")

        system = _json_response(perform("GET", SYSTEM_PATH))
        if not isinstance(system, dict) or not isinstance(system.get("model"), str):
            raise PolycomContractError("resource_schema_unconfirmed")
        if system["model"] != contract["model"]:
            raise PolycomContractError("target_model_mismatch")
        firmware = _safe_text(system.get("softwareVersion"), secrets, 160)
        if not firmware:
            raise PolycomContractError("resource_schema_unconfirmed")
        serial = _safe_text(system.get("serialNumber"), secrets, 120)
        if serial and not re.fullmatch(r"[A-Za-z0-9._/-]{3,120}", serial):
            serial = None

        resource_errors: dict[str, str] = {}
        mac = None
        try:
            config = _json_response(perform("POST", CONFIG_PATH, {"names": [MAC_NAME]}))
            values = config.get("vars") if isinstance(config, dict) else None
            if not isinstance(values, list) or len(values) != 1 or not isinstance(values[0], dict) or values[0].get("name") != MAC_NAME:
                raise PolycomContractError("configuration_schema_unconfirmed")
            mac = _safe_mac(values[0].get("value"))
            if not mac:
                resource_errors["mac"] = "configuration_schema_unconfirmed"
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            resource_errors["mac"] = _error_code(error)
        if not serial and not mac:
            raise PolycomContractError("stable_identity_missing")

        device_settings = unknown_device_settings(contract["model"], not_exposed=("wifi",))
        settings_validation = "confirmed_user_validation"
        device_settings["validationStatus"] = settings_validation
        if all(marker in main_text for marker in TELNET_BUNDLE_MARKERS):
            try:
                telnet_name = SETTING_CONFIG_NAMES["telnet"][0]
                enabled = _polycom_string_bool(_read_exact_config_value(perform, telnet_name))
                if enabled is None:
                    raise PolycomContractError("configuration_value_unconfirmed")
                device_settings["fields"]["telnet"] = {
                    "status": "read", "value": "enabled" if enabled else "disabled",
                    "source": f"POST /rest/config:{telnet_name}",
                    "validationStatus": "confirmed_user_validation" if model_number == 310 else settings_validation,
                }
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                device_settings["fields"]["telnet"] = {"status": "unavailable", "value": None}
                resource_errors["settings.telnet"] = _error_code(error)
        if all(marker in main_text for marker in HTTP_BUNDLE_MARKERS):
            try:
                web_name, only_name, port_name = SETTING_CONFIG_NAMES["http"]
                web_enabled = _polycom_string_bool(_read_exact_config_value(perform, web_name))
                https_only = _polycom_string_bool(_read_exact_config_value(perform, only_name))
                port_raw = _read_exact_config_value(perform, port_name)
                if web_enabled is None or https_only is None or not re.fullmatch(r"[0-9]{1,5}", port_raw):
                    raise PolycomContractError("configuration_value_unconfirmed")
                configured_port = int(port_raw)
                if not 1 <= configured_port <= 65535:
                    raise PolycomContractError("configuration_value_unconfirmed")
                device_settings["fields"]["http"] = {
                    "status": "read", "value": "enabled" if web_enabled and not https_only else "disabled",
                    "source": f"POST /rest/config:{web_name},{only_name},{port_name}",
                    "webAccessEnabled": web_enabled, "httpsOnly": https_only, "configuredPort": configured_port,
                    "meaning": "web_http_allowed",
                    "validationStatus": "confirmed_user_validation" if model_number == 310 else settings_validation,
                }
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                device_settings["fields"]["http"] = {"status": "unavailable", "value": None}
                resource_errors["settings.http"] = _error_code(error)
        if all(marker in main_text for marker in SNMP_BUNDLE_MARKERS):
            try:
                service_name, version_name = SETTING_CONFIG_NAMES["snmpV2"]
                service_enabled = _polycom_string_bool(_read_exact_config_value(perform, service_name))
                configured_enabled = _polycom_string_bool(_read_exact_config_value(perform, version_name))
                if service_enabled is None or configured_enabled is None:
                    raise PolycomContractError("configuration_value_unconfirmed")
                device_settings["fields"]["snmpV2"] = {
                    "status": "read", "value": "enabled" if service_enabled and configured_enabled else "disabled",
                    "source": f"POST /rest/config:{service_name},{version_name}",
                    "serviceEnabled": service_enabled, "configuredEnabled": configured_enabled,
                    "validationStatus": "confirmed_user_validation" if model_number == 310 else settings_validation,
                }
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                device_settings["fields"]["snmpV2"] = {"status": "unavailable", "value": None}
                resource_errors["settings.snmpV2"] = _error_code(error)
        if all(marker in main_text for marker in AUTO_UPDATE_BUNDLE_MARKERS):
            try:
                auto_name = SETTING_CONFIG_NAMES["autoUpdate"][0]
                enabled = _polycom_string_bool(_read_exact_config_value(perform, auto_name))
                if enabled is None:
                    raise PolycomContractError("configuration_value_unconfirmed")
                device_settings["fields"]["autoUpdate"] = {
                    "status": "read", "value": "enabled" if enabled else "disabled",
                    "source": f"POST /rest/config:{auto_name}",
                    "validationStatus": "confirmed_user_validation" if model_number == 310 else settings_validation,
                }
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                device_settings["fields"]["autoUpdate"] = {"status": "unavailable", "value": None}
                resource_errors["settings.autoUpdate"] = _error_code(error)
        if all(marker in main_text for marker in AUTO_ANSWER_BUNDLE_MARKERS):
            answer_names = SETTING_CONFIG_NAMES["autoAnswer"]
            modes: dict[str, str | None] = {}
            unconfirmed: list[str] = []
            for label, name in zip(("pointToPoint", "multipoint"), answer_names):
                try:
                    mode = _polycom_yes_no(_read_exact_config_value(perform, name))
                    if mode is None:
                        raise PolycomContractError("configuration_value_unconfirmed")
                    modes[label] = mode
                except BaseException as error:
                    if isinstance(error, (KeyboardInterrupt, SystemExit)):
                        raise
                    modes[label] = None
                    unconfirmed.append(label)
                    resource_errors[f"settings.autoAnswer.{label}"] = _error_code(error)
            if len(unconfirmed) < 2:
                device_settings["fields"]["autoAnswer"] = {
                    "status": "read", "value": modes,
                    "source": f"POST /rest/config:{','.join(answer_names)}",
                    "validationStatus": "confirmed_user_validation" if model_number == 310 else settings_validation,
                    **({"unconfirmedFields": unconfirmed} if unconfirmed else {}),
                }
            else:
                device_settings["fields"]["autoAnswer"] = {"status": "unavailable", "value": None}
        if all(marker in main_text for marker in NTP_BUNDLE_MARKERS):
            try:
                mode_name, primary_name, secondary_name = SETTING_CONFIG_NAMES["ntp"]
                raw_mode = _read_exact_config_value(perform, mode_name)
                if raw_mode.casefold() != "manual":
                    raise PolycomContractError("configuration_value_unconfirmed")
                servers: dict[str, str | None] = {}
                unconfirmed_servers: list[str] = []
                for label, name in (("primaryServer", primary_name), ("secondaryServer", secondary_name)):
                    try:
                        raw_server = _read_exact_config_value(perform, name)
                        safe_server = "" if label == "secondaryServer" and raw_server == "" else _safe_text(raw_server, secrets, 255)
                        if safe_server is None:
                            raise PolycomContractError("configuration_value_unconfirmed")
                        servers[label] = safe_server
                    except BaseException as error:
                        if isinstance(error, (KeyboardInterrupt, SystemExit)):
                            raise
                        servers[label] = None
                        unconfirmed_servers.append(label)
                        resource_errors[f"settings.ntp.{label}"] = _error_code(error)
                device_settings["fields"]["ntp"] = {
                    "status": "read", "value": {"enabled": True, "mode": "manual", "modeCode": raw_mode, **servers},
                    "source": f"POST /rest/config:{mode_name},{primary_name},{secondary_name}",
                    "validationStatus": "confirmed_user_validation" if model_number == 310 else settings_validation,
                    **({"unconfirmedFields": unconfirmed_servers} if unconfirmed_servers else {}),
                }
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                device_settings["fields"]["ntp"] = {"status": "unavailable", "value": None}
                resource_errors["settings.ntp"] = _error_code(error)
        if all(marker in main_text for marker in SSH_LEGACY_BUNDLE_MARKERS):
            try:
                ssh_name = SETTING_CONFIG_NAMES["ssh"][0]
                legacy_api_enabled = _polycom_string_bool(_read_exact_config_value(perform, ssh_name))
                if legacy_api_enabled is None:
                    raise PolycomContractError("configuration_value_unconfirmed")
                device_settings["fields"]["ssh"] = {
                    "status": "read", "value": {"legacyApiOverSshEnabled": legacy_api_enabled, "sshServiceEnabled": None},
                    "source": f"POST /rest/config:{ssh_name}", "meaning": "legacy_api_over_ssh_only",
                    "unconfirmedFields": ["sshServiceEnabled"],
                    "validationStatus": "confirmed_user_validation" if model_number == 310 else settings_validation,
                }
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                device_settings["fields"]["ssh"] = {"status": "unavailable", "value": None}
                resource_errors["settings.ssh"] = _error_code(error)
        if all(marker in main_text for marker in POWER_BUTTON_BUNDLE_MARKERS):
            try:
                power_name = SETTING_CONFIG_NAMES["powerManagement"][0]
                action_code = _read_exact_config_value(perform, power_name)
                if action_code != "Power_Off":
                    raise PolycomContractError("configuration_value_unconfirmed")
                device_settings["fields"]["powerManagement"] = {
                    "status": "read", "value": {"hangupLongPressAction": "power_off", "actionCode": action_code, "sleepMode": None},
                    "source": f"POST /rest/config:{power_name}", "meaning": "remote_hangup_long_press",
                    "unconfirmedFields": ["sleepMode"],
                    "validationStatus": "confirmed_user_validation" if model_number == 310 else settings_validation,
                }
            except BaseException as error:
                if isinstance(error, (KeyboardInterrupt, SystemExit)):
                    raise
                device_settings["fields"]["powerManagement"] = {"status": "unavailable", "value": None}
                resource_errors["settings.powerManagement"] = _error_code(error)

        status_rows: list[dict[str, Any]] = []
        try:
            status_data = _json_response(perform("GET", STATUS_PATH))
            if not isinstance(status_data, list) or len(status_data) > 64:
                raise PolycomContractError("resource_schema_unconfirmed")
            for item in status_data:
                if not isinstance(item, dict):
                    continue
                name = _safe_text(item.get("name"), secrets, 100)
                raw_state = item.get("state")
                state: str | list[str] | None = None
                if isinstance(raw_state, list) and len(raw_state) <= 16:
                    values = [_safe_text(value, secrets, 100) for value in raw_state]
                    state = [value for value in values if value] or None
                else:
                    state = _safe_text(raw_state, secrets, 100)
                if name and state:
                    status_rows.append({"name": name, "state": state})
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            resource_errors["status"] = _error_code(error)

        device_time = None
        try:
            device_time = _safe_number(_json_response(perform("GET", TIME_PATH)))
            if device_time is None:
                raise PolycomContractError("resource_schema_unconfirmed")
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            resource_errors["systemTime"] = _error_code(error)
        uptime = None
        try:
            uptime = _safe_number(_json_response(perform("GET", UPTIME_PATH)))
            if uptime is None:
                raise PolycomContractError("resource_schema_unconfirmed")
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            resource_errors["uptime"] = _error_code(error)

        safe_system = {
            "model": contract["model"],
            "serialNumber": serial,
            "softwareVersion": firmware,
            "build": _safe_text(system.get("build"), secrets, 80),
            "hardwareVersion": _safe_text(system.get("hardwareVersion"), secrets, 120),
            "systemName": _safe_text(system.get("systemName"), secrets, 256),
            "state": _safe_text(system.get("state"), secrets, 80),
            "systemTime": _safe_number(system.get("systemTime")),
            "uptime": _safe_number(system.get("uptime")),
            "macAddress": mac,
        }
        safe_system = {key: value for key, value in safe_system.items() if value is not None}
        system_name = safe_system.get("systemName")
        site_name = {"status": "read" if system_name else "unavailable", "value": system_name, "source": "polycom_system_name"}
        web_blocks = {
            "Device Info": {key: value for key, value in {
                "Model": contract["model"], "Serial Number": serial, "MAC Address": mac,
                "System Name": system_name, "Site Name": system_name,
            }.items() if value is not None},
            "Firmware": {key: value for key, value in {
                "Version": firmware, "Build": safe_system.get("build"), "Hardware Version": safe_system.get("hardwareVersion"),
            }.items() if value is not None},
            "Device Status": {key: value for key, value in {
                "State": safe_system.get("state"), "Uptime Raw": uptime, "System Time Raw": device_time,
            }.items() if value is not None},
            "LAN Settings": {key: value for key, value in {"IP Address": ip, "MAC Address": mac}.items() if value is not None},
        }
        result = {
            **base,
            "ok": True,
            "webInterface": {"ok": True, "evidence": "Polycom Group web REST read-only", "insecureTls": not reject_unauthorized, "tlsProfile": "system_default"},
            "webBlocks": web_blocks,
            "siteName": site_name,
            "deviceSettings": device_settings,
            "rawResources": sanitize_result({"system": safe_system, "status": status_rows, "systemTime": device_time, "uptime": uptime}),
            "readMode": "targeted",
            "diagnostics": {"attemptedResourceKeys": ["system", "mac", "status", "systemTime", "uptime"], "resourceErrors": resource_errors},
        }
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        code = _error_code(error)
        result = {**base, "failedStage": "resources" if code not in {"unsupported_web_contract"} else "adapter", "safeError": code}
    finally:
        try:
            logout = perform("POST", SESSION_PATH, {"action": "Logout"})
            if int(logout.get("status_code") or 0) != 200:
                raise PolycomContractError("logout_failed")
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            if "result" in locals():
                diagnostics = dict(result.get("diagnostics") or {})
                diagnostics["logoutError"] = _error_code(error)
                result["diagnostics"] = diagnostics
        cookies.clear()
    return result


def poll_polycom_group310_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_polycom_group_device(device, credentials, 310, options)


def poll_polycom_group300_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_polycom_group_device(device, credentials, 300, options)


def poll_polycom_group500_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_polycom_group_device(device, credentials, 500, options)


def poll_polycom_group700_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_polycom_group_device(device, credentials, 700, options)
