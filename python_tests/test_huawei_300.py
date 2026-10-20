from __future__ import annotations

import json
import ssl
import unittest

from mvp_runtime.adapters.huawei_300 import (
    poll_huawei_bar300_device,
    poll_huawei_box300_device,
    poll_huawei_box600_device,
)


MODEL_CASES = (
    (poll_huawei_bar300_device, "Bar 300", 18, "huawei-bar300-web-cgi-v1"),
    (poll_huawei_box300_device, "Box 300", 19, "huawei-box300-web-cgi-v1"),
    (poll_huawei_box600_device, "Box 600", 22, "huawei-box600-web-cgi-v1"),
)


def envelope(data=None, success=1):
    return {"status_code": 200, "headers": [], "body": json.dumps({"success": success, "data": json.dumps(data if data is not None else {})})}


def current_bundle() -> str:
    markers = (
        "WEB_GetLoginInfo", "Web_RequestSessionID", "Web_RequestCertificate", "WEB_ChangeSessionID",
        "WEB_GetProductEsnAPI", "WEB_GetSystemMacAddrAPI", "WEB_GetVersionInfoAPI",
        "WEB_GetTermSpecsInfoAPI", "WEB_GetSysLocalTimeAPI", "WEB_GetDhcpIPInfoAPI",
        "WEB_GetCfgParamAPI", "getSiteNameConfigs", 'CfgIDString:["sitename"]', "UI_TERM_BAR300:18",
        "UI_TERM_BOX300:19", "UI_TERM_BOX600:22",
    )
    return " ".join(markers)


def fake_request(calls, model="Bar 300", code=18, *, bundle=None, site_name="Synthetic Site", postauth_model=None, timeout_action=None, certificate_success=True, root_error=None):
    def request(options):
        calls.append(options)
        path = options["path"]
        if path == "/":
            if root_error:
                raise root_error
            return {"status_code": 200, "headers": [("Set-Cookie", "SyntheticSession=synthetic; HttpOnly; Secure")], "body": '<script src="/static/js/main.chunk.js"></script>'}
        if path == "/static/js/main.chunk.js":
            return {"status_code": 200, "headers": [], "body": current_bundle() if bundle is None else bundle}
        action = path.split("ActionID=", 1)[1]
        if action == timeout_action:
            raise TimeoutError("synthetic timeout")
        if action == "WEB_GetLoginInfo":
            return envelope({"AlreadyLogin": 0, "ucTerType": code, "ucCustomType": 0, "acCSRFToken": ""})
        if action == "Web_RequestSessionID":
            return envelope({"acSessionId": ""})
        if action == "Web_RequestCertificate":
            return envelope({"acCSRFToken": "SYNTHETIC-CSRF"}) if certificate_success else envelope({}, success=0)
        if action == "WEB_ChangeSessionID":
            return envelope({})
        if action == "WEB_GetVersionInfoAPI":
            return envelope({"model": postauth_model or model, "softVersion": "V1", "hardVersion": "H1", "logicVersion": "L1", "micVersion": [], "inCamVersion": "C1"})
        if action == "WEB_GetProductEsnAPI":
            return envelope({"product_esn": "SYNTHETIC-ESN"})
        if action == "WEB_GetSystemMacAddrAPI":
            return envelope({"system_wanMAC_addr": "02:00:00:00:03:00", "system_lanMAC_addr": "02:00:00:00:03:01", "system_poeMAC_addr": "02:00:00:00:03:02"})
        if action == "WEB_GetTermSpecsInfoAPI":
            return envelope({"audioProtocol": "synthetic", "videoProtocol": "synthetic", "ipSpeed": 1024, "maxEnc": 1})
        if action == "WEB_GetSysLocalTimeAPI":
            return envelope({"year": 2026, "month": 10, "day": 20, "hour": 10, "minute": 0, "second": 1})
        if action == "WEB_GetDhcpIPInfoAPI":
            return envelope({"IPv4DhcpAddr": "192.0.2.31", "IPv4DhcpNetMask": "255.255.255.0", "IPv4DhcpGaweWay": "192.0.2.1"})
        if action == "WEB_GetCfgParamAPI":
            payload = json.loads(options["body"])
            if payload.get("CfgIDString") != ["sitename"]:
                raise AssertionError("Site name read must request only sitename")
            return envelope({"sitename": site_name})
        if action == "WEB_Logout":
            return envelope({})
        raise AssertionError("Unexpected CGI action")
    return request


class Huawei300Tests(unittest.TestCase):
    def test_bar300_live_shape_and_site_name(self):
        calls = []
        result = poll_huawei_bar300_device(
            {"ip": "192.0.2.31", "model": "CloudLink Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls), "allow_insecure_tls": True},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["vendorPolling"]["contract"], "huawei-bar300-web-cgi-v1")
        self.assertEqual(result["siteName"]["value"], "Synthetic Site")
        self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], "Synthetic Site")
        self.assertEqual(result["webBlocks"]["LAN Settings"]["POE MAC Address"], "02:00:00:00:03:02")
        self.assertTrue(all(call["method"] in {"GET", "POST"} for call in calls))
        self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))
        self.assertNotIn("SYNTHETIC-CSRF", json.dumps(result))

    def test_box_models_use_separate_exact_identity_gates(self):
        for poll, model, code, contract in MODEL_CASES[1:]:
            with self.subTest(model=model):
                calls = []
                result = poll({"ip": "192.0.2.31", "model": f"CloudLink {model}"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, model=model, code=code), "allow_insecure_tls": True})
                self.assertTrue(result["ok"])
                self.assertEqual(result["vendorPolling"]["contract"], contract)
                self.assertEqual(result["vendorPolling"]["validationStatus"], "confirmed_user_validation")
                self.assertEqual(result["siteName"]["value"], "Synthetic Site")

    def test_wrong_model_and_bundle_fail_before_credentials(self):
        for poll, model, code, _contract in MODEL_CASES:
            with self.subTest(model=model):
                calls = []
                result = poll({"ip": "192.0.2.31", "model": f"CloudLink {model}"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, model=model, code=18 if code != 18 else 19), "allow_insecure_tls": True})
                self.assertFalse(result["ok"])
                self.assertFalse(any("Web_RequestCertificate" in call["path"] for call in calls))
                calls.clear()
                result = poll({"ip": "192.0.2.31", "model": f"CloudLink {model}"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, model=model, code=code, bundle=current_bundle().replace(f"UI_TERM_{model.upper().replace(' ', '')}:{code}", "")), "allow_insecure_tls": True})
                self.assertFalse(result["ok"])
                self.assertFalse(any("Web_RequestCertificate" in call["path"] for call in calls))

    def test_postauth_drift_invalid_site_and_timeout_are_safe(self):
        calls = []
        result = poll_huawei_bar300_device({"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, postauth_model="Box 300"), "allow_insecure_tls": True})
        self.assertFalse(result["ok"])
        calls.clear()
        result = poll_huawei_bar300_device({"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, site_name=42), "allow_insecure_tls": True})
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"]["status"], "unavailable")
        calls.clear()
        result = poll_huawei_bar300_device({"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, timeout_action="Web_RequestCertificate"), "allow_insecure_tls": True})
        self.assertFalse(result["ok"])
        self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))

    def test_missing_site_marker_auth_failure_and_tls_rejection(self):
        calls = []
        result = poll_huawei_bar300_device({"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, bundle=current_bundle().replace("getSiteNameConfigs", "")), "allow_insecure_tls": True})
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"]["status"], "protocol_required")
        self.assertFalse(any("WEB_GetCfgParamAPI" in call["path"] for call in calls))
        calls.clear()
        result = poll_huawei_bar300_device({"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, certificate_success=False), "allow_insecure_tls": True})
        self.assertEqual(result["failedStage"], "authorization")
        self.assertEqual(result["safeError"], "authorization_failed")
        self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))
        calls.clear()
        result = poll_huawei_bar300_device({"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, root_error=ssl.SSLCertVerificationError("synthetic"))})
        self.assertFalse(result["ok"])
        self.assertEqual(result["safeError"], "tls_certificate_rejected")
        self.assertFalse(any("Web_RequestCertificate" in call["path"] for call in calls))


if __name__ == "__main__":
    unittest.main()
