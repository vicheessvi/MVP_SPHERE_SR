"""Explicit local SQLite workspace for safe, completed analytics snapshots."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import tempfile
import uuid
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DATABASE_NAME = "MVP_SPHERE_SR_Workspace.sqlite3"
LOCATOR_VERSION = 1
PAYLOAD_VERSION = 1
LEGACY_PAYLOAD_BYTES = 128 * 1024 * 1024
MAX_PART_BYTES = 16 * 1024 * 1024
SECRET_KEY = re.compile(
    r"(?:rawtext|password|passwd|secret|credential|cookie|token|api.?key|private.?key|authenticationinputsha256|sessionid|username|successfulcredential)",
    re.IGNORECASE,
)
INLINE_SECRET = re.compile(r"\bBasic\s+[A-Za-z0-9+/=]+|NortxeSession=", re.IGNORECASE)


class WorkspaceError(ValueError):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def default_workspace_locator_path() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    return (Path(base) if base else Path.home() / "AppData" / "Local") / "MVP_SPHERE_SR" / "workspace-location.json"


def choose_workspace_directory() -> str:
    """Open a user-controlled native folder dialog; no path is selected silently."""
    root = None
    try:
        import tkinter
        from tkinter import filedialog

        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        chosen = filedialog.askdirectory(parent=root, title="Выберите рабочую папку MVP_SPHERE_SR", mustexist=True)
    except Exception as error:
        raise WorkspaceError("workspace_dialog_unavailable") from error
    finally:
        if root is not None:
            try:
                root.destroy()
            except Exception:
                pass
    if not chosen:
        raise WorkspaceError("workspace_selection_cancelled")
    return str(chosen)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _inspect_safe(payload: Any) -> None:
    nodes = 0

    def inspect(value: Any, depth: int) -> None:
        nonlocal nodes
        nodes += 1
        if nodes > 4_000_000 or depth > 64:
            raise WorkspaceError("workspace_payload_too_large")
        if isinstance(value, dict):
            for key, child in value.items():
                if not isinstance(key, str) or SECRET_KEY.search(key):
                    raise WorkspaceError("workspace_secret_rejected")
                inspect(child, depth + 1)
        elif isinstance(value, list):
            for child in value:
                inspect(child, depth + 1)
        elif isinstance(value, str):
            if len(value) > 1_000_000 or INLINE_SECRET.search(value):
                raise WorkspaceError("workspace_secret_rejected")
        elif isinstance(value, float):
            if not math.isfinite(value):
                raise WorkspaceError("workspace_payload_invalid")
        elif value is not None and not isinstance(value, (bool, int)):
            raise WorkspaceError("workspace_payload_invalid")

    inspect(payload, 0)


def _validate_projection(payload: Any) -> bytes:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != PAYLOAD_VERSION:
        raise WorkspaceError("workspace_payload_invalid")
    state, log = payload.get("state"), payload.get("log")
    if (not isinstance(state, dict) or state.get("version") != 3
            or not all(isinstance(state.get(key), list) for key in ("srImports", "inventoryDevices", "pollingResults"))
            or not isinstance(log, dict) or not isinstance(log.get("rows"), list)
            or not isinstance(log.get("indexes"), dict) or not isinstance(log.get("registry"), list)):
        raise WorkspaceError("workspace_payload_invalid")
    _inspect_safe(payload)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(encoded) > LEGACY_PAYLOAD_BYTES:
        raise WorkspaceError("workspace_payload_too_large")
    return encoded


def _hex(value: Any, count: int = 64) -> bool:
    return isinstance(value, str) and len(value) == count and all(c in "0123456789abcdef" for c in value)


def _number(value: Any, minimum: int = 0) -> bool:
    return type(value) is int and minimum <= value < 2**53


def _part_definition(part: Any, position: int) -> tuple[str, int, int]:
    if not isinstance(part, dict):
        raise WorkspaceError("workspace_part_invalid")
    if position == 0 and set(part) == {"meta"}:
        _validate_projection(part["meta"])
        return "", 0, 0
    if (position == 0 or set(part) != {"key", "offset", "rows"} or not isinstance(part["key"], str)
            or not re.fullmatch(r"state/[a-zA-Z][a-zA-Z0-9]{0,60}|log/(?:rows|registry|indexes/[a-zA-Z0-9]{1,40}/events)", part["key"])
            or not _number(part["offset"]) or not isinstance(part["rows"], list) or not part["rows"]):
        raise WorkspaceError("workspace_part_invalid")
    _inspect_safe(part)
    return part["key"], part["offset"], len(part["rows"])


class WorkspaceStore:
    def __init__(self, locator_path: Path | str, project_root: Path | str):
        self.locator_path = Path(locator_path)
        self.project_root = Path(project_root).resolve()

    def _selected_directory(self) -> Path | None:
        if not self.locator_path.exists():
            return None
        try:
            raw = json.loads(self.locator_path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict) or raw.get("version") != LOCATOR_VERSION or not isinstance(raw.get("path"), str):
                raise ValueError("locator_schema")
            selected = Path(raw["path"])
            if not selected.is_absolute():
                raise ValueError("locator_path")
            return selected
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
            raise WorkspaceError("workspace_locator_invalid") from error

    def database_path(self) -> Path:
        selected = self._selected_directory()
        if selected is None:
            raise WorkspaceError("workspace_not_configured")
        return selected / DATABASE_NAME

    @staticmethod
    def _reject_outdated_writer(connection: sqlite3.Connection) -> None:
        if connection.execute("SELECT 1 FROM sqlite_master WHERE name='rm_control' AND type='table'").fetchone():
            row = connection.execute("SELECT native FROM rm_control WHERE id=1").fetchone()
            if row and row[0]:
                raise WorkspaceError("workspace_db_first_required")

    def _existing_database(self) -> Path:
        path = self.database_path()
        if not path.parent.is_dir() or not path.is_file() or path.is_symlink():
            raise WorkspaceError("workspace_missing")
        return path

    def _read_snapshot(self) -> tuple[int, bytes | None, str | None, str]:
        path = self._existing_database()
        try:
            with closing(sqlite3.connect(path)) as connection:
                if connection.execute("PRAGMA quick_check").fetchone() != ("ok",):
                    raise WorkspaceError("workspace_corrupt")
                row = connection.execute("SELECT revision,payload,digest,updated_at FROM workspace_snapshot WHERE id=1").fetchone()
                if row is None or type(row[0]) is not int or row[0] < 0:
                    raise WorkspaceError("workspace_corrupt")
                revision, payload, digest, updated_at = row
                if payload is not None and (not isinstance(payload, bytes) or not isinstance(digest, str)
                                            or hashlib.sha256(payload).hexdigest() != digest):
                    raise WorkspaceError("workspace_corrupt")
                return revision, payload, digest, updated_at
        except WorkspaceError:
            raise
        except (sqlite3.Error, OSError) as error:
            raise WorkspaceError("workspace_corrupt") from error

    def status(self) -> dict[str, Any]:
        selected = self._selected_directory()
        if selected is None:
            return {"status": "not_configured", "revision": None}
        try:
            with closing(sqlite3.connect(self._existing_database(), timeout=10)) as connection, connection:
                self._init_parts(connection)
                row = connection.execute("SELECT revision,payload IS NOT NULL,updated_at FROM workspace_snapshot WHERE id=1").fetchone()
                if row is None or not _number(row[0]):
                    raise WorkspaceError("workspace_corrupt")
                revision, legacy, updated_at = row
                part_count = connection.execute("SELECT count(*) FROM workspace_part_links WHERE revision=?", (revision,)).fetchone()[0]
                pending = connection.execute("SELECT count(*) FROM workspace_log_checkpoints").fetchone()[0]
                workspace = connection.execute("SELECT workspace_id FROM workspace_transfer WHERE id=1").fetchone()[0]
                native=None
                if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='rm_control'").fetchone():
                    native=connection.execute("SELECT source_revision,data_revision,native,ready FROM rm_control WHERE id=1").fetchone()
                if revision and not (legacy or part_count):
                    raise WorkspaceError("workspace_corrupt")
                return {"status": "ready", "revision": revision, "path": str(selected), "workspaceId": workspace,
                        "hasSnapshot": bool(legacy or part_count or native and native[2] and native[3]), "partCount": part_count,
                        **({"dbFirst":True,"dataRevision":f"{native[0]}:{native[1]}"} if native and native[2] else {}),
                        "pendingLogFiles": pending, "updatedAt": updated_at}
        except sqlite3.Error as error:
            raise WorkspaceError("workspace_corrupt") from error

    @staticmethod
    def _init_parts(connection: sqlite3.Connection) -> None:
        if connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='workspace_transfer'").fetchone():
            return
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("CREATE TABLE IF NOT EXISTS workspace_transfer (id INTEGER PRIMARY KEY CHECK(id=1), workspace_id TEXT NOT NULL, upload TEXT, base_revision INTEGER, next_part INTEGER NOT NULL)")
        connection.execute("CREATE TABLE IF NOT EXISTS workspace_part_data (digest TEXT PRIMARY KEY, body BLOB NOT NULL, label TEXT NOT NULL, row_offset INTEGER NOT NULL, row_count INTEGER NOT NULL)")
        connection.execute("CREATE TABLE IF NOT EXISTS workspace_part_links (revision INTEGER NOT NULL, position INTEGER NOT NULL, digest TEXT NOT NULL, label TEXT NOT NULL, row_end INTEGER NOT NULL, PRIMARY KEY(revision,position)) WITHOUT ROWID")
        connection.execute("CREATE INDEX IF NOT EXISTS workspace_part_label ON workspace_part_links(revision,label,row_end)")
        connection.execute("CREATE INDEX IF NOT EXISTS workspace_part_digest ON workspace_part_links(digest)")
        connection.execute("CREATE TABLE IF NOT EXISTS workspace_log_checkpoints (scope TEXT NOT NULL, file_key TEXT NOT NULL, digest TEXT NOT NULL, body BLOB NOT NULL, PRIMARY KEY(scope,file_key)) WITHOUT ROWID")
        connection.execute("INSERT OR IGNORE INTO workspace_transfer VALUES(1,?,NULL,NULL,0)", (uuid.uuid4().hex,))

    def _parts_connection(self, workspace: Any) -> sqlite3.Connection:
        if not _hex(workspace, 32):
            raise WorkspaceError("workspace_id_invalid")
        connection = sqlite3.connect(self._existing_database(), timeout=10)
        try:
            row = connection.execute("SELECT workspace_id FROM workspace_transfer WHERE id=1").fetchone()
            if not row or row[0] != workspace:
                raise WorkspaceError("workspace_selection_changed")
            return connection
        except sqlite3.Error as error:
            connection.close()
            raise WorkspaceError("workspace_selection_changed") from error
        except BaseException:
            connection.close()
            raise

    @staticmethod
    def _check_revision(connection: sqlite3.Connection, revision: int) -> None:
        row = connection.execute("SELECT revision FROM workspace_snapshot WHERE id=1").fetchone()
        if not row or row[0] != revision:
            raise WorkspaceError("workspace_revision_conflict")

    @staticmethod
    def _collect_unreferenced_parts(connection: sqlite3.Connection) -> None:
        connection.execute("DELETE FROM workspace_part_data WHERE NOT EXISTS (SELECT 1 FROM workspace_part_links WHERE workspace_part_links.digest=workspace_part_data.digest)")

    def begin_parts(self, workspace: str, revision: int) -> dict[str, Any]:
        if not _number(revision):
            raise WorkspaceError("workspace_revision_invalid")
        upload = uuid.uuid4().hex
        with closing(self._parts_connection(workspace)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self._reject_outdated_writer(connection)
            self._check_revision(connection, revision)
            connection.execute("DELETE FROM workspace_part_links WHERE revision=-1")
            self._collect_unreferenced_parts(connection)
            connection.execute("UPDATE workspace_transfer SET upload=?,base_revision=?,next_part=0 WHERE id=1", (upload, revision))
        return {"upload": upload}

    @staticmethod
    def _require_upload(connection: sqlite3.Connection, upload: str) -> tuple[int, int]:
        WorkspaceStore._reject_outdated_writer(connection)
        row = connection.execute("SELECT upload,base_revision,next_part FROM workspace_transfer WHERE id=1").fetchone()
        if not _hex(upload, 32) or not row or upload != row[0]:
            raise WorkspaceError("workspace_revision_conflict")
        WorkspaceStore._check_revision(connection, row[1])
        return row[1], row[2]

    def write_part(self, workspace: str, upload: str, position: int, digest: str, text: str | None) -> dict[str, Any]:
        if not _number(position) or not _hex(digest) or (text is not None and not isinstance(text, str)):
            raise WorkspaceError("workspace_part_invalid")
        data = None
        if text is not None:
            try:
                data = text.encode("utf-8")
                if len(data) > MAX_PART_BYTES:
                    raise WorkspaceError("workspace_part_too_large")
                if hashlib.sha256(data).hexdigest() != digest:
                    raise WorkspaceError("workspace_part_invalid")
                label, offset, count = _part_definition(json.loads(text), position)
            except (UnicodeError, ValueError, RecursionError) as error:
                if isinstance(error, WorkspaceError):
                    raise
                raise WorkspaceError("workspace_part_invalid") from error
        with closing(self._parts_connection(workspace)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            _, next_position = self._require_upload(connection, upload)
            if position != next_position:
                raise WorkspaceError("workspace_part_order")
            if data is None:
                found = connection.execute("SELECT label,row_offset,row_count FROM workspace_part_data WHERE digest=?", (digest,)).fetchone()
                if found is None:
                    return {"stored": False}
                label, offset, count = found
            if (position == 0) != (label == ""):
                raise WorkspaceError("workspace_part_order")
            if label:
                header = connection.execute("SELECT data.body FROM workspace_part_links AS links JOIN workspace_part_data AS data USING(digest) WHERE revision=-1 AND position=0").fetchone()
                target = json.loads(header[0])["meta"] if header else None
                for name in label.split("/"):
                    target = target.get(name) if isinstance(target, dict) else None
                if target != []:
                    raise WorkspaceError("workspace_part_invalid")
            last = connection.execute("SELECT max(row_end) FROM workspace_part_links WHERE revision=-1 AND label=?", (label,)).fetchone()[0]
            if offset != (last or 0):
                raise WorkspaceError("workspace_part_order")
            if data is not None:
                connection.execute("INSERT OR IGNORE INTO workspace_part_data VALUES(?,?,?,?,?)", (digest, data, label, offset, count))
            connection.execute("INSERT INTO workspace_part_links VALUES(-1,?,?,?,?)", (position, digest, label, offset + count))
            connection.execute("UPDATE workspace_transfer SET next_part=next_part+1 WHERE id=1")
        return {"stored": True}

    def finish_parts(self, workspace: str, upload: str, parts: int) -> dict[str, Any]:
        if not _number(parts, 1):
            raise WorkspaceError("workspace_part_invalid")
        with closing(self._parts_connection(workspace)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            revision, next_position = self._require_upload(connection, upload)
            if next_position != parts:
                raise WorkspaceError("workspace_part_order")
            updated = _now()
            connection.execute("UPDATE workspace_part_links SET revision=? WHERE revision=-1", (revision + 1,))
            connection.execute("UPDATE workspace_snapshot SET revision=?,payload=NULL,digest=NULL,previous_payload=payload,previous_digest=digest,updated_at=? WHERE id=1",
                               (revision + 1, updated))
            connection.execute("UPDATE workspace_transfer SET upload=NULL,base_revision=NULL,next_part=0 WHERE id=1")
            connection.execute("DELETE FROM workspace_part_links WHERE revision<?", (revision,))
            self._collect_unreferenced_parts(connection)
        return {"revision": revision + 1, "partCount": parts, "updatedAt": updated}

    def read_part(self, workspace: str, revision: int, position: int) -> dict[str, Any]:
        if not _number(revision, 1) or not _number(position):
            raise WorkspaceError("workspace_part_invalid")
        with closing(self._parts_connection(workspace)) as connection:
            self._reject_outdated_writer(connection)
            self._check_revision(connection, revision)
            row = connection.execute("SELECT data.body,data.digest FROM workspace_part_links AS links JOIN workspace_part_data AS data USING(digest) WHERE revision=? AND position=?", (revision, position)).fetchone()
        if not row or not isinstance(row[0], bytes) or hashlib.sha256(row[0]).hexdigest() != row[1]:
            raise WorkspaceError("workspace_corrupt")
        return {"body": row[0].decode("utf-8"), "digest": row[1]}

    @staticmethod
    def _check_log_key(scope: str, file_key: str) -> None:
        if not _hex(scope) or not _hex(file_key):
            raise WorkspaceError("workspace_checkpoint_invalid")

    def list_log_checkpoints(self, workspace: str, scope: str, after: str) -> list[str]:
        self._check_log_key(scope, after if after != "-" else "0" * 64)
        with closing(self._parts_connection(workspace)) as connection:
            return [row[0] for row in connection.execute("SELECT file_key FROM workspace_log_checkpoints WHERE scope=? AND file_key>? ORDER BY file_key LIMIT 512", (scope, "" if after == "-" else after))]

    def write_log_checkpoint(self, workspace: str, scope: str, file_key: str, result: dict[str, Any]) -> None:
        self._check_log_key(scope, file_key)
        if (not isinstance(result, dict) or set(result) != {"kind", "scan"} or result["kind"] not in (None, "te", "huawei300", "huawei310")
                or (result["kind"] is None and result["scan"] is not None)
                or (result["kind"] is not None and (not isinstance(result["scan"], dict)
                    or result["scan"].get("ok") is not True or not isinstance(result["scan"].get("markers"), list)
                    or not isinstance(result["scan"].get("bootGaps"), list)))):
            raise WorkspaceError("workspace_checkpoint_invalid")
        _inspect_safe(result)
        scan = result["scan"]
        if scan is not None:
            marker_keys = {"kind", "localAt", "timeMs", "lineNumber", "model", "method"}
            gap_keys = {"bootLocalAt", "gapSeconds", "gapMinutes", "fromLocalAt", "toLocalAt", "knownAction", "clockAnomalyOrLongGap"}
            if (set(scan) - {"ok", "markers", "coverage", "bootGaps", "digestAlgorithm", "contentDigest"}
                    or any(not isinstance(item, dict) or set(item) - marker_keys for item in scan["markers"])
                    or any(not isinstance(item, dict) or set(item) - gap_keys for item in scan["bootGaps"])
                    or (scan.get("coverage") is not None and (not isinstance(scan["coverage"], dict)
                        or set(scan["coverage"]) - {"lines", "oversizedLines", "malformedCandidates"}))):
                raise WorkspaceError("workspace_checkpoint_invalid")
            for item in scan["markers"] + scan["bootGaps"]:
                if any(isinstance(value, (dict, list)) or isinstance(value, str) and len(value) > 80 for value in item.values()):
                    raise WorkspaceError("workspace_checkpoint_invalid")
        data = json.dumps(result, ensure_ascii=True, separators=(",", ":"), allow_nan=False).encode("ascii")
        if len(data) > MAX_PART_BYTES:
            raise WorkspaceError("workspace_part_too_large")
        with closing(self._parts_connection(workspace)) as connection, connection:
            connection.execute("INSERT OR REPLACE INTO workspace_log_checkpoints VALUES(?,?,?,?)",
                               (scope, file_key, hashlib.sha256(data).hexdigest(), data))

    def read_log_checkpoint(self, workspace: str, scope: str, file_key: str) -> dict[str, Any] | None:
        self._check_log_key(scope, file_key)
        with closing(self._parts_connection(workspace)) as connection:
            row = connection.execute("SELECT digest,body FROM workspace_log_checkpoints WHERE scope=? AND file_key=?", (scope, file_key)).fetchone()
        if row is None:
            return None
        if not isinstance(row[1], bytes) or hashlib.sha256(row[1]).hexdigest() != row[0]:
            raise WorkspaceError("workspace_corrupt")
        return json.loads(row[1])

    def clear_log_checkpoints(self, workspace: str, scope: str, revision: int, keys: list[str]) -> int:
        if not _hex(scope) or not _number(revision, 1) or not isinstance(keys, list) or len(keys) > 512 or not all(_hex(key) for key in keys):
            raise WorkspaceError("workspace_checkpoint_invalid")
        with closing(self._parts_connection(workspace)) as connection, connection:
            connection.execute("BEGIN IMMEDIATE")
            self._check_revision(connection, revision)
            connection.executemany("DELETE FROM workspace_log_checkpoints WHERE scope=? AND file_key=?", ((scope, key) for key in keys))
            return connection.execute("SELECT count(*) FROM workspace_log_checkpoints").fetchone()[0]

    def select(self, directory: Path | str) -> dict[str, Any]:
        candidate = Path(directory)
        try:
            resolved = candidate.resolve(strict=True)
        except (OSError, RuntimeError) as error:
            raise WorkspaceError("workspace_path_invalid") from error
        protected = [Path(value).resolve() for name in ("WINDIR", "ProgramFiles", "ProgramFiles(x86)")
                     if (value := os.environ.get(name))]
        if (not candidate.is_absolute() or not resolved.is_dir() or candidate.is_symlink()
                or resolved == Path(resolved.anchor) or resolved == Path.home().resolve()
                or resolved == self.project_root or self.project_root in resolved.parents
                or resolved in self.project_root.parents
                or any(resolved == path or path in resolved.parents for path in protected)):
            raise WorkspaceError("workspace_path_invalid")
        database = resolved / DATABASE_NAME
        if database.is_symlink():
            raise WorkspaceError("workspace_path_invalid")
        if database.exists():
            if not database.is_file():
                raise WorkspaceError("workspace_corrupt")
            try:
                with closing(sqlite3.connect(database)) as connection:
                    if connection.execute("PRAGMA quick_check").fetchone() != ("ok",):
                        raise WorkspaceError("workspace_corrupt")
                    if connection.execute("SELECT revision FROM workspace_snapshot WHERE id=1").fetchone() is None:
                        raise WorkspaceError("workspace_corrupt")
            except WorkspaceError:
                raise
            except sqlite3.Error as error:
                raise WorkspaceError("workspace_corrupt") from error
        else:
            try:
                with closing(sqlite3.connect(database)) as connection:
                    connection.execute("PRAGMA journal_mode=WAL")
                    connection.execute("PRAGMA synchronous=FULL")
                    connection.execute("CREATE TABLE workspace_snapshot (id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,payload BLOB,digest TEXT,previous_payload BLOB,previous_digest TEXT,updated_at TEXT NOT NULL)")
                    connection.execute("INSERT INTO workspace_snapshot(id,revision,updated_at) VALUES(1,0,?)", (_now(),))
                    connection.commit()
            except (sqlite3.Error, OSError) as error:
                raise WorkspaceError("workspace_create_failed") from error
        self.locator_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_name = None
        try:
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=self.locator_path.parent,
                                             prefix="workspace-location-", suffix=".tmp", delete=False) as stream:
                temporary_name = stream.name
                json.dump({"version": LOCATOR_VERSION, "path": str(resolved)}, stream, ensure_ascii=False)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary_name, self.locator_path)
        except OSError as error:
            if temporary_name:
                try:
                    Path(temporary_name).unlink(missing_ok=True)
                except OSError:
                    pass
            raise WorkspaceError("workspace_locator_write_failed") from error
        return self.status()

    def load(self) -> dict[str, Any]:
        try:
            with closing(sqlite3.connect(self._existing_database())) as connection:
                self._reject_outdated_writer(connection)
        except sqlite3.Error as error:
            raise WorkspaceError("workspace_corrupt") from error
        revision, payload, _digest, _updated_at = self._read_snapshot()
        if payload is None:
            if revision:
                raise WorkspaceError("workspace_paged_snapshot")
            return {"revision": revision, "payload": None}
        try:
            decoded = json.loads(payload)
            _validate_projection(decoded)
        except (ValueError, UnicodeError, WorkspaceError) as error:
            raise WorkspaceError("workspace_corrupt") from error
        return {"revision": revision, "payload": decoded}

    def commit(self, expected_revision: int, payload: dict[str, Any]) -> dict[str, Any]:
        if type(expected_revision) is not int or expected_revision < 0:
            raise WorkspaceError("workspace_revision_invalid")
        encoded = _validate_projection(payload)
        path = self._existing_database()
        digest = hashlib.sha256(encoded).hexdigest()
        try:
            with closing(sqlite3.connect(path, timeout=10)) as connection:
                connection.execute("BEGIN IMMEDIATE")
                self._reject_outdated_writer(connection)
                row = connection.execute("SELECT revision,payload,digest FROM workspace_snapshot WHERE id=1").fetchone()
                if row is None:
                    raise WorkspaceError("workspace_corrupt")
                if row[0] != expected_revision:
                    raise WorkspaceError("workspace_revision_conflict")
                if row[0] and row[1] is None:
                    raise WorkspaceError("workspace_paged_snapshot")
                updated_at = _now()
                connection.execute("UPDATE workspace_snapshot SET revision=?,payload=?,digest=?,previous_payload=?,previous_digest=?,updated_at=? WHERE id=1",
                                   (expected_revision + 1, encoded, digest, row[1], row[2], updated_at))
                connection.commit()
                return {"revision": expected_revision + 1, "updatedAt": updated_at, "sha256": digest}
        except WorkspaceError:
            raise
        except (sqlite3.Error, OSError) as error:
            raise WorkspaceError("workspace_write_failed") from error
