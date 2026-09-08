"""Exact-allowlist sequential polling and additive adapter registry."""

from __future__ import annotations

import ipaddress
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable

from .catalog import CATALOG, resolve_management_action, resolve_manifest


class PollingError(RuntimeError):
    pass


class PollingCancelled(PollingError):
    code = "POLLING_CANCELLED"


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


register_adapter("extron_web_dynamic_resources_v1", _default_extron)
register_adapter("huawei_te_web_cgi_v1", _default_huawei_te)
register_adapter("huawei_te20_web_cgi_v1", _default_huawei_te20)


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
    supported_management_tasks = [item for item in requested_management_tasks if resolve_management_action(device, item).get("supported")]
    transport = manifest.get("transport")
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
            {"request": settings.get("request"), "timeout_ms": settings.get("timeout_ms"), "now": settings.get("now"), "allow_insecure_tls": settings.get("allow_insecure_tls") is True, "management_tasks": supported_management_tasks},
        )
        merged = {**result, "ip": ip, "capturedAt": result.get("capturedAt") or captured_at, "adapterKey": manifest["key"], "networkAttempted": True, "ping": {"ok": True, "durationMs": ping.get("durationMs")}}
        return _complete_management_actions(device, requested_management_tasks, merged)
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


def run_plan(plan: dict[str, Any], options: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    if not isinstance(plan, dict) or not isinstance(plan.get("devices"), list):
        raise PollingError("Polling plan must contain devices[]")
    settings = options or {}
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
        if plan.get("targetSource") != "port_closure_list" or len(source_digest) != 64 or any(character not in "0123456789abcdef" for character in source_digest):
            raise PollingError("Port-closure task requires a verified dedicated target list")
    devices = [dict(device) for device in plan["devices"]]
    ips = [normalize_ipv4(device.get("ipNormalized") or device.get("ip")) for device in devices]
    valid_ips = [ip for ip in ips if ip]
    if len(set(valid_ips)) != len(valid_ips):
        raise PollingError("Polling plan contains duplicate IP")
    interval = plan.get("intervalSeconds") or 0
    if isinstance(interval, bool) or not isinstance(interval, int) or interval < 0:
        raise PollingError("Polling interval must be a non-negative integer")
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
    for index, device in enumerate(devices):
        if cancel_event is not None and cancel_event.is_set():
            break
        ip = ips[index]
        if not ip or not plan_device_supported(device):
            manifest = resolve_manifest(device)
            result = {"ip": ip, "capturedAt": utc_now(), "adapterKey": manifest["key"], "ok": False, "failedStage": "adapter", "ping": {"ok": None, "durationMs": None}, "networkAttempted": False, "vendorPolling": {"status": manifest.get("protocolStatus") or "protocol_required", "knownModel": manifest["knownModel"]}, "safeError": "verified_protocol_contract_required" if ip else "invalid_or_missing_ip"}
            result = _complete_management_actions(device, requested_management_tasks, result)
        else:
            progress = settings.get("on_progress")
            if progress:
                progress({"stage": "polling", "index": index, "total": len(devices), "device": {"ip": ip, "category": device.get("category"), "manufacturer": device.get("manufacturer"), "model": device.get("model")}})
            result = probe_device(device, {**settings, "allowed_ips": allowed_ips, "management_tasks": requested_management_tasks})
        results.append(result)
        if settings.get("on_result"):
            settings["on_result"](result, {"index": index, "total": len(devices), "device": device})
        if settings.get("on_progress"):
            settings["on_progress"]({"stage": "processed", "index": index + 1, "total": len(devices), "result": result})
        has_next_supported = any(plan_device_supported(candidate) for candidate in devices[index + 1 :])
        if result.get("networkAttempted") is not False and has_next_supported and interval > 0:
            if settings.get("on_progress"):
                settings["on_progress"]({"stage": "waiting", "index": index + 1, "total": len(devices), "waitSeconds": interval})
            abortable_wait(interval * 1000, cancel_event, settings.get("wait"))
    return results
