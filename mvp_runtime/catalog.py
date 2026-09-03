"""Shared device catalog loading and deterministic manifest resolution."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CATALOG_PATH = PROJECT_ROOT / "runtime" / "device-catalog.json"


class CatalogError(ValueError):
    """Raised when the shared catalog is absent or malformed."""


def normalize(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().casefold())


def load_catalog(path: Path | str = DEFAULT_CATALOG_PATH) -> dict[str, Any]:
    catalog_path = Path(path)
    try:
        payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise CatalogError("device_catalog_invalid") from error
    if payload.get("schemaVersion") != 1 or not isinstance(payload.get("entries"), list):
        raise CatalogError("device_catalog_invalid")
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in payload["entries"]:
        if not isinstance(raw, dict):
            raise CatalogError("device_catalog_invalid")
        entry = {
            "key": str(raw.get("key") or ""),
            "category": normalize(raw.get("category")),
            "manufacturer": normalize(raw.get("manufacturer")),
            "aliases": [str(item) for item in raw.get("aliases", []) if str(item).strip()],
            "models": [str(item) for item in raw.get("models", []) if str(item).strip()],
            "protocolStatus": str(raw.get("protocolStatus") or "unsupported"),
            "transport": raw.get("transport") or None,
            "credentialMode": str(raw.get("credentialMode") or "none"),
        }
        if (
            not entry["key"]
            or entry["key"] in seen
            or not entry["category"]
            or not entry["manufacturer"]
            or entry["protocolStatus"] not in {"supported", "protocol_required", "unsupported"}
        ):
            raise CatalogError("device_catalog_invalid")
        seen.add(entry["key"])
        entries.append(entry)
    return {"schemaVersion": 1, "adapters": list(payload.get("adapters") or []), "entries": entries}


CATALOG = load_catalog()


def resolve_manifest(device: dict[str, Any] | None, catalog: dict[str, Any] = CATALOG) -> dict[str, Any]:
    source = device or {}
    category = normalize(source.get("category"))
    manufacturer = normalize(
        source.get("manufacturerNormalized")
        or source.get("manufacturerRaw")
        or source.get("manufacturer")
    )
    model = normalize(source.get("modelNormalized") or source.get("modelRaw") or source.get("model"))
    candidates = []
    for entry in catalog["entries"]:
        manufacturers = [entry["manufacturer"], *[normalize(item) for item in entry["aliases"]]]
        if entry["category"] == category and manufacturer in manufacturers:
            candidates.append(entry)
    if candidates:
        exact = next((entry for entry in candidates if any(normalize(item) == model for item in entry["models"])), None)
        manifest = exact or next((entry for entry in candidates if entry["protocolStatus"] != "supported"), candidates[0])
        return {
            **manifest,
            "aliases": list(manifest["aliases"]),
            "models": list(manifest["models"]),
            "model": model,
            "knownModel": any(normalize(item) == model for item in manifest["models"]),
        }
    return {
        "key": f"{category or 'unknown'}/{manufacturer or 'unknown'}",
        "category": category,
        "manufacturer": manufacturer,
        "model": model,
        "knownModel": False,
        "protocolStatus": "unsupported",
        "transport": None,
        "credentialMode": "none",
        "aliases": [],
        "models": [],
    }
