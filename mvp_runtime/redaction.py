"""Plan validation and result redaction shared by every polling adapter."""

from __future__ import annotations

import re
from typing import Any


SECRET_KEY = re.compile(
    r"^(password|pass|username|login|credential|credentials|successfulCredential|authorization|cookie|set-cookie|token|secret|headers)$",
    re.IGNORECASE,
)
PLAN_SECRET_KEY = re.compile(
    r"^(password|pass|username|login|credential|credentials|authorization|cookie|token|secret)$",
    re.IGNORECASE,
)
INLINE_SECRET = re.compile(r"\bBasic\s+[A-Za-z0-9+/=]+|NortxeSession=", re.IGNORECASE)


class PlanSecretError(ValueError):
    """A plan attempted to cross the credential boundary."""


def assert_no_plan_secrets(value: Any, trail: str = "plan") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if PLAN_SECRET_KEY.fullmatch(str(key)):
                raise PlanSecretError(f"{trail} contains a credential field")
            assert_no_plan_secrets(child, f"{trail}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            assert_no_plan_secrets(child, f"{trail}[{index}]")


def sanitize_result(value: Any, seen: set[int] | None = None) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return "[REDACTED]" if INLINE_SECRET.search(value) else value
    if isinstance(value, bytes):
        return "[BINARY]"
    visited = seen if seen is not None else set()
    identity = id(value)
    if identity in visited:
        return "[CIRCULAR]"
    visited.add(identity)
    try:
        if isinstance(value, (list, tuple)):
            return [sanitize_result(item, visited) for item in value]
        if isinstance(value, dict):
            output: dict[str, Any] = {}
            for key, child in value.items():
                if SECRET_KEY.fullmatch(str(key)):
                    continue
                output[str(key)] = sanitize_result(child, visited)
            return output
        return str(value)
    finally:
        visited.discard(identity)
