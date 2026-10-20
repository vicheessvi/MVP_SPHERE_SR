from __future__ import annotations

import unittest

from mvp_runtime.adapters.huawei_site_name import GET_ACTION, GET_ACTION_ALIAS, SUBSCRIBE_ACTION, read_site_name


class HuaweiSiteNameTests(unittest.TestCase):
    def test_requires_both_current_bundle_markers(self) -> None:
        called = []
        value = read_site_name(SUBSCRIBE_ACTION, lambda *_args: called.append(True))
        self.assertEqual(value, {"status": "protocol_required", "value": None})
        self.assertFalse(called)

    def test_reads_exact_state_value_without_other_mailbox_fields(self) -> None:
        calls = []
        def action(name, payload):
            calls.append((name, payload))
            if name == SUBSCRIBE_ACTION:
                return {"success": 1}, {}
            return {"success": 1}, {"state": {"sitename": "Meeting Room", "token": "not needed"}}
        value = read_site_name(f"{SUBSCRIBE_ACTION} {GET_ACTION}", action)
        self.assertEqual(value, {"status": "read", "value": "Meeting Room", "source": "huawei_mailbox_sitename"})
        self.assertEqual(calls, [(SUBSCRIBE_ACTION, {"aszMailboxItems": ["sitename"]}), (GET_ACTION, None)])

    def test_failure_does_not_invent_site_name(self) -> None:
        marker = f"{SUBSCRIBE_ACTION} {GET_ACTION}"
        self.assertEqual(read_site_name(marker, lambda *_args: ({"success": 1}, {"state": {"sitename": 42}}))["status"], "unavailable")
        self.assertEqual(read_site_name(marker, lambda *_args: (_ for _ in ()).throw(TimeoutError()))["status"], "unavailable")

    def test_documented_mailbox_action_alias_is_selected_from_bundle(self) -> None:
        calls = []
        def action(name, _payload):
            calls.append(name)
            return ({"success": 1}, {} if name == SUBSCRIBE_ACTION else {"state": {"sitename": "Alias Site"}})
        result = read_site_name(f"{SUBSCRIBE_ACTION} {GET_ACTION_ALIAS}", action)
        self.assertEqual(result["value"], "Alias Site")
        self.assertEqual(calls, [SUBSCRIBE_ACTION, GET_ACTION_ALIAS])


if __name__ == "__main__":
    unittest.main()
