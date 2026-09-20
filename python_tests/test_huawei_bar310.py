from __future__ import annotations

import json
import ssl
import unittest

from mvp_runtime.adapters.huawei_bar310 import (
    BAR310_RESOURCE_PATHS,
    Bar310TransportError,
    poll_huawei_bar310_device,
)


MAIN_BUNDLE = " ".join([
    "/v1/login/device",
    "/v1/login/session",
    "/v1/login/account",
    "/action.cgi?ActionID=WEB_ChangeSessionID",
    "X-Access-Token",
    *BAR310_RESOURCE_PATHS.values(),
])


def envelope(data=None, success=1, error_id=None):
    payload = {"success": success, "data": json.dumps(data or {})}
    if error_id is not None:
        payload["error"] = {"id": error_id, "params": []}
    return {"status_code": 200, "headers": [], "body": json.dumps(payload)}


def synthetic_resources(model="Bar 310", identity=True):
    return {
        "/v1/om/version": {
            "terminalType": model,
            "SN": "SYNTHETIC-SERIAL" if identity else "",
            "ESN": "SYNTHETIC-ESN" if identity else "",
            "softVersion": "SYNTHETIC-VERSION",
            "hardVersion": "SYNTHETIC-HARDWARE",
            "logicVersion": "SYNTHETIC-LOGIC",
            "cameraVersion": [],
            "micVersion": [],
            "licenseStatus": 1,
            "licenseDeadLine": "",
        },
        "/v1/om/version/specification": {
            "ESN": "SYNTHETIC-ESN" if identity else "",
            "wanMac": "00:00:00:00:00:31" if identity else "",
            "lanMac": "",
            "apMac": "00:00:00:00:00:32" if identity else "",
            "staMac": "00:00:00:00:00:33" if identity else "",
            "runMinute": 15,
            "runHour": 4,
            "runDay": 2,
            "isRevoke": 2,
        },
        "/v1/om/config/systemtime": {
            "year": 2026,
            "month": 9,
            "day": 19,
            "hour": 12,
            "minute": 30,
            "second": 45,
            "daylight": 0,
            "isDst": 0,
        },
        "/v1/om/license": {
            "terminalType": 24,
            "customerType": 0,
            "maxBandwidth": 0,
            "maxCodec": 11,
            "maxResolve": 11,
            "supportSvc": 0,
            "supportWifi": 1,
            "support3G": 0,
            "supportPstn": 0,
            "supportRecording": 0,
            "supportEncrypted": 1,
            "licenseRemainDays": -1,
            "licenseStatus": 1,
        },
        "/v1/om/device/status": {"isSleep": 0},
    }


class HuaweiBar310Tests(unittest.TestCase):
    def success_request(self, calls, *, accepted_user="good-user", model="Bar 310", identity=True, overrides=None, logout_error=None):
        resources = synthetic_resources(model, identity)
        overrides = overrides or {}

        def request(options):
            calls.append(options)
            path = options["path"]
            if path in overrides:
                value = overrides[path]
                if isinstance(value, BaseException):
                    raise value
                return value
            if path == "/":
                return {"status_code": 200, "headers": [], "body": '<script src="/static/js/main.synthetic.chunk.js"></script>'}
            if path == "/static/js/main.synthetic.chunk.js":
                return {"status_code": 200, "headers": [], "body": MAIN_BUNDLE}
            if path == "/v1/login/device":
                return envelope({"terminalType": 1, "isSupportBra": 0, "licenseEquipName": model})
            if path == "/v1/login/session" and options["method"] == "POST":
                response = envelope({"deviceType": "Bar 310 for Synthetic Cloud"})
                response["headers"] = [("Set-Cookie", "BarSession=synthetic-cookie; Secure; HttpOnly")]
                return response
            if path == "/v1/login/account":
                payload = json.loads(options["body"])
                if payload["account"] == accepted_user:
                    return envelope({"acCSRFToken": "SYNTHETIC-ACCESS-TOKEN", "isNeedModifyPassword": 0})
                return envelope({}, success=0, error_id=1001)
            if path == "/action.cgi?ActionID=WEB_ChangeSessionID":
                return envelope({})
            if path == "/v1/login/session" and options["method"] == "DELETE":
                if logout_error:
                    raise logout_error
                return envelope({})
            return envelope(resources[path])

        return request

    def test_browser_flow_order_headers_projection_and_redaction(self):
        calls = []
        result = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "bad-user", "password": "BAD-SYNTHETIC"}, {"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls), "now": lambda: 1_700_000_000.0},
        )

        self.assertTrue(result["ok"])
        self.assertEqual(result["credentialAttempts"], 2)
        self.assertEqual(result["loginAttempts"], [{"attempt": 1, "ok": False}, {"attempt": 2, "ok": True}])
        self.assertEqual([item["path"] for item in calls[:6]], [
            "/", "/static/js/main.synthetic.chunk.js", "/v1/login/device",
            "/v1/login/session", "/v1/login/account", "/v1/login/account",
        ])
        self.assertEqual([item["path"] for item in calls[7:12]], list(BAR310_RESOURCE_PATHS.values()))
        self.assertEqual(calls[-1]["method"], "DELETE")
        self.assertTrue(all(item["headers"].get("X-Access-Token") == "SYNTHETIC-ACCESS-TOKEN" for item in calls[6:]))
        self.assertTrue(all(item["headers"].get("Cookie") == "BarSession=synthetic-cookie" for item in calls[4:]))
        self.assertTrue(all(item["reject_unauthorized"] is False for item in calls))
        self.assertEqual(result["webBlocks"]["Device Info"]["Model"], "Bar 310")
        self.assertEqual(result["webBlocks"]["Device Status"]["Uptime Seconds"], 188100)
        self.assertEqual(result["webBlocks"]["LAN Settings"]["MAC Address"], "00:00:00:00:00:31")
        encoded = json.dumps(result)
        for secret in ("BAD-SYNTHETIC", "GOOD-SYNTHETIC", "bad-user", "good-user", "SYNTHETIC-ACCESS-TOKEN", "synthetic-cookie"):
            self.assertNotIn(secret, encoded)
        self.assertTrue(all(item["method"] == "GET" for item in calls[7:12]))

    def test_preauth_model_or_bundle_mismatch_blocks_credentials(self):
        for overrides, model, expected in (
            ({"/static/js/main.synthetic.chunk.js": {"status_code": 200, "headers": [], "body": "/v1/login/device"}}, "Bar 310", "unsupported_web_contract"),
            ({}, "Bar 210", "target_model_mismatch"),
        ):
            calls = []
            result = poll_huawei_bar310_device(
                {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {"request": self.success_request(calls, model=model, overrides=overrides)},
            )
            self.assertFalse(result["ok"])
            self.assertEqual(result["safeError"], expected)
            self.assertFalse(any(item["path"] == "/v1/login/account" for item in calls))

    def test_all_credentials_rejected_in_row_order(self):
        calls = []
        result = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "CloudLink Bar 310", "allowInsecureTls": True},
            [{"username": "first", "password": "ONE"}, {"username": "second", "password": "TWO"}],
            {"request": self.success_request(calls, accepted_user="nobody")},
        )
        self.assertEqual(result["failedStage"], "authorization")
        self.assertEqual(result["safeError"], "authorization_failed")
        account_calls = [json.loads(item["body"])["account"] for item in calls if item["path"] == "/v1/login/account"]
        self.assertEqual(account_calls, ["first", "second"])
        self.assertNotIn("first", json.dumps(result))
        self.assertEqual(calls[-1]["method"], "DELETE")

    def test_postauth_model_and_identity_drift_fail_closed(self):
        for model, identity in (("Bar 210", True), ("Bar 310", False)):
            calls = []
            result = poll_huawei_bar310_device(
                {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {"request": self.success_request(calls, model=model, identity=identity)},
            )
            if model != "Bar 310":
                self.assertEqual(result["safeError"], "target_model_mismatch")
                self.assertFalse(any(item["path"] == "/v1/login/account" for item in calls))
            else:
                self.assertEqual(result["safeError"], "resource_schema_unconfirmed")
                self.assertEqual(calls[-1]["method"], "DELETE")

    def test_transport_schema_and_logout_failures_are_safe(self):
        cases = (
            (Bar310TransportError("response_too_large"), "response_too_large"),
            (TimeoutError(), "request_timeout"),
            (ssl.SSLError("synthetic"), "tls_handshake_failed"),
        )
        for error, expected in cases:
            result = poll_huawei_bar310_device(
                {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {"request": self.success_request([], overrides={"/": error})},
            )
            self.assertEqual(result["safeError"], expected)

        calls = []
        result = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls, logout_error=TimeoutError())},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["diagnostics"]["logoutError"], "request_timeout")


if __name__ == "__main__":
    unittest.main()
