"""Authenticated loopback-only HTTP boundary for the browser application."""

from __future__ import annotations

import json
import hashlib
import re
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from .catalog import CATALOG
from .admin_access import configured, create_verifier, default_verifier_path, verify
from .credentials import CredentialFileError, MAX_XLSX_BYTES, parse_credential_pairs, parse_credential_workbook
from .polling import PollingError, normalize_ipv4, validate_plan_interval, validate_te20_single_target_tasks
from .polling_job import JobInputError, PollingJob, TERMINAL_STATUSES, create_polling_job
from .redaction import PlanSecretError, assert_no_plan_secrets
from .workspace import LEGACY_PAYLOAD_BYTES, MAX_PART_BYTES, WorkspaceError, WorkspaceStore, choose_workspace_directory, default_workspace_locator_path
from .read_model import ReadModel


HOST = "127.0.0.1"
COOKIE_NAME = "mvp_sphere_session"
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self'; img-src 'self' data:; "
    "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)
PUBLIC_FILES = {
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/product-catalog.js": ("product-catalog.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/vendor/xlsx.full.min.js": ("vendor/xlsx.full.min.js", "text/javascript; charset=utf-8"),
    "/runtime/credential-pool.js": ("runtime/credential-pool.js", "text/javascript; charset=utf-8"),
    "/runtime/polling-recovery.js": ("runtime/polling-recovery.js", "text/javascript; charset=utf-8"),
    "/runtime/vcs-shutdown.js": ("runtime/vcs-shutdown.js", "text/javascript; charset=utf-8"),
    "/runtime/huawei-te-log-events.js": ("runtime/huawei-te-log-events.js", "text/javascript; charset=utf-8"),
    "/runtime/huawei-310-log-events.js": ("runtime/huawei-310-log-events.js", "text/javascript; charset=utf-8"),
    "/runtime/huawei-300-log-events.js": ("runtime/huawei-300-log-events.js", "text/javascript; charset=utf-8"),
    "/runtime/log-scan-worker.js": ("runtime/log-scan-worker.js", "text/javascript; charset=utf-8"),
    "/runtime/log-scan-client.js": ("runtime/log-scan-client.js", "text/javascript; charset=utf-8"),
    "/runtime/db-views.js": ("runtime/db-views.js", "text/javascript; charset=utf-8"),
    "/runtime/sphere.js": ("runtime/sphere.js", "text/javascript; charset=utf-8"),
}
JOB_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)$")
CANCEL_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)/cancel$")
RESULT_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)/result$")
ACK_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)/result/([A-Za-z0-9_-]+)/ack$")
LOG_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)/log/([A-Za-z0-9_-]+)$")
LOG_ACK_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)/log/([A-Za-z0-9_-]+)/ack$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class RuntimeSession:
    csrf_token: str
    admin_unlocked: bool = False
    failed_admin_attempts: int = 0
    admin_retry_after: float = 0.0
    created_at: str = field(default_factory=utc_now)
    credential_pool: list[dict[str, str]] | None = None
    credential_sha256: str | None = None
    credential_summary: dict[str, Any] | None = None
    active_job_id: str | None = None
    last_job_id: str | None = None
    workspace_progress: dict[str, dict[str, Any]] = field(default_factory=dict)

    def clear_credentials(self) -> None:
        if self.credential_pool is not None:
            for item in self.credential_pool:
                item.clear()
            self.credential_pool.clear()
        self.credential_pool = None
        self.credential_sha256 = None
        self.credential_summary = None


@dataclass
class RuntimeState:
    project_root: Path
    admin_verifier_path: Path
    workspace_store: WorkspaceStore | None = None
    launch_token: str = field(default_factory=lambda: secrets.token_urlsafe(32))
    launch_used: bool = False
    sessions: dict[str, RuntimeSession] = field(default_factory=dict)
    jobs: dict[str, Any] = field(default_factory=dict)
    lock: threading.RLock = field(default_factory=threading.RLock)


class LocalRuntimeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, address: tuple[str, int], state: RuntimeState):
        self.state = state
        super().__init__(address, LocalRuntimeHandler)

    @property
    def launch_url(self) -> str:
        return f"http://{HOST}:{self.server_port}/launch?token={self.state.launch_token}"


class RequestError(Exception):
    def __init__(self, code: str, status: int):
        super().__init__(code)
        self.code = code
        self.status = status


class LocalRuntimeHandler(BaseHTTPRequestHandler):
    server: LocalRuntimeServer
    protocol_version = "HTTP/1.1"
    server_version = "MVP_SPHERE_SR"
    sys_version = ""

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _stream_log(self, job: Any, log_id: str, stream: Any) -> None:
        pending = job.status().get("pendingLog") or {}
        content_type = "application/gzip" if pending.get("logId") == log_id and pending.get("format") == "polycom_syslog_tgz_v1" else "application/xml"
        self.send_response(HTTPStatus.OK)
        self._security_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        try:
            while True:
                chunk = stream.read(64 * 1024)
                if not chunk:
                    break
                if not isinstance(chunk, bytes):
                    raise ValueError("invalid_log_chunk")
                self.wfile.write(f"{len(chunk):X}\r\n".encode("ascii"))
                self.wfile.write(chunk)
                self.wfile.write(b"\r\n")
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (OSError, ValueError):
            self.close_connection = True
            job.acknowledge_log(log_id, False)

    def version_string(self) -> str:
        return self.server_version

    def _security_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Content-Security-Policy", CONTENT_SECURITY_POLICY)

    def _send(self, status: int, body: bytes | str = b"", content_type: str = "application/json; charset=utf-8", extra_headers: dict[str, str] | None = None) -> None:
        payload = body.encode("utf-8") if isinstance(body, str) else body
        try:
            self.send_response(status)
            self._security_headers()
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(payload)))
            for key, value in (extra_headers or {}).items():
                self.send_header(key, value)
            self.end_headers()
            if self.command != "HEAD" and payload:
                self.wfile.write(payload)
        except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):
            # A cancelled browser read is not a failed DB operation; do not send a second 500.
            self.close_connection=True

    def _json(self, status: int, value: dict[str, Any]) -> None:
        self._send(status, json.dumps(value, ensure_ascii=False, separators=(",", ":")))

    def _expected_hosts(self) -> set[str]:
        port = self.server.server_port
        return {f"127.0.0.1:{port}", f"localhost:{port}"}

    def _valid_host(self) -> bool:
        return str(self.headers.get("Host") or "").strip().casefold() in self._expected_hosts()

    def _cookies(self) -> SimpleCookie[str]:
        cookie: SimpleCookie[str] = SimpleCookie()
        try:
            cookie.load(str(self.headers.get("Cookie") or ""))
        except Exception:
            return SimpleCookie()
        return cookie

    def _session(self, mutation: bool) -> tuple[str, RuntimeSession] | None:
        if not self._valid_host():
            self._json(HTTPStatus.FORBIDDEN, {"error": "invalid_host"})
            return None
        morsel = self._cookies().get(COOKIE_NAME)
        session_id = morsel.value if morsel else ""
        with self.server.state.lock:
            session = self.server.state.sessions.get(session_id)
        if session is None:
            self._json(HTTPStatus.UNAUTHORIZED, {"error": "local_session_required"})
            return None
        if mutation:
            expected_origin = f"http://{str(self.headers.get('Host') or '')}"
            if self.headers.get("Origin") != expected_origin or self.headers.get("X-MVP-CSRF") != session.csrf_token:
                self._json(HTTPStatus.FORBIDDEN, {"error": "csrf_or_origin_rejected"})
                return None
        return session_id, session

    def _read_body(self, maximum: int) -> bytes:
        if self.headers.get("Transfer-Encoding"):
            raise RequestError("request_framing_rejected", HTTPStatus.BAD_REQUEST)
        raw_length = self.headers.get("Content-Length")
        try:
            length = int(raw_length or "0")
        except ValueError as error:
            raise RequestError("invalid_content_length", HTTPStatus.BAD_REQUEST) from error
        if length < 0 or length > maximum:
            raise RequestError("request_too_large", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
        data = self.rfile.read(length)
        if len(data) != length:
            raise RequestError("invalid_request_body", HTTPStatus.BAD_REQUEST)
        return data

    def _read_json(self, maximum: int) -> dict[str, Any]:
        try:
            value = json.loads(self._read_body(maximum).decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError) as error:
            raise RequestError("invalid_json", HTTPStatus.BAD_REQUEST) from error
        if not isinstance(value, dict):
            raise RequestError("invalid_json", HTTPStatus.BAD_REQUEST)
        return value

    def _launch(self, query: str) -> None:
        if not self._valid_host():
            self._json(HTTPStatus.FORBIDDEN, {"error": "invalid_or_used_launch_token"})
            return
        token = parse_qs(query, keep_blank_values=True).get("token", [""])[0]
        with self.server.state.lock:
            if self.server.state.launch_used or not secrets.compare_digest(token, self.server.state.launch_token):
                allowed = False
            else:
                allowed = True
                self.server.state.launch_used = True
                session_id = secrets.token_urlsafe(32)
                self.server.state.sessions[session_id] = RuntimeSession(csrf_token=secrets.token_urlsafe(32))
        if not allowed:
            self._json(HTTPStatus.FORBIDDEN, {"error": "invalid_or_used_launch_token"})
            return
        self._send(
            HTTPStatus.SEE_OTHER,
            b"",
            extra_headers={"Set-Cookie": f"{COOKIE_NAME}={session_id}; Path=/; HttpOnly; SameSite=Strict", "Location": "/"},
        )

    def _serve_static(self, path: str) -> bool:
        if path == "/":
            relative, content_type = "index.html", "text/html; charset=utf-8"
        elif path in PUBLIC_FILES:
            relative, content_type = PUBLIC_FILES[path]
        else:
            return False
        target = (self.server.state.project_root / relative).resolve()
        try:
            target.relative_to(self.server.state.project_root.resolve())
            data = target.read_bytes()
        except (OSError, ValueError):
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "local_runtime_error", "safeMessage": "Локальная операция не выполнена"})
            return True
        self._send(HTTPStatus.OK, data, content_type)
        return True

    def _job_for_session(self, session: RuntimeSession, job_id: str) -> PollingJob | None:
        with self.server.state.lock:
            if not job_id or job_id not in {session.active_job_id, session.last_job_id}:
                return None
            job = self.server.state.jobs.get(job_id)
        return job if isinstance(job, PollingJob) else None

    def _credentials_route(self, session: RuntimeSession) -> bool:
        if self.path.split("?", 1)[0] != "/api/polling/credentials":
            return False
        if self.command == "POST":
            with self.server.state.lock:
                if session.active_job_id:
                    self._json(HTTPStatus.CONFLICT, {"ok": False, "error": "job_already_active"})
                    return True
            manual = str(self.headers.get("Content-Type") or "").split(";", 1)[0].strip().casefold() == "application/json"
            filename = str(self.headers.get("X-File-Name") or "")
            if not manual and not filename.casefold().endswith(".xlsx"):
                with self.server.state.lock:
                    session.clear_credentials()
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "credential_file_invalid"})
                return True
            try:
                body = self._read_body(MAX_XLSX_BYTES)
            except RequestError:
                with self.server.state.lock:
                    session.clear_credentials()
                raise
            try:
                if manual:
                    payload = json.loads(body)
                    if not isinstance(payload, dict) or set(payload) != {"pairs"}:
                        raise CredentialFileError("credential_pairs_invalid")
                    parsed = parse_credential_pairs(payload["pairs"])
                else:
                    parsed = parse_credential_workbook(body)
            except (CredentialFileError, ValueError, UnicodeDecodeError):
                with self.server.state.lock:
                    session.clear_credentials()
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "credential_file_invalid"})
                return True
            digest = hashlib.sha256(body).hexdigest()
            with self.server.state.lock:
                session.clear_credentials()
                session.credential_pool = [dict(item) for item in parsed.credentials]
                session.credential_sha256 = digest
                session.credential_summary = dict(parsed.summary)
                summary = dict(session.credential_summary)
            self._json(HTTPStatus.OK, {"ok": True, "summary": summary, "sourceSha256": digest})
            return True
        if self.command == "DELETE":
            with self.server.state.lock:
                if session.active_job_id:
                    self._json(HTTPStatus.CONFLICT, {"ok": False, "error": "job_already_active"})
                    return True
                session.clear_credentials()
            self._json(HTTPStatus.OK, {"ok": True})
            return True
        return False

    def _create_job(self, session: RuntimeSession) -> None:
        with self.server.state.lock:
            if session.active_job_id:
                self._json(HTTPStatus.CONFLICT, {"ok": False, "error": "job_already_active"})
                return
            if not session.credential_pool:
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "credentials_required"})
                return
        try:
            value = self._read_json(5 * 1024 * 1024)
        except RequestError:
            with self.server.state.lock:
                session.clear_credentials()
            raise
        plan = value.get("plan")
        try:
            assert_no_plan_secrets(plan)
            if not isinstance(plan, dict) or plan.get("schemaVersion") != 3 or not isinstance(plan.get("devices"), list) or not plan["devices"]:
                raise ValueError("plan_invalid")
            if type(plan.get("collectLogs", False)) is not bool or type(plan.get("collectJson", True)) is not bool or (plan.get("collectLogs") is not True and plan.get("collectJson") is False):
                raise ValueError("plan_invalid")
            management_tasks = plan.get("managementTasks") or []
            known_management_tasks = {str(item.get("id")) for item in CATALOG.get("managementActions", [])}
            if (
                not isinstance(management_tasks, list)
                or any(not isinstance(item, str) or item not in known_management_tasks for item in management_tasks)
                or len(set(management_tasks)) != len(management_tasks)
            ):
                raise ValueError("plan_invalid")
            if "disable_insecure_management_services" in management_tasks:
                target_source_digest = str(plan.get("targetSourceSha256") or "").casefold()
                if plan.get("targetSource") != "port_closure_list" or not re.fullmatch(r"[0-9a-f]{64}", target_source_digest):
                    raise ValueError("plan_invalid")
            validate_te20_single_target_tasks(plan, management_tasks)
            valid_ips = []
            for device in plan["devices"]:
                if not isinstance(device, dict):
                    raise ValueError("plan_invalid")
                ip = normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
                if ip:
                    valid_ips.append(ip)
            if len(set(valid_ips)) != len(valid_ips):
                raise ValueError("plan_invalid")
            validate_plan_interval(plan)
        except (PlanSecretError, PollingError, ValueError, TypeError):
            with self.server.state.lock:
                session.clear_credentials()
            self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "plan_invalid"})
            return
        digest = str(plan.get("authenticationInputSha256") or "").casefold()
        state = self.server.state

        def on_terminal(status: dict[str, Any]) -> None:
            with state.lock:
                session.clear_credentials()
                if session.active_job_id == status["id"]:
                    session.active_job_id = None
                session.last_job_id = status["id"]

        with state.lock:
            if session.active_job_id:
                self._json(HTTPStatus.CONFLICT, {"ok": False, "error": "job_already_active"})
                return
            if not session.credential_pool:
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "credentials_required"})
                return
            if not re.fullmatch(r"[0-9a-f]{64}", digest) or digest != session.credential_sha256:
                session.clear_credentials()
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "credential_sha_mismatch"})
                return
            credentials = [dict(item) for item in session.credential_pool]
            try:
                job = create_polling_job({"plan": plan, "plan_id": str(value.get("planId") or "") or None, "credentials": credentials, "allow_insecure_tls": value.get("allowInsecureTls") is True, "on_terminal": on_terminal, "autostart": False})
            except (JobInputError, ValueError):
                for item in credentials:
                    item.clear()
                session.clear_credentials()
                self._json(HTTPStatus.BAD_REQUEST, {"ok": False, "error": "plan_invalid"})
                return
            if session.last_job_id:
                state.jobs.pop(session.last_job_id, None)
            state.jobs[job.id] = job
            session.active_job_id = job.id
            session.last_job_id = job.id
        try:
            job.start()
        except Exception:
            with state.lock:
                job.discard()
                state.jobs.pop(job.id, None)
                if session.active_job_id == job.id:
                    session.active_job_id = None
                if session.last_job_id == job.id:
                    session.last_job_id = None
                session.clear_credentials()
            raise
        self._json(HTTPStatus.ACCEPTED, {"ok": True, "jobId": job.id, "status": job.status()["status"]})

    def _polling_job_routes(self, path: str, session: RuntimeSession) -> bool:
        if path == "/api/polling/jobs/active" and self.command == "GET":
            with self.server.state.lock:
                job_id = session.active_job_id
                job = self.server.state.jobs.get(job_id) if job_id else None
            self._json(HTTPStatus.OK, {"ok": True, "activeJobId": job.id if job else None})
            return True
        if path == "/api/polling/jobs" and self.command == "POST":
            self._create_job(session)
            return True
        match = JOB_ROUTE.fullmatch(path)
        if match and self.command == "GET":
            job = self._job_for_session(session, match.group(1))
            if not job:
                self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "job_not_found"})
            else:
                self._json(HTTPStatus.OK, {"ok": True, **job.status()})
            return True
        match = CANCEL_ROUTE.fullmatch(path)
        if match and self.command == "POST":
            job = self._job_for_session(session, match.group(1))
            if not job:
                self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "job_not_found"})
            else:
                self._json(HTTPStatus.OK, {"ok": True, **job.cancel()})
            return True
        match = RESULT_ROUTE.fullmatch(path)
        if match and self.command == "GET":
            job = self._job_for_session(session, match.group(1))
            if not job:
                self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "job_not_found"})
            else:
                pending = job.result()
                if pending is None:
                    self._send(HTTPStatus.NO_CONTENT, b"")
                else:
                    self._json(HTTPStatus.OK, {"ok": True, **pending})
            return True
        match = LOG_ROUTE.fullmatch(path)
        if match and self.command == "GET":
            if self.headers.get("X-MVP-CSRF") != session.csrf_token:
                self._json(HTTPStatus.FORBIDDEN, {"ok": False, "error": "csrf_or_origin_rejected"})
                return True
            job = self._job_for_session(session, match.group(1))
            stream = job.log_stream(match.group(2)) if job else None
            if stream is None:
                self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "log_not_found"})
            else:
                self._stream_log(job, match.group(2), stream)
            return True
        match = LOG_ACK_ROUTE.fullmatch(path)
        if match and self.command == "POST":
            job = self._job_for_session(session, match.group(1))
            if not job:
                self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "job_not_found"})
                return True
            value = self._read_json(1024)
            saved = value.get("saved")
            if not isinstance(saved, bool) or not job.acknowledge_log(match.group(2), saved):
                self._json(HTTPStatus.CONFLICT, {"ok": False, "error": "log_ack_rejected"})
            else:
                self._json(HTTPStatus.OK, {"ok": True, "status": job.status()["status"]})
            return True
        match = ACK_ROUTE.fullmatch(path)
        if match and self.command == "POST":
            job = self._job_for_session(session, match.group(1))
            if not job:
                self._json(HTTPStatus.NOT_FOUND, {"ok": False, "error": "job_not_found"})
                return True
            value = self._read_json(1024)
            saved = value.get("saved")
            if not isinstance(saved, bool) or not job.acknowledge(match.group(2), saved):
                self._json(HTTPStatus.CONFLICT, {"ok": False, "error": "result_ack_rejected"})
            else:
                self._json(HTTPStatus.OK, {"ok": True, "status": job.status()["status"]})
            return True
        return False

    def _admin_route(self, path: str, session: RuntimeSession) -> bool:
        if path not in {"/api/admin/setup", "/api/admin/login", "/api/admin/logout"}:
            return False
        if self.command != "POST":
            self._json(HTTPStatus.METHOD_NOT_ALLOWED, {"error": "method_not_allowed"})
            return True
        verifier_path = self.server.state.admin_verifier_path
        if path == "/api/admin/logout":
            with self.server.state.lock:
                if session.active_job_id:
                    self._json(HTTPStatus.CONFLICT, {"error": "job_already_active"})
                    return True
                session.admin_unlocked = False
                session.clear_credentials()
            self._json(HTTPStatus.OK, {"ok": True, "adminUnlocked": False})
            return True
        value = self._read_json(8192)
        username = value.get("username")
        password = value.get("password")
        if path == "/api/admin/setup":
            if configured(verifier_path):
                self._json(HTTPStatus.CONFLICT, {"error": "admin_already_configured"})
                return True
            try:
                created = create_verifier(verifier_path, username, password)
            except ValueError:
                self._json(HTTPStatus.BAD_REQUEST, {"error": "admin_credentials_invalid"})
                return True
            if not created:
                self._json(HTTPStatus.CONFLICT, {"error": "admin_already_configured"})
                return True
            with self.server.state.lock:
                session.admin_unlocked = True
            self._json(HTTPStatus.OK, {"ok": True, "adminConfigured": True, "adminUnlocked": True})
            return True
        if not configured(verifier_path):
            self._json(HTTPStatus.CONFLICT, {"error": "admin_setup_required"})
            return True
        with self.server.state.lock:
            if time.monotonic() < session.admin_retry_after:
                self._json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "admin_retry_later"})
                return True
        accepted = verify(verifier_path, username, password)
        with self.server.state.lock:
            if accepted:
                session.admin_unlocked = True
                session.failed_admin_attempts = 0
                session.admin_retry_after = 0.0
            else:
                session.admin_unlocked = False
                session.failed_admin_attempts += 1
                if session.failed_admin_attempts >= 5:
                    session.admin_retry_after = time.monotonic() + 60.0
        self._json(HTTPStatus.OK if accepted else HTTPStatus.UNAUTHORIZED,
                   {"ok": accepted, "adminUnlocked": accepted, **({} if accepted else {"error": "admin_login_failed"})})
        return True

    def _workspace_routes(self, path: str, session: RuntimeSession) -> bool:
        if not path.startswith("/api/workspace/"):
            return False
        store = self.server.state.workspace_store
        if store is None:
            raise WorkspaceError("workspace_not_configured")
        if path == "/api/workspace/db" and self.command == "POST":
            value = self._read_json(MAX_PART_BYTES + 4096)
            workspace, action = value.get("workspace"), value.get("action")
            if not isinstance(workspace, str) or not isinstance(action, str):
                raise WorkspaceError("db_query_invalid")
            model = ReadModel(store)
            if action == "prepare":
                result = model.prepare(workspace)
            elif action == "bootstrap":
                result = model.bootstrap(workspace)
            elif action == "context":
                result = model.context(workspace, value.get("revision"), value.get("label"), value.get("after", ""))
            elif action == "view":
                result = model.view(workspace, value.get("revision"), value.get("name"), value.get("filters", {}),
                                    value.get("page", 0), value.get("size", 50))
            elif action == "begin":
                result = model.begin(workspace, value.get("revision"), value.get("mode"))
            elif action == "batch":
                result = model.batch(workspace, value.get("token"), value.get("label"), value.get("rows"))
            elif action == "finish":
                token=value.get("token")
                if not isinstance(token,str) or not re.fullmatch(r"[0-9a-f]{32}",token):raise WorkspaceError("db_import_invalid")
                key=workspace+":"+token
                started=time.monotonic()
                def report(progress):
                    with self.server.state.lock:
                        if key not in session.workspace_progress and len(session.workspace_progress)>=64:
                            del session.workspace_progress[next(iter(session.workspace_progress))]
                        session.workspace_progress[key]={**progress,"elapsedSeconds":time.monotonic()-started}
                try:
                    result = model.finish(workspace,token,value.get("sourceSr"),on_progress=report)
                except BaseException:
                    with self.server.state.lock:
                        if key in session.workspace_progress:session.workspace_progress[key]={**session.workspace_progress[key],"status":"failed"}
                    raise
            elif action == "progress":
                token=value.get("token")
                if not re.fullmatch(r"[0-9a-f]{32}",workspace) or not isinstance(token,str) or not re.fullmatch(r"[0-9a-f]{32}",token):
                    raise WorkspaceError("db_import_invalid")
                with self.server.state.lock:
                    result=dict(session.workspace_progress.get(workspace+":"+token,{"status":"pending","percent":0,"stage":"preparing"}))
            elif action == "files":
                result = {"skip": model.files(workspace, value.get("files"))}
            elif action == "latest":
                result = model.latest(workspace,value.get("revision"),value.get("ips"))
            elif action == "neighbors":
                result = model.neighbors(workspace,value.get("token"),value.get("result"))
            elif action == "neighbors-batch":
                result = model.neighbor_batch(workspace,value.get("token"),value.get("results"))
            elif action == "remove-pairs":
                result = model.remove_pairs(workspace,value.get("token"),value.get("pairs"))
            elif action == "clear":
                result = model.clear_checkpoints(workspace,value.get("revision"),value.get("scope"),value.get("keys"))
            else:
                raise WorkspaceError("db_query_invalid")
            self._json(HTTPStatus.OK, result)
        elif path == "/api/workspace/status" and self.command == "GET":
            self._json(HTTPStatus.OK, store.status())
        elif path == "/api/workspace/snapshot" and self.command == "GET":
            self._json(HTTPStatus.OK, store.load())
        elif path == "/api/workspace/select" and self.command == "POST":
            value = self._read_json(4096)
            if set(value) != {"path"} or not isinstance(value["path"], str):
                raise WorkspaceError("workspace_path_invalid")
            self._json(HTTPStatus.OK, store.select(value["path"]))
        elif path == "/api/workspace/choose" and self.command == "POST":
            value = self._read_json(1024)
            if value:
                raise WorkspaceError("workspace_payload_invalid")
            self._json(HTTPStatus.OK, store.select(choose_workspace_directory()))
        elif path == "/api/workspace/commit" and self.command == "POST":
            # Compatibility for the old client. Current clients only transfer bounded parts.
            value = self._read_json(LEGACY_PAYLOAD_BYTES + 4096)
            if set(value) != {"baseRevision", "payload"}:
                raise WorkspaceError("workspace_payload_invalid")
            self._json(HTTPStatus.OK, store.commit(value["baseRevision"], value["payload"]))
        elif self.command == "POST" and path.startswith("/api/workspace/transfer/"):
            action = path.rsplit("/", 1)[-1]
            fields = {"begin": {"workspace", "revision"}, "part": {"workspace", "upload", "position", "digest", "body"},
                      "finish": {"workspace", "upload", "parts"}}.get(action)
            if fields is None:
                self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
                return True
            value = self._read_json(MAX_PART_BYTES * 2 + 4096 if action == "part" else 4096)
            if set(value) != fields:
                raise WorkspaceError("workspace_part_invalid")
            if action == "begin":
                result = store.begin_parts(value["workspace"], value["revision"])
            elif action == "part":
                result = store.write_part(value["workspace"], value["upload"], value["position"], value["digest"], value["body"])
            else:
                result = store.finish_parts(value["workspace"], value["upload"], value["parts"])
            self._json(HTTPStatus.OK, result)
        elif self.command == "GET" and (part := re.fullmatch(r"/api/workspace/part/([a-f0-9]{32})/([0-9]{1,16})/([0-9]{1,16})", path)):
            self._json(HTTPStatus.OK, store.read_part(part[1], int(part[2]), int(part[3])))
        elif self.command == "GET" and (checkpoint := re.fullmatch(r"/api/workspace/log-(file|list)/([a-f0-9]{32})/([a-f0-9]{64})/([a-f0-9]{64}|-)", path)):
            method = store.read_log_checkpoint if checkpoint[1] == "file" else store.list_log_checkpoints
            self._json(HTTPStatus.OK, {"value": method(checkpoint[2], checkpoint[3], checkpoint[4])})
        elif self.command == "POST" and path == "/api/workspace/log-file":
            value = self._read_json(MAX_PART_BYTES + 4096)
            if set(value) != {"workspace", "scope", "key", "result"}:
                raise WorkspaceError("workspace_checkpoint_invalid")
            store.write_log_checkpoint(value["workspace"], value["scope"], value["key"], value["result"])
            self._json(HTTPStatus.OK, {"stored": True})
        elif self.command == "POST" and path == "/api/workspace/log-finish":
            value = self._read_json(40 * 1024)
            if set(value) != {"workspace", "scope", "revision", "keys"}:
                raise WorkspaceError("workspace_checkpoint_invalid")
            pending = store.clear_log_checkpoints(value["workspace"], value["scope"], value["revision"], value["keys"])
            self._json(HTTPStatus.OK, {"ok": True, "pendingLogFiles": pending})
        else:
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
        return True

    def _dispatch(self) -> None:
        parsed = urlsplit(self.path)
        path = unquote(parsed.path)
        if path == "/launch" and self.command == "GET":
            self._launch(parsed.query)
            return
        session_pair = self._session(self.command not in {"GET", "HEAD"})
        if session_pair is None:
            return
        _, session = session_pair
        if path == "/api/session" and self.command == "GET":
            self._json(HTTPStatus.OK, {"secureRuntime": True, "role": "administrator", "displayName": "Администратор МЦТП", "csrfToken": session.csrf_token, "adminConfigured": configured(self.server.state.admin_verifier_path), "adminUnlocked": session.admin_unlocked})
            return
        if path == "/runtime-config.js" and self.command in {"GET", "HEAD"}:
            script = f"globalThis.__MVP_SECURE_RUNTIME__=true;globalThis.__MVP_CSRF__={json.dumps(session.csrf_token)};"
            self._send(HTTPStatus.OK, script, "text/javascript; charset=utf-8")
            return
        if self._admin_route(path, session):
            return
        with self.server.state.lock:
            admin_unlocked = session.admin_unlocked
        if (path.startswith("/api/polling/") or path.startswith("/api/workspace/")) and not admin_unlocked:
            self._json(HTTPStatus.FORBIDDEN, {"error": "admin_login_required"})
            return
        if self._workspace_routes(path,session):
            return
        if self._credentials_route(session):
            return
        if self._polling_job_routes(path, session):
            return
        if self.command in {"GET", "HEAD"} and self._serve_static(path):
            return
        self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def _safe_dispatch(self) -> None:
        try:
            self._dispatch()
        except RequestError as error:
            self._json(error.status, {"error": error.code})
        except WorkspaceError as error:
            status = HTTPStatus.CONFLICT if error.code in {"workspace_revision_conflict", "workspace_missing", "workspace_corrupt"} else HTTPStatus.BAD_REQUEST
            self._json(status, {"error": error.code})
        except sqlite3.Error:
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "workspace_write_failed"})
        except Exception:
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "local_runtime_error", "safeMessage": "Локальная операция не выполнена"})

    def do_GET(self) -> None:
        self._safe_dispatch()

    def do_HEAD(self) -> None:
        self._safe_dispatch()

    def do_POST(self) -> None:
        self._safe_dispatch()

    def do_DELETE(self) -> None:
        self._safe_dispatch()

    def do_PUT(self) -> None:
        self._safe_dispatch()


def create_server(project_root: Path | str, port: int = 0, admin_verifier_path: Path | None = None,
                  workspace_locator_path: Path | None = None) -> LocalRuntimeServer:
    root = Path(project_root).resolve()
    state = RuntimeState(project_root=root, admin_verifier_path=admin_verifier_path or default_verifier_path(),
                         workspace_store=WorkspaceStore(workspace_locator_path or default_workspace_locator_path(), root))
    return LocalRuntimeServer((HOST, int(port)), state)
