"""Conservative read-only setting evidence shared by exact VCS adapters.

Unknown is deliberately not equivalent to disabled. Model-specific readers may
replace a field only after their existing identity gates have succeeded.
"""

from __future__ import annotations


SETTING_KEYS = (
    "telnet", "http", "snmpV2", "autoUpdate", "autoAnswer",
    "ntp", "wifi", "ssh", "powerManagement",
)


def unknown_device_settings(model: str, *, not_exposed: tuple[str, ...] = ()) -> dict:
    absent = set(not_exposed)
    return {
        "schemaVersion": 1,
        "model": model,
        "fields": {
            key: {"status": "not_exposed" if key in absent else "protocol_required", "value": None}
            for key in SETTING_KEYS
        },
    }


def binary_setting(value: int, source: str, *, disabled_value: int = 0) -> dict:
    if type(value) is not int or value not in (0, 1) or disabled_value not in (0, 1):
        return {"status": "unavailable", "value": None}
    return {
        "status": "read",
        "value": "disabled" if value == disabled_value else "enabled",
        "source": source,
    }
