from __future__ import annotations

import json
import unittest

from mvp_runtime.adapters.huawei_bar310 import BAR310_RESOURCE_PATHS
from mvp_runtime.adapters.huawei_box310 import poll_huawei_box310_device
from mvp_runtime.adapters.huawei_box610 import poll_huawei_box610_device


MAIN_BUNDLE = " ".join([
    "/v1/login/device", "/v1/login/session", "/v1/login/account",
    "action.cgi?ActionID=WEB_ChangeSessionID", "X-Access-Token",
    *BAR310_RESOURCE_PATHS.values(),
])


def envelope(data=None, success=1):
    return {"status_code": 200, "headers": [], "body": json.dumps({"success": success, "data": json.dumps(data or {})})}


def resources(model: str):
    return {
        "/v1/om/version": {"terminalType": model, "SN": f"SYNTHETIC-{model}", "softVersion": "SYNTHETIC-VERSION"},
        "/v1/om/version/specification": {
            "ESN": f"SYNTHETIC-{model}", "wanMac": "02:00:00:00:03:10",
            "runMinute": 3, "runHour": 2, "runDay": 1,
        },
        "/v1/om/config/systemtime": {
            "year": 2026, "month": 9, "day": 20, "hour": 10, "minute": 20, "second": 30,
            "daylight": 0, "isDst": 0,
        },
        "/v1/om/license": {"terminalType": 1, "maxBandwidth": 8, "licenseStatus": 1},
        "/v1/om/device/status": {"isSleep": 0},
    }


def family_request(calls, model: str):
    payloads = resources(model)

    def request(options):
        calls.append(options)
        path = options["path"]
        if path == "/":
            return {"status_code": 200, "headers": [], "body": '<script src="/static/js/main.synthetic.chunk.js"></script>'}
        if path == "/static/js/main.synthetic.chunk.js":
            return {"status_code": 200, "headers": [], "body": MAIN_BUNDLE}
        if path == "/v1/login/device":
            return envelope({"licenseEquipName": model})
        if path == "/v1/login/session" and options["method"] == "POST":
            result = envelope({})
            result["headers"] = [("Set-Cookie", "FamilySession=synthetic; Secure; HttpOnly")]
            return result
        if path == "/v1/login/account":
            return envelope({"acCSRFToken": "SYNTHETIC-TOKEN"})
        if path == "/action.cgi?ActionID=WEB_ChangeSessionID":
            return envelope({})
        if path == "/v1/login/session" and options["method"] == "DELETE":
            return envelope({})
        return envelope(payloads[path])

    return request


class HuaweiBoxContractTests(unittest.TestCase):
    def test_box_contracts_are_separate_and_provisional(self):
        cases = (
            (poll_huawei_box310_device, "CloudLink Box 310", "Box 310", "huawei-box310-rest-v1"),
            (poll_huawei_box610_device, "CloudLink Box 610", "Box 610", "huawei-box610-rest-v1"),
        )
        for poll, planned_model, device_model, contract in cases:
            calls = []
            result = poll(
                {"ip": "192.0.2.31", "model": planned_model, "allowInsecureTls": True},
                [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                {"request": family_request(calls, device_model)},
            )
            self.assertTrue(result["ok"])
            self.assertEqual(result["vendorPolling"]["contract"], contract)
            self.assertEqual(result["vendorPolling"]["model"], device_model)
            self.assertEqual(result["vendorPolling"]["evidenceStatus"], "provisional_user_validation")
            self.assertEqual(result["webBlocks"]["Device Info"]["Model"], device_model)
            encoded = json.dumps(result)
            self.assertNotIn("SYNTHETIC-PASSWORD", encoded)
            self.assertNotIn("SYNTHETIC-TOKEN", encoded)

    def test_cross_model_targets_stop_before_credentials(self):
        for poll, planned_model, actual_model in (
            (poll_huawei_box310_device, "Box 310", "Box 610"),
            (poll_huawei_box610_device, "Box 610", "Bar 310"),
        ):
            calls = []
            result = poll(
                {"ip": "192.0.2.31", "model": planned_model, "allowInsecureTls": True},
                [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                {"request": family_request(calls, actual_model)},
            )
            self.assertFalse(result["ok"])
            self.assertEqual(result["safeError"], "target_model_mismatch")
            self.assertFalse(any(item["path"] == "/v1/login/account" for item in calls))


if __name__ == "__main__":
    unittest.main()
