"""Exact guarded Huawei Box 610 polling contract."""

from __future__ import annotations

from typing import Any

from .huawei_bar310 import poll_huawei_310_family_device


CONTRACT_ID = "huawei-box610-rest-v1"
CONTRACT_MODEL = "Box 610"
SUPPORTED_PLAN_MODELS = frozenset({"box 610", "cloudlink box 610", "cloudlinc box 610"})
BOX610_CONTRACT = {
    "contract_id": CONTRACT_ID,
    "contract_model": CONTRACT_MODEL,
    "plan_models": SUPPORTED_PLAN_MODELS,
    "evidence_status": "confirmed_user_validation",
    "evidence_label": "Huawei Box 610 exact pre-auth model and compatible v1 resource markers found",
}


def poll_huawei_box610_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_huawei_310_family_device(device, credentials, BOX610_CONTRACT, options)
