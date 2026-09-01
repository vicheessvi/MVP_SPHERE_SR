"""Thread-safe polling job with one-at-a-time browser save acknowledgement."""

from __future__ import annotations

import copy
import secrets
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable

from .polling import PollingCancelled, abortable_wait, run_plan
from .redaction import assert_no_plan_secrets, sanitize_result


TERMINAL_STATUSES = frozenset({"completed", "cancelled", "failed"})


class JobInputError(ValueError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class ResultSaveFailed(RuntimeError):
    code = "RESULT_SAVE_FAILED"


def _iso(value: datetime | None = None) -> str:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def safe_device(device: dict[str, Any] | None) -> dict[str, Any] | None:
    if not device:
        return None
    return {"ip": device.get("ipNormalized") or device.get("ip"), "category": device.get("category"), "manufacturer": device.get("manufacturer"), "model": device.get("model")}


def safe_job_error(error: BaseException) -> str:
    code = getattr(error, "code", "")
    if code == "POLLING_CANCELLED":
        return "polling_cancelled"
    if code == "RESULT_SAVE_FAILED":
        return "result_save_failed"
    if code == "CREDENTIAL_SHA_MISMATCH":
        return "credential_sha_mismatch"
    return "local_runtime_error"


def result_filename(result: dict[str, Any] | None, index: int) -> str:
    fallback = f"unsupported-{index + 1:04d}"
    return f"{(result or {}).get('ip') or fallback}.json"


class PollingJob:
    def __init__(self, settings: dict[str, Any]):
        try:
            plan = copy.deepcopy(settings.get("plan"))
            assert_no_plan_secrets(plan)
        except Exception as error:
            if isinstance(error, JobInputError):
                raise
            raise JobInputError("PLAN_INVALID") from error
        if not isinstance(plan, dict) or not isinstance(plan.get("devices"), list) or not plan["devices"]:
            raise JobInputError("PLAN_INVALID")
        source_credentials = settings.get("credentials")
        if not isinstance(source_credentials, list) or not source_credentials:
            raise JobInputError("CREDENTIALS_REQUIRED")
        self._plan = plan
        self._credentials = [dict(item) for item in source_credentials if isinstance(item, dict)]
        if not self._credentials:
            raise JobInputError("CREDENTIALS_REQUIRED")
        self._settings = settings
        self._condition = threading.Condition(threading.RLock())
        self._cancel_event = threading.Event()
        self._pending: dict[str, Any] | None = None
        self._ack_decision: bool | None = None
        self.id = str(settings.get("id") or secrets.token_urlsafe(18))
        clock: Callable[[], datetime] = settings.get("clock") or (lambda: datetime.now(timezone.utc))
        self._clock = clock
        self._state: dict[str, Any] = {
            "id": self.id,
            "planId": settings.get("plan_id"),
            "createdAt": _iso(clock()),
            "scheduledAt": plan.get("scheduledAt"),
            "startedAt": None,
            "finishedAt": None,
            "allowInsecureTls": settings.get("allow_insecure_tls") is True,
            "status": "scheduled",
            "total": len(plan["devices"]),
            "processed": 0,
            "successful": 0,
            "failed": 0,
            "unsupported": 0,
            "currentDevice": None,
            "safeError": None,
        }
        self._thread = threading.Thread(target=self._execute, name=f"mvp-poll-{self.id[:8]}", daemon=True)
        if settings.get("autostart") is not False:
            self._thread.start()

    def start(self) -> None:
        if self._thread.ident is not None or self._thread.is_alive():
            raise RuntimeError("job_already_started")
        self._thread.start()

    def status(self) -> dict[str, Any]:
        with self._condition:
            return {**self._state, "currentDevice": copy.deepcopy(self._state["currentDevice"]), "pendingResult": self._pending is not None}

    def result(self) -> dict[str, Any] | None:
        with self._condition:
            return copy.deepcopy(self._pending)

    def acknowledge(self, result_id: str, saved: bool) -> bool:
        if not isinstance(saved, bool):
            return False
        with self._condition:
            if self._pending is None or self._pending.get("resultId") != result_id or self._ack_decision is not None:
                return False
            self._ack_decision = saved
            self._condition.notify_all()
            return True

    def cancel(self) -> dict[str, Any]:
        with self._condition:
            if self._state["status"] not in TERMINAL_STATUSES:
                self._cancel_event.set()
                self._condition.notify_all()
            return self.status()

    def join(self, timeout: float | None = None) -> dict[str, Any]:
        self._thread.join(timeout)
        return self.status()

    @property
    def alive(self) -> bool:
        return self._thread.is_alive()

    def discard(self) -> None:
        """Clear an unstarted job if the server cannot register/start its thread."""
        with self._condition:
            if self._thread.ident is not None or self._thread.is_alive():
                raise RuntimeError("job_already_started")
            self._cancel_event.set()
            self._pending = None
            self._ack_decision = None
            for item in self._credentials:
                item.clear()
            self._credentials.clear()

    def _wait_for_save(self, raw_result: dict[str, Any], context: dict[str, Any]) -> None:
        filename = result_filename(raw_result, int(context["index"]))
        pending = {
            "resultId": secrets.token_urlsafe(18),
            "filename": filename,
            "payload": sanitize_result({**raw_result, "outputFile": f".\\{filename}"}),
            "index": context["index"],
            "total": context["total"],
        }
        with self._condition:
            self._pending = pending
            self._ack_decision = None
            self._state["status"] = "waiting_for_save"
            self._condition.notify_all()
            while self._ack_decision is None and not self._cancel_event.is_set():
                self._condition.wait()
            decision = self._ack_decision
            self._pending = None
            self._ack_decision = None
            if self._cancel_event.is_set():
                raise PollingCancelled("Polling cancelled")
            if decision is not True:
                raise ResultSaveFailed("result_save_failed")

    def _on_progress(self, progress: dict[str, Any]) -> None:
        with self._condition:
            self._state["currentDevice"] = safe_device(progress.get("device"))
            stage = progress.get("stage")
            if stage == "waiting":
                self._state["status"] = "waiting_interval"
            elif stage == "polling":
                self._state["status"] = "running"
            elif stage == "processed" and isinstance(progress.get("result"), dict):
                result = progress["result"]
                self._state["processed"] += 1
                if result.get("ok"):
                    self._state["successful"] += 1
                elif result.get("networkAttempted") is False:
                    self._state["unsupported"] += 1
                else:
                    self._state["failed"] += 1
            callback = self._settings.get("on_progress")
            status = self.status()
        if callback:
            callback(status)

    def _execute(self) -> None:
        try:
            if self._plan.get("scheduledAt"):
                try:
                    target = datetime.fromisoformat(str(self._plan["scheduledAt"]).replace("Z", "+00:00")).timestamp() * 1000
                except ValueError as error:
                    raise JobInputError("PLAN_INVALID") from error
                now_ms = self._settings.get("now_ms") or (lambda: time.time() * 1000)
                delay = target - float(now_ms())
                if delay > 0:
                    abortable_wait(delay, self._cancel_event, self._settings.get("wait"))
            with self._condition:
                self._state["startedAt"] = _iso(self._clock())
                self._state["status"] = "running"
            runner = self._settings.get("run_plan") or run_plan
            runner(self._plan, {
                "timeout_ms": self._settings.get("timeout_ms") or 7000,
                "get_credentials": lambda *_args: self._credentials,
                "allow_insecure_tls": self._state["allowInsecureTls"],
                "ping": self._settings.get("ping"),
                "request": self._settings.get("request"),
                "adapters": self._settings.get("adapters"),
                "cancel_event": self._cancel_event,
                "honor_schedule": False,
                "wait": self._settings.get("wait"),
                "now": self._settings.get("adapter_now"),
                "now_ms": self._settings.get("now_ms"),
                "on_result": self._wait_for_save,
                "on_progress": self._on_progress,
            })
            with self._condition:
                self._state["status"] = "cancelled" if self._cancel_event.is_set() else "completed"
                if self._state["status"] == "cancelled":
                    self._state["safeError"] = "polling_cancelled"
        except BaseException as error:
            if isinstance(error, (KeyboardInterrupt, SystemExit)):
                raise
            with self._condition:
                self._state["safeError"] = safe_job_error(error)
                self._state["status"] = "cancelled" if self._state["safeError"] == "polling_cancelled" else "failed"
        finally:
            with self._condition:
                self._state["finishedAt"] = _iso(self._clock())
                self._state["currentDevice"] = None
                self._pending = None
                self._ack_decision = None
                for item in self._credentials:
                    item.clear()
                self._credentials.clear()
                status = self.status()
                self._condition.notify_all()
            callback = self._settings.get("on_terminal")
            if callback:
                callback(status)


def create_polling_job(settings: dict[str, Any]) -> PollingJob:
    return PollingJob(settings)
