"""Authenticated loopback-only HTTP boundary for the browser application."""

from __future__ import annotations

import json
import hashlib
import re
import secrets
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

from .credentials import CredentialFileError, MAX_XLSX_BYTES, parse_credential_workbook
from .polling import normalize_ipv4
from .polling_job import JobInputError, PollingJob, TERMINAL_STATUSES, create_polling_job
from .redaction import PlanSecretError, assert_no_plan_secrets


HOST = "127.0.0.1"
COOKIE_NAME = "mvp_sphere_session"
CONTENT_SECURITY_POLICY = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)
PUBLIC_FILES = {
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/product-catalog.js": ("product-catalog.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
    "/vendor/xlsx.full.min.js": ("vendor/xlsx.full.min.js", "text/javascript; charset=utf-8"),
    "/runtime/credential-pool.js": ("runtime/credential-pool.js", "text/javascript; charset=utf-8"),
}
JOB_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)$")
CANCEL_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)/cancel$")
RESULT_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)/result$")
ACK_ROUTE = re.compile(r"^/api/polling/jobs/([A-Za-z0-9_-]+)/result/([A-Za-z0-9_-]+)/ack$")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class RuntimeSession:
    csrf_token: str
    created_at: str = field(default_factory=utc_now)
    credential_pool: list[dict[str, str]] | None = None
    credential_sha256: str | None = None
    credential_summary: dict[str, Any] | None = None
    active_job_id: str | None = None
    last_job_id: str | None = None

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
        self.send_response(status)
        self._security_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD" and payload:
            self.wfile.write(payload)

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
            filename = str(self.headers.get("X-File-Name") or "")
            if not filename.casefold().endswith(".xlsx"):
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
                parsed = parse_credential_workbook(body)
            except CredentialFileError:
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
            if not isinstance(plan, dict) or plan.get("schemaVersion") != 2 or not isinstance(plan.get("devices"), list) or not plan["devices"]:
                raise ValueError("plan_invalid")
            valid_ips = []
            for device in plan["devices"]:
                if not isinstance(device, dict):
                    raise ValueError("plan_invalid")
                ip = normalize_ipv4(device.get("ipNormalized") or device.get("ip"))
                if ip:
                    valid_ips.append(ip)
            if len(set(valid_ips)) != len(valid_ips):
                raise ValueError("plan_invalid")
            interval = plan.get("intervalSeconds") or 0
            if isinstance(interval, bool) or not isinstance(interval, int) or interval < 0:
                raise ValueError("plan_invalid")
        except (PlanSecretError, ValueError, TypeError):
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
            self._json(HTTPStatus.OK, {"secureRuntime": True, "role": "administrator", "displayName": "Администратор МЦТП", "csrfToken": session.csrf_token})
            return
        if path == "/runtime-config.js" and self.command in {"GET", "HEAD"}:
            script = f"globalThis.__MVP_SECURE_RUNTIME__=true;globalThis.__MVP_CSRF__={json.dumps(session.csrf_token)};"
            self._send(HTTPStatus.OK, script, "text/javascript; charset=utf-8")
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


def create_server(project_root: Path | str, port: int = 0) -> LocalRuntimeServer:
    root = Path(project_root).resolve()
    state = RuntimeState(project_root=root)
    return LocalRuntimeServer((HOST, int(port)), state)
