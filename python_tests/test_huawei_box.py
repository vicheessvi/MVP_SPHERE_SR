from __future__ import annotations

import json
import unittest

from mvp_runtime.adapters.huawei_bar310 import BAR310_RESOURCE_PATHS, DISABLE_INSECURE_SERVICES_ACTION, MANAGEMENT_BUNDLE_MARKERS
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


def family_request(calls, model: str, *, management=False, http_value=1, verified_http_value=0, bundle_override=None):
    payloads = resources(model)
    configuration = {"enable_http": http_value}

    def request(options):
        calls.append(options)
        path = options["path"]
        if path == "/":
            return {"status_code": 200, "headers": [], "body": '<script src="/static/js/main.synthetic.chunk.js"></script>'}
        if path == "/static/js/main.synthetic.chunk.js":
            return {"status_code": 200, "headers": [], "body": bundle_override if bundle_override is not None else MAIN_BUNDLE + (" " + " ".join(MANAGEMENT_BUNDLE_MARKERS) if management else "")}
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
        if path == "/v1/om/config" and options["method"] == "POST":
            requested = json.loads(options["body"])["CfgIDString"]
            if requested != ["enable_http"]:
                raise AssertionError("Telnet configuration must not be requested")
            return envelope({"enable_http": configuration["enable_http"]})
        if path == "/v1/om/config" and options["method"] == "PUT":
            payload = json.loads(options["body"])
            if payload != {"CfgItemInt": [{"CfgItemID": "enable_http", "CfgItemInfo": 0}], "CfgItemString": []}:
                raise AssertionError("Only the confirmed HTTP setting may be written")
            configuration["enable_http"] = verified_http_value
            return envelope({})
        return envelope(payloads[path])

    return request


class HuaweiBoxContractTests(unittest.TestCase):
    MANAGEMENT_CASES = (
        (poll_huawei_box310_device, "Box 310", "huawei-box310-rest-v1"),
        (poll_huawei_box610_device, "Box 610", "huawei-box610-rest-v1"),
    )

    def test_box310_and_box610_read_site_name_when_bundle_confirms_mailbox(self):
        for poll, model, _contract_id in self.MANAGEMENT_CASES:
            with self.subTest(model=model):
                calls = []
                original = family_request(calls, model,
                    bundle_override=MAIN_BUNDLE + " WEB_SubscribeMailboxDataAPI WEB_GetMailboxDataAPI")

                def request(options):
                    if options["path"] == "/action.cgi?ActionID=WEB_SubscribeMailboxDataAPI":
                        calls.append(options)
                        return envelope({})
                    if options["path"] == "/action.cgi?ActionID=WEB_GetMailboxDataAPI":
                        calls.append(options)
                        return envelope({"state": {"sitename": "Synthetic Box Site"}})
                    return original(options)

                result = poll(
                    {"ip": "192.0.2.31", "model": model, "allowInsecureTls": True},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                    {"request": request},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["siteName"]["value"], "Synthetic Box Site")
                self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], "Synthetic Box Site")
                self.assertFalse(any(call["method"] == "PUT" for call in calls))

    def test_box_http_only_action_writes_once_and_verifies_without_telnet(self):
        for poll, model, contract_id in self.MANAGEMENT_CASES:
            with self.subTest(model=model):
                calls = []
                result = poll(
                    {"ip": "192.0.2.31", "model": model, "allowInsecureTls": True},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                    {"request": family_request(calls, model, management=True), "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION], "management_settle": lambda: None},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["vendorPolling"]["contract"], contract_id)
                action = result["managementActions"][0]
                self.assertEqual(action["status"], "applied")
                self.assertEqual(action["validationStatus"], "provisional_user_validation")
                self.assertEqual(action["before"], {"httpPort80": "enabled", "telnetPort23": "not_exposed"})
                self.assertEqual(action["after"], {"httpPort80": "disabled", "telnetPort23": "not_exposed"})
                writes = [call for call in calls if call["method"] == "PUT"]
                self.assertEqual(len(writes), 1)
                reads = [json.loads(call["body"])["CfgIDString"] for call in calls if call["path"] == "/v1/om/config" and call["method"] == "POST"]
                self.assertEqual(reads, [["enable_http"], ["enable_http"]])
                self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))
                self.assertNotIn("SYNTHETIC-TOKEN", json.dumps(result))

    def test_box_http_only_action_is_idempotent_and_opt_in(self):
        for poll, model, _contract_id in self.MANAGEMENT_CASES:
            with self.subTest(model=model):
                compliant_calls = []
                compliant = poll({"ip": "192.0.2.31", "model": model, "allowInsecureTls": True}, [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}], {"request": family_request(compliant_calls, model, management=True, http_value=0), "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION]})
                self.assertEqual(compliant["managementActions"][0]["status"], "already_compliant")
                self.assertFalse(any(call["method"] == "PUT" for call in compliant_calls))
                ordinary_calls = []
                ordinary = poll({"ip": "192.0.2.31", "model": model, "allowInsecureTls": True}, [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}], {"request": family_request(ordinary_calls, model, management=True)})
                self.assertTrue(ordinary["ok"])
                self.assertNotIn("managementActions", ordinary)
                self.assertFalse(any(call["path"] == "/v1/om/config" for call in ordinary_calls))

    def test_box_http_only_action_fails_closed_on_contract_or_verification_drift(self):
        for poll, model, _contract_id in self.MANAGEMENT_CASES:
            for scenario, http_value, verified, expected in (
                ("missing_marker", 1, 0, "management_contract_unconfirmed"),
                ("unknown_value", 2, 0, "configuration_schema_unconfirmed"),
                ("post_read", 1, 1, "configuration_verification_failed"),
            ):
                with self.subTest(model=model, scenario=scenario):
                    calls = []
                    bundle = MAIN_BUNDLE + " " + " ".join(MANAGEMENT_BUNDLE_MARKERS)
                    if scenario == "missing_marker":
                        bundle = bundle.replace("enable_http", "missing-http-marker")
                    result = poll({"ip": "192.0.2.31", "model": model, "allowInsecureTls": True}, [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}], {"request": family_request(calls, model, management=True, http_value=http_value, verified_http_value=verified, bundle_override=bundle), "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION], "management_settle": lambda: None})
                    self.assertFalse(result["ok"])
                    self.assertEqual(result["safeError"], expected)
                    self.assertEqual(sum(call["method"] == "PUT" for call in calls), 1 if scenario == "post_read" else 0)

    def test_box_contracts_are_separate_and_confirmed(self):
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
            self.assertEqual(result["vendorPolling"]["evidenceStatus"], "confirmed_user_validation")
            self.assertEqual(result["webBlocks"]["Device Info"]["Model"], device_model)
            self.assertEqual(result["siteName"], {"status": "protocol_required", "value": None})
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
