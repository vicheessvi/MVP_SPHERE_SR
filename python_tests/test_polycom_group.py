"""Synthetic, secret-free contracts for the Polycom Group web adapter."""

from __future__ import annotations

import gzip
import json
import unittest

from mvp_runtime.adapters.polycom_group import (
    poll_polycom_group300_device,
    poll_polycom_group310_device,
    poll_polycom_group500_device,
    poll_polycom_group700_device,
)


LOGIN_BUNDLE = '/* Polycom */ url:"/rest/session",jsonData:{action:"Login",user:d,password:i};jsonData:{action:"Logout"}'
MAIN_BUNDLE = ' '.join((
    'getSystem:function(){var b=d.createAjaxOption("/rest/system","GET"',
    'url:"/rest/system/status"',
    'url:"/rest/system/time",method:"GET"',
    'url:"/rest/system/uptime";method:"GET"',
    'url:"/rest/config",generateReadJson:function(a){c={names:d}}',
    'SYSTEM_NETWORK_WIRED_ETHERNET_MACADDRESS:"system.network.wired.ethernet.macaddress"',
))
MAC_NAME = "system.network.wired.ethernet.macaddress"
SYNTHETIC_PASSWORD = "SYNTHETIC-PASSWORD-NEVER-OUTPUT"
WRAPPERS = {
    "RealPresence Group 300": poll_polycom_group300_device,
    "RealPresence Group 310": poll_polycom_group310_device,
    "RealPresence Group 500": poll_polycom_group500_device,
    "RealPresence Group 700": poll_polycom_group700_device,
}


def response(body, status=200, headers=None):
    return {"status_code": status, "headers": headers or [], "body": json.dumps(body) if isinstance(body, (dict, list, float, int)) else body}


class PolycomGroupTests(unittest.TestCase):
    def fake_request(self, calls, *, model="RealPresence Group 310", bundle=MAIN_BUNDLE, accept=True, accepted_username="synthetic-user", fail_path=None, serial="SYNTHETIC-SERIAL", mac="02:00:00:00:00:31", system_name="Synthetic Room"):
        def request(options):
            calls.append(options)
            path, method = options["path"], options["method"]
            if path == fail_path:
                raise TimeoutError("synthetic-sensitive-transport-detail")
            if method == "GET" and path == "/login.html":
                return response('<title>Polycom Login</title><script src="login.js?build=123456"></script>')
            if method == "GET" and path == "/login.js?build=123456":
                return response(LOGIN_BUNDLE)
            if method == "POST" and path == "/rest/session":
                payload = json.loads(options["body"])
                if payload["action"] == "Logout":
                    return response({"success": True})
                return response({"success": accept and payload["user"] == accepted_username, "session": "SYNTHETIC-SESSION"}, headers=[("Set-Cookie", "session_id=SYNTHETIC-COOKIE; Secure; HttpOnly")])
            if method == "GET" and path == "/index.html":
                return response('<title>Polycom</title><script src="main.js?build=123456"></script>')
            if method == "GET" and path == "/main.js?build=123456":
                return {"status_code": 200, "headers": [("Content-Encoding", "gzip")], "body": gzip.compress(bundle.encode("utf-8"))}
            if method == "GET" and path == "/rest/system":
                return response({
                    "model": model,
                    "serialNumber": serial,
                    "softwareVersion": "release - SYNTHETIC-BUILD",
                    "build": "123456",
                    "hardwareVersion": "synthetic-hardware",
                    "systemName": system_name,
                    "state": "Ready",
                    "systemTime": 1760000000000,
                    "uptime": 8000,
                    "lanStatus": {"state": "Up", "speedMbps": 1000, "duplex": "Full"},
                    "password": SYNTHETIC_PASSWORD,
                })
            if method == "GET" and path == "/rest/system/status":
                return response([{"name": "Network", "state": ["OK"], "secret": SYNTHETIC_PASSWORD}])
            if method == "GET" and path == "/rest/system/time":
                return response(1760000000000)
            if method == "GET" and path == "/rest/system/uptime":
                return response(8000.5)
            if method == "POST" and path == "/rest/config":
                self.assertEqual(json.loads(options["body"]), {"names": [MAC_NAME]})
                return response({"vars": [{"name": MAC_NAME, "value": mac, "result": "SUCCESS", "isSecure": False, "password": SYNTHETIC_PASSWORD}]})
            raise AssertionError(f"Unexpected synthetic request: {method} {path}")

        return request

    def run_poll(self, *, model="RealPresence Group 310", observed=None, **request_options):
        calls = []
        result = WRAPPERS[model](
            {"ip": "192.0.2.31", "category": "vcs", "manufacturer": "Polycom", "model": model},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": self.fake_request(calls, model=observed or model, **request_options)},
        )
        return result, calls

    def test_group310_success_is_read_only_and_redacted(self):
        result, calls = self.run_poll()
        self.assertTrue(result["ok"])
        self.assertEqual(result["webBlocks"]["Device Info"]["Model"], "RealPresence Group 310")
        self.assertEqual(result["webBlocks"]["Device Info"]["Serial Number"], "SYNTHETIC-SERIAL")
        self.assertEqual(result["webBlocks"]["Device Info"]["MAC Address"], "02:00:00:00:00:31")
        self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], "Synthetic Room")
        self.assertEqual(result["siteName"], {"status": "read", "value": "Synthetic Room", "source": "polycom_system_name"})
        self.assertEqual(result["webBlocks"]["Firmware"]["Version"], "release - SYNTHETIC-BUILD")
        self.assertEqual(result["vendorPolling"]["evidenceStatus"], "confirmed_user_validation")
        self.assertEqual(result["rawResources"]["status"], [{"name": "Network", "state": ["OK"]}])
        self.assertEqual(calls[-1]["path"], "/rest/session")
        self.assertEqual(json.loads(calls[-1]["body"]), {"action": "Logout"})
        self.assertFalse(any(call["method"] in ("PUT", "DELETE", "PATCH") for call in calls))
        self.assertNotIn(SYNTHETIC_PASSWORD, json.dumps(result))
        self.assertNotIn("SYNTHETIC-COOKIE", json.dumps(result))
        self.assertNotIn("SYNTHETIC-SESSION", json.dumps(result))
        self.assertTrue(all(call["reject_unauthorized"] for call in calls))

    def test_wrong_model_fails_before_optional_reads(self):
        result, calls = self.run_poll(observed="RealPresence Group 500")
        self.assertFalse(result["ok"])
        self.assertEqual(result["safeError"], "target_model_mismatch")
        self.assertFalse(any(call["path"] == "/rest/config" for call in calls))
        self.assertEqual(json.loads(calls[-1]["body"]), {"action": "Logout"})

    def test_changed_login_bundle_blocks_credentials(self):
        calls = []
        fake = self.fake_request(calls)

        def request(options):
            if options["path"] == "/login.js?build=123456":
                calls.append(options)
                return response("unrelated static content")
            return fake(options)

        result = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": request},
        )
        self.assertFalse(result["ok"])
        self.assertFalse(any(call["path"] == "/rest/session" for call in calls))

    def test_auth_failure_and_timeout_are_safe(self):
        rejected, calls = self.run_poll(accept=False)
        self.assertFalse(rejected["ok"])
        self.assertEqual(rejected["failedStage"], "authorization")
        self.assertNotIn(SYNTHETIC_PASSWORD, json.dumps(rejected))
        self.assertFalse(any(call["path"] == "/rest/system" for call in calls))

        timeout, _ = self.run_poll(fail_path="/rest/system")
        self.assertFalse(timeout["ok"])
        self.assertNotIn("synthetic-sensitive-transport-detail", json.dumps(timeout))

    def test_credentials_are_attempted_in_entered_order(self):
        calls = []
        result = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
            [
                {"username": "first", "password": "SYNTHETIC-FIRST"},
                {"username": "second", "password": "SYNTHETIC-SECOND"},
                {"username": "synthetic-user", "password": SYNTHETIC_PASSWORD},
            ],
            {"request": self.fake_request(calls)},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["credentialAttempts"], 3)
        names = [json.loads(call["body"])["user"] for call in calls if call["path"] == "/rest/session" and json.loads(call["body"])["action"] == "Login"]
        self.assertEqual(names, ["first", "second", "synthetic-user"])
        self.assertNotIn("SYNTHETIC-FIRST", json.dumps(result))
        self.assertNotIn("SYNTHETIC-SECOND", json.dumps(result))

    def test_other_exact_models_share_only_guarded_core(self):
        for model in ("RealPresence Group 300", "RealPresence Group 500", "RealPresence Group 700"):
            with self.subTest(model=model):
                result, _ = self.run_poll(model=model)
                self.assertTrue(result["ok"])
                self.assertEqual(result["webBlocks"]["Device Info"]["Model"], model)
                self.assertEqual(result["siteName"]["value"], result["webBlocks"]["Device Info"]["System Name"])
                expected = "provisional_user_validation" if model.endswith("300") else "confirmed_user_validation"
                self.assertEqual(result["vendorPolling"]["evidenceStatus"], expected)

    def test_missing_system_name_is_not_invented_as_site_name(self):
        result, _ = self.run_poll(system_name=None)
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"], {"status": "unavailable", "value": None, "source": "polycom_system_name"})
        self.assertNotIn("Site Name", result["webBlocks"]["Device Info"])

    def test_suffix_and_cross_model_are_rejected(self):
        result, calls = self.run_poll(model="RealPresence Group 310", observed="RealPresence Group 310-C")
        self.assertFalse(result["ok"])
        self.assertEqual(result["safeError"], "target_model_mismatch")
        self.assertFalse(any(call["path"] == "/rest/config" for call in calls))

    def test_missing_stable_identity_and_changed_main_bundle_fail_closed(self):
        no_identity, _ = self.run_poll(serial="", mac="not-a-mac")
        self.assertFalse(no_identity["ok"])
        self.assertEqual(no_identity["safeError"], "stable_identity_missing")
        drift, calls = self.run_poll(bundle="unrelated bundle")
        self.assertFalse(drift["ok"])
        self.assertEqual(drift["safeError"], "unsupported_web_contract")
        self.assertFalse(any(call["path"] == "/rest/system" for call in calls))

    def test_untrusted_certificate_requires_explicit_per_target_opt_in(self):
        calls = []
        result = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": self.fake_request(calls)},
        )
        self.assertTrue(result["ok"])
        self.assertTrue(result["webInterface"]["insecureTls"])
        self.assertTrue(all(call["reject_unauthorized"] is False for call in calls))


if __name__ == "__main__":
    unittest.main()
