"""Exact guarded Huawei Box 310 polling contract."""

from __future__ import annotations

from typing import Any

from .huawei_bar310 import DISABLE_INSECURE_SERVICES_ACTION, FAMILY_CONTRACT_ID, poll_huawei_310_family_device


CONTRACT_ID = FAMILY_CONTRACT_ID
CONTRACT_MODEL = "Box 310"
SUPPORTED_PLAN_MODELS = frozenset({"box 310", "cloudlink box 310", "cloudlinc box 310"})
BOX310_CONTRACT = {
    "contract_id": CONTRACT_ID,
    "contract_model": CONTRACT_MODEL,
    "plan_models": SUPPORTED_PLAN_MODELS,
    "evidence_status": "confirmed_user_validation",
    "evidence_label": "Huawei Box 310 exact pre-auth model and compatible v1 resource markers found",
    "management_action": DISABLE_INSECURE_SERVICES_ACTION,
    "management_validation_status": "provisional_user_validation",
    "answer_mode_validation_status": "provisional_user_validation",
    "settings_read_profile": "box310_confirmed",
}


def poll_huawei_box310_device(device: dict[str, Any], credentials: Any, options: dict[str, Any] | None = None) -> dict[str, Any]:
    return poll_huawei_310_family_device(device, credentials, BOX310_CONTRACT, options)
