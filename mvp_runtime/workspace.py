"""Explicit local SQLite workspace for safe, completed analytics snapshots."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DATABASE_NAME = "MVP_SPHERE_SR_Workspace.sqlite3"
LOCATOR_VERSION = 1
PAYLOAD_VERSION = 1
MAX_PAYLOAD_BYTES = 128 * 1024 * 1024
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


def _validate_projection(payload: Any) -> bytes:
    if not isinstance(payload, dict) or payload.get("schemaVersion") != PAYLOAD_VERSION:
        raise WorkspaceError("workspace_payload_invalid")
    state, log = payload.get("state"), payload.get("log")
    if (not isinstance(state, dict) or state.get("version") != 3
            or not all(isinstance(state.get(key), list) for key in ("srImports", "inventoryDevices", "pollingResults"))
            or not isinstance(log, dict) or not isinstance(log.get("rows"), list)
            or not isinstance(log.get("indexes"), dict) or not isinstance(log.get("registry"), list)):
        raise WorkspaceError("workspace_payload_invalid")
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
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    if len(encoded) > MAX_PAYLOAD_BYTES:
        raise WorkspaceError("workspace_payload_too_large")
    return encoded


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
        revision, payload, _digest, updated_at = self._read_snapshot()
        return {"status": "ready", "revision": revision, "path": str(selected),
                "hasSnapshot": payload is not None, "updatedAt": updated_at}

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
        revision, payload, _digest, _updated_at = self._read_snapshot()
        if payload is None:
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
                row = connection.execute("SELECT revision,payload,digest FROM workspace_snapshot WHERE id=1").fetchone()
                if row is None:
                    raise WorkspaceError("workspace_corrupt")
                if row[0] != expected_revision:
                    raise WorkspaceError("workspace_revision_conflict")
                updated_at = _now()
                connection.execute("UPDATE workspace_snapshot SET revision=?,payload=?,digest=?,previous_payload=?,previous_digest=?,updated_at=? WHERE id=1",
                                   (expected_revision + 1, encoded, digest, row[1], row[2], updated_at))
                connection.commit()
                return {"revision": expected_revision + 1, "updatedAt": updated_at, "sha256": digest}
        except WorkspaceError:
            raise
        except (sqlite3.Error, OSError) as error:
            raise WorkspaceError("workspace_write_failed") from error
