from __future__ import annotations

import json
import ssl
import unittest

from mvp_runtime.adapters.huawei_te40 import HuaweiTransportError, build_web_blocks, poll_huawei_te40_device
from mvp_runtime.redaction import sanitize_result


LOGIN_MARKERS = "WEB_GetLoginInfo Web_RequestSessionID Web_RequestCertificate WEB_ChangeSessionID"
RESOURCE_MARKERS = "WEB_GetProductEsnAPI WEB_GetSystemMacAddrAPI WEB_GetVersionInfoAPI WEB_GetTermSpecsInfoAPI WEB_GetSysLocalTimeAPI WEB_GetDhcpIPInfoAPI"


def envelope(data=None, success=1, exception_id=None):
    payload = {"success": success, "data": json.dumps(data or {})}
    if exception_id is not None:
        payload["exception"] = {"id": exception_id}
    return {"status_code": 200, "headers": [], "body": json.dumps(payload)}


def synthetic_resources():
    return {
        "WEB_GetProductEsnAPI": {"product_esn": "SYNTHETIC-ESN"},
        "WEB_GetSystemMacAddrAPI": {"system_wanMAC_addr": "00:00:00:00:00:01", "system_lanMAC_addr": "00:00:00:00:00:02"},
        "WEB_GetVersionInfoAPI": {"model": "TE40", "softVersion": "V1", "hardVersion": "H1", "logicVersion": "L1", "micVersion": [], "inCamVersion": "C1"},
        "WEB_GetTermSpecsInfoAPI": {"audioProtocol": "SYNTHETIC", "videoProtocol": "SYNTHETIC", "ipSpeed": 1024, "maxEnc": 1, "maxDec": 1},
        "WEB_GetSysLocalTimeAPI": {"year": 2026, "month": 9, "day": 3, "hour": 12, "minute": 0, "second": 1, "daylight": 0, "isDst": 0},
        "WEB_GetDhcpIPInfoAPI": {"IPv4DhcpAddr": "192.0.2.40", "IPv4DhcpNetMask": "255.255.255.0", "IPv4DhcpGaweWay": "192.0.2.1"},
    }


class HuaweiTe40Tests(unittest.TestCase):
    def success_request(self, calls, overrides=None):
        resources = synthetic_resources()
        overrides = overrides or {}

        def request(options):
            calls.append(options)
            path = options["path"]
            if path in overrides:
                override = overrides[path]
                if isinstance(override, BaseException):
                    raise override
                return override
            if path == "/":
                return {"status_code": 200, "headers": [("Set-Cookie", "HuaweiSession=synthetic; Secure; HttpOnly")], "body": "index"}
            if path in {"/index.html", "/hidden_frame.html", "/login.html"}:
                return {"status_code": 200, "headers": [], "body": "synthetic"}
            if path == "/system/login/login.js":
                return {"status_code": 200, "headers": [], "body": LOGIN_MARKERS}
            if path == "/system/web_all.js":
                return {"status_code": 200, "headers": [], "body": RESOURCE_MARKERS}
            action = path.split("ActionID=", 1)[1].split("?rmd=", 1)[0]
            if action == "WEB_GetLoginInfo":
                return envelope({"AlreadyLogin": 0, "szTermType": "TE40"})
            if action == "Web_RequestSessionID":
                return envelope({"acSessionId": ""})
            if action == "Web_RequestCertificate":
                return envelope({"acCSRFToken": "SYNTHETIC-CSRF"})
            if action == "WEB_ChangeSessionID":
                return envelope({"acSessionId": ""})
            return envelope(resources[action])

        return request

    def test_browser_compatible_login_cookie_csrf_and_resource_order(self):
        calls = []
        result = poll_huawei_te40_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(calls), "now": lambda: 1_700_000_000.0, "nonce": lambda: "0.25"},
        )
        self.assertTrue(result["ok"])
        paths = [item["path"] for item in calls]
        self.assertEqual(paths[:5], ["/", "/index.html", "/hidden_frame.html", "/login.html", "/system/login/login.js"])
        self.assertIn("ActionID=WEB_GetLoginInfo?rmd=0.25", paths[5])
        self.assertIn("ActionID=Web_RequestCertificate?rmd=0.25", paths[7])
        self.assertEqual(paths[9], "/system/web_all.js")
        resource_calls = calls[10:]
        self.assertEqual(len(resource_calls), 6)
        self.assertTrue(all(json.loads(item["body"])["acCSRFToken"] == "SYNTHETIC-CSRF" for item in resource_calls))
        self.assertTrue(all(item["headers"].get("Cookie") == "HuaweiSession=synthetic" for item in calls[5:]))
        self.assertTrue(all(item["reject_unauthorized"] is False for item in calls))
        self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))
        self.assertNotIn("SYNTHETIC-CSRF", json.dumps(result))

    def test_projection_contains_confirmed_identity_firmware_time_network_and_capabilities(self):
        blocks = build_web_blocks(synthetic_resources(), "192.0.2.40")
        self.assertEqual(blocks["Device Info"]["Model"], "TE40")
        self.assertEqual(blocks["Device Info"]["Serial Number"], "SYNTHETIC-ESN")
        self.assertEqual(blocks["Firmware"]["Version"], "V1")
        self.assertEqual(blocks["LAN Settings"]["WAN MAC Address"], "00:00:00:00:00:01")
        self.assertEqual(blocks["LAN Settings"]["IP Address"], "192.0.2.40")
        self.assertEqual(blocks["Device Status"]["Date"], "2026-09-03")
        self.assertEqual(blocks["Device Status"]["Time"], "12:00:01")
        self.assertEqual(blocks["Capabilities"]["IP Speed"], 1024)

    def test_version_family_marker_accepts_explicit_te40_token(self):
        calls = []
        resources = synthetic_resources()
        resources["WEB_GetVersionInfoAPI"]["model"] = "TE40 / TE50 family"

        def request(options):
            base = self.success_request(calls)
            if "ActionID=WEB_GetVersionInfoAPI" in options["path"]:
                calls.append(options)
                return envelope(resources["WEB_GetVersionInfoAPI"])
            return base(options)

        result = poll_huawei_te40_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": request},
        )
        self.assertTrue(result["ok"])

    def test_auth_failure_active_session_and_unknown_bundle_are_safe(self):
        calls = []
        bad_certificate = envelope({}, success=0, exception_id=3)
        request = self.success_request(calls)

        def auth_fail(options):
            if "ActionID=Web_RequestCertificate" in options["path"]:
                calls.append(options)
                return bad_certificate
            return request(options)

        result = poll_huawei_te40_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": auth_fail},
        )
        self.assertEqual(result["safeError"], "authorization_failed")
        self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))

        active_calls = []
        active = self.success_request(active_calls, {
            "/action.cgi?ActionID=WEB_GetLoginInfo?rmd=0.5": envelope({"AlreadyLogin": 1})
        })
        active_result = poll_huawei_te40_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": active, "nonce": lambda: "0.5"},
        )
        self.assertEqual(active_result["safeError"], "interactive_session_active")
        self.assertFalse(any("WEB_Logout" in item["path"] for item in active_calls))

        unknown_calls = []
        unknown = self.success_request(unknown_calls, {"/system/login/login.js": {"status_code": 200, "headers": [], "body": "unknown"}})
        unknown_result = poll_huawei_te40_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": unknown},
        )
        self.assertEqual(unknown_result["safeError"], "unsupported_web_contract")
        self.assertFalse(any("Web_RequestCertificate" in item["path"] for item in unknown_calls))

    def test_tls_timeout_partial_schema_and_redaction(self):
        for error, expected in (
            (ssl.SSLCertVerificationError("synthetic"), "tls_certificate_rejected"),
            (ssl.SSLError("synthetic"), "tls_handshake_failed"),
            (TimeoutError("synthetic"), "request_timeout"),
            (HuaweiTransportError("response_too_large"), "response_too_large"),
        ):
            result = poll_huawei_te40_device(
                {"ip": "192.0.2.40", "model": "TE40"},
                [{"username": "u", "password": "p"}],
                {"request": lambda _options, current=error: (_ for _ in ()).throw(current)},
            )
            self.assertEqual(result["safeError"], expected)

        calls = []
        malformed = self.success_request(calls, {
            "/action.cgi?ActionID=WEB_GetProductEsnAPI?rmd=0.5": {"status_code": 200, "headers": [], "body": "not-json"}
        })
        result = poll_huawei_te40_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "secret-user", "password": "SECRET-PASSWORD"}],
            {"request": malformed, "nonce": lambda: "0.5"},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["diagnostics"]["resourceErrors"]["productEsn"], "resource_envelope_invalid")
        cleaned = sanitize_result({**result, "cookie": "secret", "token": "secret"})
        serialized = json.dumps(cleaned)
        self.assertNotIn("secret-user", serialized)
        self.assertNotIn("SECRET-PASSWORD", serialized)
        self.assertNotIn("cookie", serialized.casefold())
        self.assertNotIn("token", serialized.casefold())

        drift_calls = []
        drift = self.success_request(drift_calls, {
            "/action.cgi?ActionID=WEB_GetVersionInfoAPI?rmd=0.75": envelope({"model": "UNKNOWN", "unexpected": "schema"})
        })
        drift_result = poll_huawei_te40_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": drift, "nonce": lambda: "0.75"},
        )
        self.assertEqual(drift_result["safeError"], "resource_schema_unconfirmed")


if __name__ == "__main__":
    unittest.main()
