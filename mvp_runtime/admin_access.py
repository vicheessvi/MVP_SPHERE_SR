"""Per-Windows-user verifier for the local administrator plan gate."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from pathlib import Path


N = 1 << 14
R = 8
P = 1


def default_verifier_path() -> Path:
    local_app_data = os.environ.get("LOCALAPPDATA")
    base = Path(local_app_data) if local_app_data else Path.home() / ("AppData/Local" if os.name == "nt" else ".local/share")
    return base / "MVP_SPHERE_SR" / "admin-access.json"


def valid_input(username: object, password: object) -> bool:
    return (isinstance(username, str) and 1 <= len(username) <= 64
            and username == username.strip() and not any(ord(char) < 32 for char in username)
            and isinstance(password, str) and 12 <= len(password) <= 1024
            and bool(password.strip())
            and not any(ord(char) < 32 for char in password))


def configured(path: Path) -> bool:
    return path.exists()


def _secret_material(username: str, password: str) -> bytes:
    return username.encode("utf-8") + b"\x00" + password.encode("utf-8")


def create_verifier(path: Path, username: str, password: str) -> bool:
    if not valid_input(username, password):
        raise ValueError("admin_credentials_invalid")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    salt = secrets.token_bytes(32)
    digest = hashlib.scrypt(_secret_material(username, password), salt=salt, n=N, r=R, p=P, dklen=32)
    record = {"version": 1, "kdf": "scrypt", "n": N, "r": R, "p": P,
              "salt": base64.b64encode(salt).decode("ascii"), "digest": base64.b64encode(digest).decode("ascii")}
    try:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
    except FileExistsError:
        return False
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(record, stream, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return True


def verify(path: Path, username: str, password: str) -> bool:
    if not valid_input(username, password):
        return False
    try:
        if path.stat().st_size > 4096:
            return False
        record = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(record, dict):
            return False
        if (record.get("version") != 1 or record.get("kdf") != "scrypt"
                or (record.get("n"), record.get("r"), record.get("p")) != (N, R, P)):
            return False
        salt = base64.b64decode(record["salt"], validate=True)
        expected = base64.b64decode(record["digest"], validate=True)
        if len(salt) != 32 or len(expected) != 32:
            return False
        actual = hashlib.scrypt(_secret_material(username, password), salt=salt, n=N, r=R, p=P, dklen=32)
        return hmac.compare_digest(actual, expected)
    except (OSError, ValueError, KeyError, TypeError):
        return False
