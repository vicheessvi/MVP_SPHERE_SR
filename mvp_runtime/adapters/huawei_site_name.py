"""Optional, evidence-gated Huawei endpoint Site Name mailbox read."""

from __future__ import annotations

from typing import Any, Callable


SUBSCRIBE_ACTION = "WEB_SubscribeMailboxDataAPI"
GET_ACTION = "WEB_GetMailboxDataAPI"
GET_ACTION_ALIAS = "WEB_GetMailBoxDataAPI"


def read_site_name(bundle_text: str, action: Callable[[str, dict[str, Any] | None], tuple[dict[str, Any], Any]]) -> dict[str, Any]:
    """Do not infer Site Name from SR; read only the documented mailbox state."""
    get_action = next((name for name in (GET_ACTION, GET_ACTION_ALIAS) if name in bundle_text), None)
    if SUBSCRIBE_ACTION not in bundle_text or get_action is None:
        return {"status": "protocol_required", "value": None}
    try:
        subscribed, _ = action(SUBSCRIBE_ACTION, {"aszMailboxItems": ["sitename"]})
        if subscribed.get("success") != 1:
            return {"status": "unavailable", "value": None}
        response, data = action(get_action, None)
        state = data.get("state") if isinstance(data, dict) else None
        value = state.get("sitename") if isinstance(state, dict) else None
        if response.get("success") != 1 or not isinstance(value, str) or len(value) > 256 or any(ord(char) < 32 for char in value):
            return {"status": "unavailable", "value": None}
        return {"status": "read", "value": value, "source": "huawei_mailbox_sitename"}
    except Exception:
        return {"status": "unavailable", "value": None}
