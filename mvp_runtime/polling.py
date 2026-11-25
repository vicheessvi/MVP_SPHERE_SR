"""Exact-allowlist sequential polling and additive adapter registry."""

from __future__ import annotations

import ipaddress
import re
import secrets
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable

from .catalog import CATALOG, resolve_management_action, resolve_manifest


class PollingError(RuntimeError):
    pass


class RetiredPortActionError(PollingError):
    code = "legacy_port_action_retired"


def reject_legacy_port_action(tasks) -> None:
    if "disable_insecure_management_services" in tasks:
        raise RetiredPortActionError("Bulk HTTP/Telnet closing is retired; choose an independent explicit port action")


class PollingCancelled(PollingError):
    code = "POLLING_CANCELLED"


TE20_ANSWER_TASKS = frozenset({"set_te20_auto_answer_automatic", "set_te20_auto_answer_manual"})
TE_FAMILY_ANSWER_TASKS = frozenset({"set_te_family_auto_answer_automatic", "set_te_family_auto_answer_manual"})
HUAWEI_310_ANSWER_TASKS = frozenset({"set_huawei_310_auto_answer_automatic", "set_huawei_310_auto_answer_manual"})
HUAWEI_300_ANSWER_TASKS = frozenset({"set_huawei_300_auto_answer_automatic", "set_huawei_300_auto_answer_manual"})
POLYCOM_ANSWER_TASK = "set_polycom_group_auto_answer"
ANSWER_TASK_GROUPS = (TE20_ANSWER_TASKS, TE_FAMILY_ANSWER_TASKS, HUAWEI_310_ANSWER_TASKS,
                      HUAWEI_300_ANSWER_TASKS, frozenset({POLYCOM_ANSWER_TASK}))
ALL_ANSWER_TASKS = frozenset().union(*ANSWER_TASK_GROUPS)
TE20_HTTP_TASKS = frozenset({"set_te20_http_open", "set_te20_http_closed"})
TE20_TELNET_TASKS = frozenset({"set_te20_telnet_open", "set_te20_telnet_closed"})
TE20_PORT_TASKS = TE20_HTTP_TASKS | TE20_TELNET_TASKS
TE20_AUTO_UPDATE_TASK = "disable_te20_auto_update"
TE20_SSH_TASKS = frozenset({"set_te20_ssh_enabled", "set_te20_ssh_disabled"})
TE20_NTP_TASK = "set_te20_ntp_settings"
TE20_POWER_TASK = "set_te20_power_settings"
POWER_SLEEP_VALUES = frozenset({0, 1, 5, 10, 15, 30, 60})
NTP_SERVER_PATTERN = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,40}\Z")
LOG_TRANSPORTS = frozenset({"huawei_te20_web_cgi_v1", "huawei_te_web_cgi_v1", "huawei_310_rest_v1",
                            "huawei_bar300_web_cgi_v1", "huawei_box300_web_cgi_v1", "huawei_box600_web_cgi_v1",
                            "polycom_group300_web_v1", "polycom_group310_web_v1", "polycom_group500_web_v1", "polycom_group700_web_v1"})
LOG_ADAPTER_KEYS = frozenset({"vcs/huawei/te20-legacy", "vcs/huawei/te-family", "vcs/huawei/bar310",
                              "vcs/huawei/box310", "vcs/huawei/box610", "vcs/huawei/bar300",
                              "vcs/huawei/box300", "vcs/huawei/box600",
                              "vcs/polycom/group300", "vcs/polycom/group310", "vcs/polycom/group500", "vcs/polycom/group700"})


def validate_ntp_changes(plan: dict[str, Any], requested_tasks: list[str]) -> None:
    changes = plan.get("ntpChanges")
    if TE20_NTP_TASK not in requested_tasks:
        if changes is not None:
            raise PollingError("NTP settings require the exact TE20 action")
        return
    if not isinstance(changes, dict) or set(changes) != {"enabled", "mode", "server"}:
        raise PollingError("NTP settings shape is invalid")
    enabled, mode, server = changes["enabled"], changes["mode"], changes["server"]
    if ((enabled is not None and type(enabled) is not bool)
            or mode not in (None, "automatic", "manual")
            or (server is not None and (not isinstance(server, str) or not NTP_SERVER_PATTERN.fullmatch(server)))
            or (enabled is None and mode is None and server is None)
            or (enabled is False and (mode is not None or server is not None))
            or (mode == "automatic" and server is not None)):
        raise PollingError("NTP settings are invalid or conflict")


def validate_power_changes(plan: dict[str, Any], requested_tasks: list[str]) -> None:
    changes = plan.get("powerChanges")
    if TE20_POWER_TASK not in requested_tasks:
        if changes is not None:
            raise PollingError("Power settings require the exact TE20 action")
        return
    if not isinstance(changes, dict) or set(changes) != {"shutdownRestart", "sleepMinutes", "scheduledRestart", "restartHour", "restartMinute"}:
        raise PollingError("Power settings shape is invalid")
    shutdown, sleep, scheduled = (changes[key] for key in ("shutdownRestart", "sleepMinutes", "scheduledRestart"))
    hour, minute = changes["restartHour"], changes["restartMinute"]
    has_time = hour is not None or minute is not None
    if ((shutdown is not None and type(shutdown) is not bool)
            or (sleep is not None and (type(sleep) is not int or sleep not in POWER_SLEEP_VALUES))
            or (scheduled is not None and type(scheduled) is not bool)
            or (has_time and (type(hour) is not int or not 0 <= hour <= 23 or type(minute) is not int or not 0 <= minute <= 59))
            or (shutdown is None and sleep is None and scheduled is None and not has_time)
            or (scheduled is True and not has_time)
            or (scheduled is False and has_time)):
        raise PollingError("Power settings are invalid or conflict")


def validate_mixed_answer_tasks(plan: dict[str, Any], tasks: list[str]) -> None:
    if (plan.get("managementRouting") != "per_device_answer" or not tasks
            or any(task not in ALL_ANSWER_TASKS for task in tasks)
            or len(set(tasks)) != len(tasks)
            or any(len(group.intersection(tasks)) > 1 for group in ANSWER_TASK_GROUPS)
            or plan.get("ntpChanges") is not None or plan.get("powerChanges") is not None):
        raise PollingError("Mixed routing is only for one Answer Mode target per contract")
    devices = plan.get("devices")
    selection = plan.get("selection") or {}
    if (not isinstance(devices, list) or not devices or not isinstance(selection, dict)
            or selection.get("mode") not in ("single_ip", "filters")
            or selection.get("mode") == "single_ip" and len(devices) != 1
            or plan.get("targetSource") not in ("sr", "device_list")
            or not re.fullmatch(r"[a-f0-9]{64}", str(plan.get("targetSourceSha256") or "").casefold())):
        raise PollingError("Mixed Answer Mode source is invalid")
    for device in devices:
        if not isinstance(device, dict):
            raise PollingError("Mixed Answer Mode target is invalid")
        families = [group for group in ANSWER_TASK_GROUPS
                    if resolve_management_action(device, min(group)).get("supported")]
        if len(families) != 1:
            raise PollingError("Mixed Answer Mode requires a known exact contract for every target")
        expected = [task for task in tasks if task in families[0]]
        if device.get("managementTasks") != expected:
            raise PollingError("Device Answer Mode binding differs from the selected contract")


def validate_te20_single_target_tasks(plan: dict[str, Any], requested_tasks: list[str]) -> None:
    polycom_changes = plan.get("polycomAnswerChanges")
    if POLYCOM_ANSWER_TASK in requested_tasks:
        if (not isinstance(polycom_changes, dict) or set(polycom_changes) != {"pointToPoint", "multipoint"}
                or any(value is not None and value not in ("automatic", "manual") for value in polycom_changes.values())
                or all(value is None for value in polycom_changes.values())):
            raise PollingError("Polycom Answer Mode targets are invalid")
    elif polycom_changes is not None:
        raise PollingError("Polycom Answer Mode targets require the exact action")
    if plan.get("schemaVersion") == 5:
        validate_mixed_answer_tasks(plan, requested_tasks)
        return
    answer_tasks = (TE20_ANSWER_TASKS | TE_FAMILY_ANSWER_TASKS | HUAWEI_310_ANSWER_TASKS | HUAWEI_300_ANSWER_TASKS | {POLYCOM_ANSWER_TASK}).intersection(requested_tasks)
    if answer_tasks:
        selection = plan.get("selection") or {}
        devices = plan.get("devices") or []
        digest = str(plan.get("targetSourceSha256") or "").casefold()
        mode = selection.get("mode") if isinstance(selection, dict) else None
        ips = [normalize_ipv4(device.get("ipNormalized") or device.get("ip")) if isinstance(device, dict) else None for device in devices] if isinstance(devices, list) else []
        if (len(answer_tasks) != 1 or len(requested_tasks) != 1 or plan.get("targetSource") not in ("sr","device_list")
                or not re.fullmatch(r"[0-9a-f]{64}", digest) or not isinstance(selection, dict)
                or mode not in {"single_ip", "filters"} or not isinstance(devices, list) or not devices
                or plan.get("ntpChanges") is not None or plan.get("powerChanges") is not None
                or (mode == "single_ip" and len(devices) != 1)
                or any(ip is None for ip in ips) or len(set(ips)) != len(ips)
                or any(not isinstance(device, dict) or not resolve_management_action(device, next(iter(answer_tasks))).get("supported") for device in devices)):
            raise PollingError("Answer Mode requires exact compatible devices from the current SR")
        return
    port = TE20_PORT_TASKS.intersection(requested_tasks)
    auto_update = TE20_AUTO_UPDATE_TASK in requested_tasks
    ssh = TE20_SSH_TASKS.intersection(requested_tasks)
    ntp = TE20_NTP_TASK in requested_tasks
    power = TE20_POWER_TASK in requested_tasks
    validate_ntp_changes(plan, requested_tasks)
    validate_power_changes(plan, requested_tasks)
    if not port and not auto_update and not ssh and not ntp and not power:
        return
    if (len(ssh) > 1 or ((auto_update or ssh or ntp or power) and len(requested_tasks) != 1)
            or len(TE20_HTTP_TASKS.intersection(port)) > 1
            or len(TE20_TELNET_TASKS.intersection(port)) > 1
            or (port and any(task not in TE20_PORT_TASKS for task in requested_tasks))):
        raise PollingError("TE20 management tasks conflict")
    source_digest = str(plan.get("targetSourceSha256") or "").casefold()
    selection = plan.get("selection") or {}
    devices = plan.get("devices") or []
    listed_single=plan.get("targetSource")=="device_list" and len(devices)==1
    if (plan.get("targetSource") not in ("sr","device_list")
            or len(source_digest) != 64 or any(character not in "0123456789abcdef" for character in source_digest)
            or not isinstance(selection, dict) or (selection.get("mode") != "single_ip" and not listed_single)
            or not isinstance(devices, list) or len(devices) != 1 or not isinstance(devices[0], dict)
            or any(not resolve_management_action(devices[0], task).get("supported") for task in requested_tasks)):
        raise PollingError("TE20 management action requires one exact SR target selected by IP")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def normalize_ipv4(value: Any) -> str | None:
    raw = str(value or "").strip()
    parts = raw.split(".")
    if len(parts) != 4 or any(not part.isdigit() or len(part) > 3 for part in parts):
        return None
    numbers = [int(part) for part in parts]
    if any(part < 0 or part > 255 for part in numbers):
        return None
    if numbers[0] == 0 or numbers[0] == 127 or numbers[0] >= 224 or all(part == 255 for part in numbers):
        return None
    try:
        return str(ipaddress.IPv4Address(".".join(str(part) for part in numbers)))
    except ipaddress.AddressValueError:
        return None


def ping_device(ip: Any, timeout_ms: Any = 3000) -> dict[str, Any]:
    normalized = normalize_ipv4(ip)
    if not normalized:
        return {"ok": False, "durationMs": None, "safeError": "invalid_or_forbidden_ip"}
    timeout = max(250, min(int(timeout_ms or 3000), 30_000))
    args = ["ping", "-n", "1", "-w", str(timeout), normalized] if sys.platform == "win32" else ["ping", "-c", "1", "-W", str(max(1, (timeout + 999) // 1000)), normalized]
    started = time.monotonic()
    creation_flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0
    try:
        completed = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=(timeout + 1000) / 1000, check=False, creationflags=creation_flags)
        duration = round((time.monotonic() - started) * 1000)
        return {"ok": completed.returncode == 0, "durationMs": duration, "safeError": None if completed.returncode == 0 else "no_ping_response"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "durationMs": round((time.monotonic() - started) * 1000), "safeError": "no_ping_response"}
    except OSError:
        return {"ok": False, "durationMs": round((time.monotonic() - started) * 1000), "safeError": "ping_process_failed"}


def validate_plan_actions(plan: dict[str,Any]) -> None:
    if not isinstance(plan,dict):raise PollingError("Polling plan is invalid")
    tasks=plan.get("managementTasks") or []
    if not isinstance(tasks,list) or any(not isinstance(item,str) for item in tasks):raise PollingError("Management task selection is invalid")
    reject_legacy_port_action(tasks)
    if (type(plan.get("collectJson",True)) is not bool or type(plan.get("collectLogs",False)) is not bool
            or plan.get("collectJson") is False and plan.get("collectLogs") is not True and not tasks):
        raise PollingError("Select at least one explicit action")
    strict=plan.get("schemaVersion") in (4,5)
    if plan.get("targetSource")=="device_list" and not strict:raise PollingError("Device lists require explicit plan v4/v5")
    if not strict:return
    if (type(plan.get("collectJson")) is not bool or type(plan.get("collectLogs")) is not bool
            or not isinstance(plan.get("managementTasks"),list) or len(set(tasks))!=len(tasks)
            or any(item not in {str(entry.get("id")) for entry in CATALOG.get("managementActions",[])} for item in tasks)):
        raise PollingError("Explicit action fields are required")
    expected=(["collect_json"] if plan["collectJson"] else [])+(["collect_logs"] if plan["collectLogs"] else [])+tasks
    if not expected or plan.get("selectedActions")!=expected:raise PollingError("Action selection differs from the approved plan")
    devices=plan.get("devices")
    source=plan.get("targetSource")
    ips=plan.get("sourceTargetIps")
    sheets=plan.get("targetSourceSheets")
    if (source not in ("sr","device_list") or not isinstance(devices,list) or not devices
            or not re.fullmatch(r"[a-f0-9]{64}",str(plan.get("targetSourceSha256") or "").casefold())
            or not isinstance(ips,list) or not ips or any(not isinstance(ip,str) or normalize_ipv4(ip)!=ip for ip in ips)
            or len(set(ips))!=len(ips) or not isinstance(sheets,list)
            or any(not isinstance(name,str) or not name or len(name)>128 or re.search(r"[\x00-\x1f]",name) for name in sheets)
            or len(set(sheets))!=len(sheets)
            or source=="device_list" and not sheets or source=="sr" and sheets):
        raise PollingError("Explicit target source is invalid")
    selected=[];source_ips=set(ips)
    for device in devices:
        if not isinstance(device,dict):raise PollingError("Explicit target is invalid")
        ip=normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
        if ip is None or ip not in source_ips:raise PollingError("Target is absent from the selected source")
        selected.append(ip)
        if (tasks or plan["collectLogs"]) and not plan_device_supported(device):raise PollingError("Selected operation requires a supported target")
        if plan.get("schemaVersion") != 5:
            if "managementTasks" in device:raise PollingError("Device bindings require plan v5")
            if any(not resolve_management_action(device,action).get("supported") for action in tasks):raise PollingError("Selected write is unsupported by a target")
        if plan["collectLogs"] and resolve_manifest(device).get("transport") not in LOG_TRANSPORTS:raise PollingError("Selected logs are unsupported by a target")
    if len(set(selected))!=len(selected):raise PollingError("Explicit targets contain duplicate IP")
    if "disable_insecure_management_services" in tasks and source!="device_list":raise PollingError("Bulk port changes require the uploaded source")
    validate_te20_single_target_tasks(plan,tasks)


Adapter = Callable[[dict[str, Any], Any, dict[str, Any]], dict[str, Any]]
ADAPTER_REGISTRY: dict[str, Adapter] = {}


def register_adapter(key: str, adapter: Adapter) -> None:
    normalized = str(key or "").strip()
    if not normalized or not callable(adapter):
        raise ValueError("adapter_invalid")
    ADAPTER_REGISTRY[normalized] = adapter


def _default_extron(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.extron import poll_extron_device

    return poll_extron_device(device, credential, options)


def _default_huawei_te(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.huawei_te40 import poll_huawei_te_device

    return poll_huawei_te_device(device, credential, options)


def _default_huawei_te20(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.huawei_te40 import poll_huawei_te20_device

    return poll_huawei_te20_device(device, credential, options)


def _default_huawei_310(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.huawei_bar310 import poll_huawei_310_device

    return poll_huawei_310_device(device, credential, options)


def _default_huawei_bar300(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.huawei_300 import poll_huawei_bar300_device

    return poll_huawei_bar300_device(device, credential, options)


def _default_huawei_box300(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.huawei_300 import poll_huawei_box300_device

    return poll_huawei_box300_device(device, credential, options)


def _default_huawei_box600(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.huawei_300 import poll_huawei_box600_device

    return poll_huawei_box600_device(device, credential, options)


def _default_polycom_group310(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.polycom_group import poll_polycom_group310_device

    return poll_polycom_group310_device(device, credential, options)


def _default_polycom_group300(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.polycom_group import poll_polycom_group300_device

    return poll_polycom_group300_device(device, credential, options)


def _default_polycom_group500(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.polycom_group import poll_polycom_group500_device

    return poll_polycom_group500_device(device, credential, options)


def _default_polycom_group700(device: dict[str, Any], credential: Any, options: dict[str, Any]) -> dict[str, Any]:
    from .adapters.polycom_group import poll_polycom_group700_device

    return poll_polycom_group700_device(device, credential, options)


register_adapter("extron_web_dynamic_resources_v1", _default_extron)
register_adapter("huawei_te_web_cgi_v1", _default_huawei_te)
register_adapter("huawei_te20_web_cgi_v1", _default_huawei_te20)
register_adapter("huawei_bar300_web_cgi_v1", _default_huawei_bar300)
register_adapter("huawei_box300_web_cgi_v1", _default_huawei_box300)
register_adapter("huawei_box600_web_cgi_v1", _default_huawei_box600)
register_adapter("huawei_310_rest_v1", _default_huawei_310)
register_adapter("polycom_group310_web_v1", _default_polycom_group310)
register_adapter("polycom_group300_web_v1", _default_polycom_group300)
register_adapter("polycom_group500_web_v1", _default_polycom_group500)
register_adapter("polycom_group700_web_v1", _default_polycom_group700)


def plan_device_supported(device: dict[str, Any]) -> bool:
    manifest = resolve_manifest(device)
    return (
        device.get("pollingSupported") is not False
        and normalize_ipv4(device.get("ipNormalized") or device.get("ip")) is not None
        and bool(manifest.get("transport"))
        and manifest.get("protocolStatus") == "supported"
    )


def _complete_management_actions(device: dict[str, Any], requested: list[str], result: dict[str, Any]) -> dict[str, Any]:
    if not requested:
        return result
    existing = {
        str(item.get("id")): item
        for item in result.get("managementActions", [])
        if isinstance(item, dict) and item.get("id")
    }
    completed = []
    for action_id in requested:
        if action_id in existing:
            completed.append(existing[action_id])
            continue
        capability = resolve_management_action(device, action_id)
        if not capability.get("supported"):
            completed.append({"id": action_id, "status": "skipped_unsupported", "changed": False, "safeError": "management_action_unsupported"})
        else:
            completed.append({"id": action_id, "status": "failed", "changed": False, "safeError": "polling_prerequisite_failed"})
    return {**result, "managementActions": completed}


def probe_device(device: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    settings = options or {}
    ip = normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
    allowed = settings.get("allowed_ips") or set()
    if not ip or ip not in allowed:
        raise PollingError("Polling target is invalid or absent from the explicit plan allowlist")
    captured_at = utc_now()
    manifest = resolve_manifest(device)
    requested_management_tasks = [str(item) for item in settings.get("management_tasks", [])]
    reject_legacy_port_action(requested_management_tasks)
    collect_json=settings.get("collect_json",True) is True
    collect_logs = settings.get("collect_logs") is True
    supported_management_tasks = [item for item in requested_management_tasks if resolve_management_action(device, item).get("supported")]
    transport = manifest.get("transport")
    if not collect_json and collect_logs and not requested_management_tasks and transport not in LOG_TRANSPORTS:
        return {"ip":ip,"capturedAt":captured_at,"adapterKey":manifest["key"],"ok":False,"networkAttempted":False,"safeError":"log_contract_required","logCollection":{"status":"protocol_required"}}
    if device.get("pollingSupported") is False or not transport or manifest.get("protocolStatus") != "supported":
        result = {"ip": ip, "capturedAt": captured_at, "adapterKey": manifest["key"], "ok": False, "failedStage": "adapter", "ping": {"ok": None, "durationMs": None}, "networkAttempted": False, "vendorPolling": {"status": manifest["protocolStatus"], "knownModel": manifest["knownModel"]}, "safeError": "verified_protocol_contract_required" if manifest["protocolStatus"] == "protocol_required" else "adapter_unsupported"}
        return _complete_management_actions(device, requested_management_tasks, result)
    ping = (settings.get("ping") or ping_device)(ip, settings.get("timeout_ms"))
    if not ping.get("ok"):
        result = {"ip": ip, "capturedAt": captured_at, "adapterKey": manifest["key"], "ok": False, "failedStage": "ping", "ping": {"ok": False, "durationMs": ping.get("durationMs")}, "vendorPolling": {"status": "not_started"}, "safeError": ping.get("safeError") or "no_ping_response"}
        return _complete_management_actions(device, requested_management_tasks, result)
    registry = settings["adapters"] if isinstance(settings.get("adapters"), dict) else ADAPTER_REGISTRY
    adapter = registry.get(str(transport))
    if not callable(adapter):
        result = {"ip": ip, "capturedAt": captured_at, "adapterKey": manifest["key"], "ok": False, "failedStage": "adapter", "ping": {"ok": True, "durationMs": ping.get("durationMs")}, "networkAttempted": False, "vendorPolling": {"status": "protocol_required", "knownModel": manifest["knownModel"]}, "safeError": "verified_protocol_contract_required"}
        return _complete_management_actions(device, requested_management_tasks, result)
    credential_provider = settings.get("get_credentials") or settings.get("get_credential") or (lambda *_args: None)
    credential = credential_provider(ip, {**device, "ipNormalized": ip})
    try:
        result = adapter(
            {**device, "ipNormalized": ip, "allowInsecureTls": device.get("allowInsecureTls") is True or settings.get("allow_insecure_tls") is True},
            credential,
            {"request": settings.get("request"), "timeout_ms": settings.get("timeout_ms"), "now": settings.get("now"), "allow_insecure_tls": settings.get("allow_insecure_tls") is True, "management_tasks": supported_management_tasks, "ntp_changes": settings.get("ntp_changes"), "power_changes": settings.get("power_changes"), "polycom_answer_changes": settings.get("polycom_answer_changes"), "collect_json":collect_json,"collect_logs": collect_logs and transport in LOG_TRANSPORTS, "on_log": settings.get("on_log") if collect_logs else None, "log_opener": settings.get("log_opener") if collect_logs else None},
        )
        merged = {**result, "ip": ip, "capturedAt": result.get("capturedAt") or captured_at, "adapterKey": manifest["key"], "networkAttempted": True, "ping": {"ok": True, "durationMs": ping.get("durationMs")}}
        if collect_logs and transport not in LOG_TRANSPORTS:
            merged["logCollection"] = {"status": "protocol_required"}
        merged=_complete_management_actions(device,requested_management_tasks,merged)
        if settings.get("strict_actions"):
            if collect_logs and (merged.get("logCollection") or {}).get("status")!="saved":merged.update(ok=False,failedStage="log_collection",safeError="selected_log_not_completed")
            if any(item.get("status") not in ("applied","already_compliant") for item in merged.get("managementActions",[])):merged.update(ok=False,failedStage="management_action",safeError="selected_management_not_completed")
        return merged
    except BaseException as error:
        if isinstance(error, (KeyboardInterrupt, SystemExit)):
            raise
        result = {"ip": ip, "capturedAt": captured_at, "adapterKey": manifest["key"], "ok": False, "failedStage": "adapter", "ping": {"ok": True, "durationMs": ping.get("durationMs")}, "networkAttempted": True, "vendorPolling": {"status": "supported", "knownModel": manifest["knownModel"]}, "safeError": "adapter_failed"}
        return _complete_management_actions(device, requested_management_tasks, result)


def abortable_wait(milliseconds: Any, cancel_event: threading.Event | None = None, wait: Callable[[float, threading.Event | None], Any] | None = None) -> None:
    duration = max(0.0, float(milliseconds or 0) / 1000)
    if duration == 0:
        return
    if cancel_event is not None and cancel_event.is_set():
        raise PollingCancelled("Polling cancelled")
    if wait is not None:
        wait(duration, cancel_event)
    elif cancel_event is not None:
        if cancel_event.wait(duration):
            raise PollingCancelled("Polling cancelled")
    else:
        time.sleep(duration)
    if cancel_event is not None and cancel_event.is_set():
        raise PollingCancelled("Polling cancelled")


def plan_interval_bounds(plan: dict[str, Any]) -> tuple[int, int]:
    """Return inclusive seconds bounds; accept older fixed-interval plans."""
    if "intervalMinSeconds" in plan or "intervalMaxSeconds" in plan:
        if "intervalMinSeconds" not in plan or "intervalMaxSeconds" not in plan:
            raise PollingError("Polling interval bounds must both be present")
        minimum, maximum = plan["intervalMinSeconds"], plan["intervalMaxSeconds"]
    else:
        minimum = maximum = plan.get("intervalSeconds", 0)
    if any(isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > 2**53 - 1 for value in (minimum, maximum)) or minimum > maximum:
        raise PollingError("Polling interval bounds must be ordered non-negative safe integers")
    return minimum, maximum


def validate_plan_interval(plan: dict[str, Any]) -> tuple[int, int]:
    minimum, maximum = plan_interval_bounds(plan)
    devices = plan.get("devices") or []
    if minimum == maximum and minimum != 0 and sum(plan_device_supported(device) and device_has_operations(plan,device) for device in devices if isinstance(device, dict)) > 2:
        raise PollingError("At least two interval values are required for three or more supported devices")
    return minimum, maximum


def device_has_operations(plan: dict[str, Any], device: dict[str, Any]) -> bool:
    return plan.get("schemaVersion") != 5 or plan.get("collectJson") is True or plan.get("collectLogs") is True or bool(device.get("managementTasks"))


def choose_interval_seconds(minimum: int, maximum: int, previous: int | None) -> int:
    choices = maximum - minimum + 1
    if previous is None:
        return minimum + secrets.randbelow(choices)
    if choices < 2:
        raise PollingError("Consecutive polling intervals cannot be equal")
    offset = secrets.randbelow(choices - 1)
    previous_offset = previous - minimum
    return minimum + offset + (offset >= previous_offset)


def run_plan(plan: dict[str, Any], options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if not isinstance(plan, dict) or not isinstance(plan.get("devices"), list):
        raise PollingError("Polling plan must contain devices[]")
    settings = options or {}
    validate_plan_actions(plan)
    requested_management_tasks = plan.get("managementTasks") or []
    known_management_tasks = {str(item.get("id")) for item in CATALOG.get("managementActions", [])}
    if (
        not isinstance(requested_management_tasks, list)
        or any(not isinstance(item, str) or item not in known_management_tasks for item in requested_management_tasks)
        or len(set(requested_management_tasks)) != len(requested_management_tasks)
    ):
        raise PollingError("Polling plan contains an unknown management task")
    if "disable_insecure_management_services" in requested_management_tasks:
        source_digest = str(plan.get("targetSourceSha256") or "").casefold()
        if plan.get("targetSource") not in ("port_closure_list","device_list") or len(source_digest) != 64 or any(character not in "0123456789abcdef" for character in source_digest):
            raise PollingError("Port-closure task requires a verified dedicated target list")
    validate_te20_single_target_tasks(plan, requested_management_tasks)
    devices = [dict(device) for device in plan["devices"]]
    ips = [normalize_ipv4(device.get("ipNormalized") or device.get("ip")) for device in devices]
    valid_ips = [ip for ip in ips if ip]
    if len(set(valid_ips)) != len(valid_ips):
        raise PollingError("Polling plan contains duplicate IP")
    interval_min, interval_max = validate_plan_interval(plan)
    cancel_event = settings.get("cancel_event")
    if settings.get("honor_schedule") and plan.get("scheduledAt"):
        scheduled = str(plan["scheduledAt"]).replace("Z", "+00:00")
        try:
            target = datetime.fromisoformat(scheduled).timestamp() * 1000
        except ValueError as error:
            raise PollingError("Polling schedule is invalid") from error
        delay = target - float((settings.get("now_ms") or (lambda: time.time() * 1000))())
        if delay > 0:
            abortable_wait(delay, cancel_event, settings.get("wait"))
    allowed_ips = set(valid_ips)
    results: list[dict[str, Any]] = []
    contacts = [plan_device_supported(device) and device_has_operations(plan,device) for device in devices]
    remaining_contacts = sum(contacts)
    previous_interval: int | None = None
    for index, device in enumerate(devices):
        if cancel_event is not None and cancel_event.is_set():
            break
        ip = ips[index]
        device_tasks = list(device["managementTasks"]) if plan.get("schemaVersion") == 5 else requested_management_tasks
        if contacts[index]: remaining_contacts -= 1
        if not device_has_operations(plan,device):
            result = {"ip":ip,"capturedAt":utc_now(),"adapterKey":resolve_manifest(device)["key"],"ok":True,
                      "notRequested":True,"networkAttempted":False,"managementActions":[],"readMode":"not_requested"}
        elif not ip or not plan_device_supported(device):
            manifest = resolve_manifest(device)
            result = {"ip": ip, "capturedAt": utc_now(), "adapterKey": manifest["key"], "ok": False, "failedStage": "adapter", "ping": {"ok": None, "durationMs": None}, "networkAttempted": False, "vendorPolling": {"status": manifest.get("protocolStatus") or "protocol_required", "knownModel": manifest["knownModel"]}, "safeError": "verified_protocol_contract_required" if ip else "invalid_or_missing_ip"}
            result = _complete_management_actions(device, device_tasks, result)
        else:
            progress = settings.get("on_progress")
            if progress:
                progress({"stage": "polling", "index": index, "total": len(devices), "device": {"ip": ip, "category": device.get("category"), "manufacturer": device.get("manufacturer"), "model": device.get("model")}})
            on_log = settings.get("on_log")
            log_callback = (lambda stream, metadata: on_log(stream, {**metadata, "index": index, "total": len(devices)})) if callable(on_log) else None
            result = probe_device(device, {**settings, "allowed_ips": allowed_ips, "management_tasks": device_tasks,
                "ntp_changes": plan.get("ntpChanges") if TE20_NTP_TASK in device_tasks else None,
                "power_changes": plan.get("powerChanges") if TE20_POWER_TASK in device_tasks else None,
                "polycom_answer_changes": plan.get("polycomAnswerChanges") if POLYCOM_ANSWER_TASK in device_tasks else None,
                "collect_json":plan.get("collectJson",True),"collect_logs": plan.get("collectLogs") is True,
                "strict_actions":plan.get("schemaVersion") in (4,5), "on_log": log_callback})
        if plan.get("collectLogs") is True and "logCollection" not in result:
            log_status = "not_started" if result.get("adapterKey") in LOG_ADAPTER_KEYS else "protocol_required"
            result = {**result, "logCollection": {"status": log_status}}
        results.append(result)
        if settings.get("on_result"):
            settings["on_result"](result, {"index": index, "total": len(devices), "device": device})
        if settings.get("on_progress"):
            settings["on_progress"]({"stage": "processed", "index": index + 1, "total": len(devices), "result": result})
        has_next_supported = remaining_contacts > 0
        if result.get("networkAttempted") is not False and has_next_supported and (interval_min != 0 or interval_max != 0):
            interval = choose_interval_seconds(interval_min, interval_max, previous_interval)
            previous_interval = interval
            if interval > 0:
                if settings.get("on_progress"):
                    settings["on_progress"]({"stage": "waiting", "index": index + 1, "total": len(devices), "waitSeconds": interval})
                abortable_wait(interval * 1000, cancel_event, settings.get("wait"))
    return results
