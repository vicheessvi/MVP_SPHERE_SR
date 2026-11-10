from __future__ import annotations

import json
import io
import ssl
import unittest
from unittest.mock import patch

from mvp_runtime.adapters.huawei_bar310 import (
    BAR310_RESOURCE_PATHS,
    BAR310_CONTRACT,
    Bar310TransportError,
    DISABLE_INSECURE_SERVICES_ACTION,
    FAMILY_CONTRACT_ID,
    _open_huawei_310_log_stream,
    Bar310ContractError,
    poll_huawei_bar310_device,
    poll_huawei_310_device,
    poll_huawei_310_family_device,
)
from mvp_runtime.adapters.huawei_box310 import poll_huawei_box310_device
from mvp_runtime.adapters.huawei_box610 import poll_huawei_box610_device


MAIN_BUNDLE = " ".join([
    "/v1/login/device",
    "/v1/login/session",
    "/v1/login/account",
    "/action.cgi?ActionID=WEB_ChangeSessionID",
    "X-Access-Token",
    *BAR310_RESOURCE_PATHS.values(),
    'reqGetCfgUrl="/v1/om/config"',
    'reqSaveCfgUrl="/v1/om/config"',
    "enable_http",
])
FULL_SETTINGS_BUNDLE = MAIN_BUNDLE + ' reqGetCfgUrl="/v1/om/config" CfgIDString:["sitename"] CfgIDString:["autoreply" "synSerTime","ntpServerAddr","ntpGetMode" CfgIDString:["PSWD0","SSID" CfgIDString:["enabletelnet","enable_ssh" CfgIDString:["suppotReboot","sleepTime"'
ANSWER_WRITE_BUNDLE = FULL_SETTINGS_BUNDLE + ' reqSaveCfgUrl="/v1/om/config" CfgItemID:"autoreply"'
SERVER_AUDIT_BUNDLE = MAIN_BUNDLE + ' reqTMSorEsightParamUrl="/v1/om/config/service" get("v1/om/config/auto-config" UI_CLOUDTYPE_MANUAL:255 UI_CLOUDTYPE_SMC3:0 UI_CLOUDTYPE_SMC:3'
LOG_EXPORT_BUNDLE = MAIN_BUNDLE + ' reqExportLogUrl="v1/om/log/export" a.post(a.reqExportLogUrl,null,{})'
SYNTHETIC_SETTINGS = {
    "sitename": "Synthetic site", "autoreply": 1, "synSerTime": 1, "ntpGetMode": 1,
    "ntpServerAddr": "ntp.example.test", "enableWifi": 0, "apEnable": 0,
    "isWifiPriority": 0, "enable_ssh": 1, "suppotReboot": 1, "sleepTime": 10,
    "autoReboot": 0, "sleepCloseAPP": 0, "autoRebootVal": 1, "savePowerMode": 0,
}


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
    def test_log_stream_uses_exact_export_and_rejects_unexpected_content(self):
        payload = b'<?xml version="1.0"?><LogModule><Synthetic/></LogModule>'

        class Response:
            status = 200

            def __init__(self, mime):
                self.mime = mime
                self.source = io.BytesIO(payload)

            def getheader(self, name):
                return self.mime if name == "Content-Type" else None

            def read(self, size):
                return self.source.read(size)

            def close(self):
                self.source.close()

        class Connection:
            instances = []

            def __init__(self, *args, **kwargs):
                self.calls = []
                self.response = Response("application/x-octet-stream")
                self.closed = False
                self.instances.append(self)

            def request(self, *args, **kwargs):
                self.calls.append((args, kwargs))

            def getresponse(self):
                return self.response

            def close(self):
                self.closed = True

        options = {"ip": "192.0.2.31", "headers": {"X-Access-Token": "SYNTHETIC-ACCESS-TOKEN"}, "reject_unauthorized": True}
        with patch("mvp_runtime.adapters.huawei_bar310.http.client.HTTPSConnection", Connection):
            stream = _open_huawei_310_log_stream(options)
            self.assertEqual(stream.read(9) + stream.read(65536), payload)
            stream.close()
            self.assertEqual(Connection.instances[-1].calls[0][0][:2], ("POST", "/v1/om/log/export"))
            self.assertTrue(Connection.instances[-1].closed)

            original_response = Connection.getresponse
            Connection.getresponse = lambda self: Response("text/html")
            try:
                with self.assertRaises(Bar310ContractError):
                    _open_huawei_310_log_stream(options)
                self.assertTrue(Connection.instances[-1].closed)
            finally:
                Connection.getresponse = original_response

    def test_log_export_is_gated_by_exact_model_and_bundle(self):
        fixture = b'<?xml version="1.0"?><LogModule><Synthetic/></LogModule>'
        for model in ("Bar 310", "Box 310", "Box 610"):
            with self.subTest(model=model):
                calls, opened, saved = [], [], []
                bundle = {"status_code": 200, "headers": [], "body": LOG_EXPORT_BUNDLE}

                def opener(options):
                    opened.append(options)
                    return io.BytesIO(fixture)

                def sink(stream, metadata):
                    saved.append((stream.read(65536), metadata))
                    return {"status": "saved"}

                result = poll_huawei_310_device(
                    {"ip": "192.0.2.31", "model": model, "allowInsecureTls": True},
                    [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                    {"request": self.success_request(calls, model=model, overrides={"/static/js/main.synthetic.chunk.js": bundle}),
                     "collect_logs": True, "log_opener": opener, "on_log": sink},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["logCollection"]["status"], "saved")
                self.assertEqual(result["logCollection"]["validationStatus"], "confirmed_local_validation" if model == "Bar 310" else "provisional_user_validation")
                self.assertEqual(len(opened), 1)
                self.assertEqual(opened[0]["ip"], "192.0.2.31")
                self.assertEqual(opened[0]["headers"]["X-Access-Token"], "SYNTHETIC-ACCESS-TOKEN")
                self.assertEqual(saved, [(fixture, {"ip": "192.0.2.31", "filename": "192.0.2.31.xml"})])
                self.assertNotIn("Synthetic", json.dumps(result))
                self.assertFalse(any(call["method"] == "PUT" for call in calls))

        calls, opened = [], []
        missing = poll_huawei_310_device(
            {"ip": "192.0.2.31", "model": "Bar 310"},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls), "collect_logs": True,
             "log_opener": lambda options: opened.append(options), "on_log": lambda stream, metadata: {"status": "saved"}},
        )
        self.assertEqual(missing["logCollection"], {"status": "protocol_required"})
        self.assertEqual(opened, [])

        calls.clear()
        wrong = poll_huawei_310_device(
            {"ip": "192.0.2.31", "model": "Box 310"},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls, model="Bar 310", overrides={"/static/js/main.synthetic.chunk.js": {"status_code": 200, "headers": [], "body": LOG_EXPORT_BUNDLE}}),
             "collect_logs": True, "log_opener": lambda options: opened.append(options), "on_log": lambda stream, metadata: {"status": "saved"}},
        )
        self.assertEqual(wrong["safeError"], "target_model_mismatch")
        self.assertEqual(opened, [])
        self.assertFalse(any(call["path"] == "/v1/login/account" for call in calls))

    def test_log_save_failure_does_not_fail_json_poll(self):
        calls = []
        result = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310"},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls, overrides={"/static/js/main.synthetic.chunk.js": {"status_code": 200, "headers": [], "body": LOG_EXPORT_BUNDLE}}),
             "collect_logs": True, "log_opener": lambda options: io.BytesIO(b"synthetic"),
             "on_log": lambda stream, metadata: {"status": "failed", "unsafe": "never-expose"}},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["logCollection"]["safeError"], "log_save_failed")
        self.assertNotIn("never-expose", json.dumps(result))

    def success_request(
        self,
        calls,
        *,
        accepted_user="good-user",
        model="Bar 310",
        identity=True,
        overrides=None,
        logout_error=None,
        http_value=1,
        verify_http_value=0,
        verify_answer_value=None,
        configuration_values=None,
        service_type=-1,
        auto_service_type=-1,
        server_list=None,
    ):
        resources = synthetic_resources(model, identity)
        overrides = overrides or {}
        configuration = {"enable_http": http_value, **(configuration_values or {})}

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
            if path == "/v1/om/config" and options["method"] == "POST":
                payload = json.loads(options["body"])
                fields = payload["CfgIDString"]
                if all(field in configuration for field in fields):
                    return envelope({field: configuration[field] for field in fields})
                raise AssertionError("Unconfirmed configuration field requested")
            if path == "/v1/om/config" and options["method"] == "PUT":
                payload = json.loads(options["body"])
                items = payload.get("CfgItemInt")
                if (not isinstance(items, list) or len(items) != 1 or payload.get("CfgItemString") != []
                        or set(items[0]) != {"CfgItemID", "CfgItemInfo"}):
                    raise AssertionError("Only one confirmed configuration item may be written")
                if items[0]["CfgItemID"] == "enable_http":
                    configuration["enable_http"] = verify_http_value
                elif items[0]["CfgItemID"] == "autoreply":
                    configuration["autoreply"] = items[0]["CfgItemInfo"] if verify_answer_value is None else verify_answer_value
                else:
                    raise AssertionError("Unsupported configuration write")
                return envelope({})
            if path == "/v1/login/session" and options["method"] == "DELETE":
                if logout_error:
                    raise logout_error
                return envelope({})
            if path == "/v1/om/config/service" and options["method"] == "GET":
                return envelope({"serverType": service_type, "serverList": [0, 3] if server_list is None else server_list, "serverAddress": "SYNTHETIC-INTERNAL"})
            if path == "/v1/om/config/auto-config" and options["method"] == "GET":
                return envelope({"serverType": auto_service_type, "serverAddress": "SYNTHETIC-INTERNAL"})
            return envelope(resources[path])

        return request

    def test_bar310_server_type_proves_update_capability_without_completed_update(self):
        bundle = {"status_code": 200, "headers": [], "body": SERVER_AUDIT_BUNDLE}
        for service_type, auto_service_type, expected in ((-1, -1, "disabled"), (255, -1, "disabled"), (3, -1, "enabled"), (0, -1, "enabled"), (-1, 3, "enabled"), (-1, 0, "enabled")):
            calls = []
            result = poll_huawei_bar310_device(
                {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {"request": self.success_request(calls, overrides={"/static/js/main.synthetic.chunk.js": bundle}, service_type=service_type, auto_service_type=auto_service_type)},
            )
            self.assertTrue(result["ok"])
            field = result["deviceSettings"]["fields"]["autoUpdate"]
            self.assertEqual(field["value"], expected)
            self.assertEqual(field["basis"], "server_type_audit_rule")
            self.assertEqual(field["meaning"], "firmware_update_capability")
            self.assertFalse(any(call["method"] == "PUT" for call in calls))
            self.assertNotIn("SYNTHETIC-INTERNAL", json.dumps(result))
        calls = []
        unknown = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls, overrides={"/static/js/main.synthetic.chunk.js": bundle}, service_type=42)},
        )
        self.assertEqual(unknown["deviceSettings"]["fields"]["autoUpdate"], {"status": "unavailable", "value": None})
        managed_calls = []
        managed = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(managed_calls, overrides={"/static/js/main.synthetic.chunk.js": bundle}, service_type=4, server_list=[0, 3, 4])},
        )
        self.assertEqual(managed["deviceSettings"]["fields"]["autoUpdate"]["value"], "enabled")
        self.assertFalse(any(call["method"] == "PUT" for call in managed_calls))

    def test_box310_and_box610_share_guarded_user_confirmed_settings_reader(self):
        bundle = {"status_code": 200, "headers": [], "body": FULL_SETTINGS_BUNDLE + " " + SERVER_AUDIT_BUNDLE}
        for model, poller in (("Box 310", poll_huawei_box310_device), ("Box 610", poll_huawei_box610_device)):
            calls = []
            result = poller(
                {"ip": "192.0.2.31", "model": model, "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {"request": self.success_request(calls, model=model, overrides={"/static/js/main.synthetic.chunk.js": bundle}, configuration_values=SYNTHETIC_SETTINGS)},
            )
            self.assertTrue(result["ok"])
            self.assertEqual(result["vendorPolling"]["model"], model)
            self.assertEqual(result["siteName"]["validationStatus"], "confirmed_user_validation")
            fields = result["deviceSettings"]["fields"]
            self.assertEqual(fields["autoAnswer"]["value"], "enabled")
            self.assertEqual(fields["ntp"]["value"]["mode"], "manual")
            self.assertEqual(fields["wifi"]["value"]["clientEnabled"], False)
            self.assertEqual(fields["ssh"]["value"], "enabled")
            self.assertEqual(fields["powerManagement"]["value"]["sleepTimeCode"], 10)
            self.assertEqual(fields["autoUpdate"]["meaning"], "firmware_update_capability")
            self.assertEqual(result["deviceSettings"]["validationStatus"], "confirmed_user_validation")
            self.assertTrue(all(field["validationStatus"] == "confirmed_user_validation" for key, field in fields.items() if key != "http" and field["status"] == "read"))
            self.assertNotIn("validationStatus", fields["http"])
            self.assertFalse(any(call["method"] == "PUT" for call in calls))
            self.assertNotIn("GOOD-SYNTHETIC", json.dumps(result))
            self.assertNotIn("SYNTHETIC-INTERNAL", json.dumps(result))

            wrong_calls = []
            wrong = poller(
                {"ip": "192.0.2.31", "model": model, "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {"request": self.success_request(wrong_calls, model="Bar 310", overrides={"/static/js/main.synthetic.chunk.js": bundle}, configuration_values=SYNTHETIC_SETTINGS)},
            )
            self.assertFalse(wrong["ok"])
            self.assertEqual(wrong["safeError"], "target_model_mismatch")
            self.assertFalse(any(call["path"] == "/v1/login/account" for call in wrong_calls))

    def test_box_settings_marker_drift_is_field_local(self):
        bundle = {"status_code": 200, "headers": [], "body": (FULL_SETTINGS_BUNDLE + " " + SERVER_AUDIT_BUNDLE).replace('CfgIDString:["autoreply"', "missing-answer-marker")}
        calls = []
        result = poll_huawei_box310_device(
            {"ip": "192.0.2.31", "model": "Box 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls, model="Box 310", overrides={"/static/js/main.synthetic.chunk.js": bundle}, configuration_values=SYNTHETIC_SETTINGS)},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["deviceSettings"]["fields"]["autoAnswer"], {"status": "protocol_required", "value": None})
        self.assertEqual(result["deviceSettings"]["fields"]["ntp"]["status"], "read")
        self.assertFalse(any(json.loads(call["body"]).get("CfgIDString") == ["autoreply"] for call in calls if call["path"] == "/v1/om/config" and call["method"] == "POST"))

    def test_one_family_dispatcher_preserves_exact_model_and_contract(self):
        for model in ("Bar 310", "Box 310", "Box 610"):
            calls = []
            result = poll_huawei_310_device(
                {"ip": "192.0.2.31", "model": model, "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {"request": self.success_request(calls, model=model)},
            )
            self.assertTrue(result["ok"])
            self.assertEqual(result["vendorPolling"]["contract"], FAMILY_CONTRACT_ID)
            self.assertEqual(result["vendorPolling"]["model"], model)
            self.assertTrue(any(call["path"] == "/v1/login/account" for call in calls))
        blocked = poll_huawei_310_device(
            {"ip": "192.0.2.31", "model": "Box 610-S", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": lambda *_args: self.fail("Unknown model must not reach network")},
        )
        self.assertEqual(blocked["safeError"], "invalid_or_unsupported_target")
        self.assertEqual(blocked["credentialAttempts"], 0)
        legacy = poll_huawei_310_family_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {**BAR310_CONTRACT, "contract_id": "huawei-bar310-rest-v1"},
            {"request": lambda *_args: self.fail("Legacy contract must not create a new network route")},
        )
        self.assertEqual(legacy["safeError"], "invalid_or_unsupported_target")

    def test_bar310_reads_exact_new_settings_without_secrets_or_write(self):
        calls = []
        bundle = {"status_code": 200, "headers": [], "body": FULL_SETTINGS_BUNDLE}
        result = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls, overrides={"/static/js/main.synthetic.chunk.js": bundle}, configuration_values=SYNTHETIC_SETTINGS)},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"]["value"], "Synthetic site")
        fields = result["deviceSettings"]["fields"]
        self.assertEqual(fields["autoAnswer"]["value"], "enabled")
        self.assertEqual(fields["ntp"]["value"], {"enabled": True, "modeCode": 1, "mode": "manual", "server": "ntp.example.test"})
        self.assertEqual(fields["wifi"]["value"], {"clientEnabled": False, "accessPointEnabled": False, "preferredNetworkEnabled": False})
        self.assertEqual(fields["ssh"]["value"], "enabled")
        self.assertEqual(fields["powerManagement"]["value"]["sleepTimeCode"], 10)
        self.assertFalse(fields["powerManagement"]["value"]["clearMemoryInSleepEnabled"])
        self.assertFalse(fields["powerManagement"]["value"]["automaticRestartEnabled"])
        self.assertEqual(fields["powerManagement"]["unconfirmedFields"], ["scheduledPowerOn", "scheduledPowerOff", "clearMemoryAfterRestart"])
        self.assertEqual(fields["telnet"]["status"], "not_exposed")
        self.assertEqual(fields["autoUpdate"], {"status": "protocol_required", "value": None})
        config_reads = [json.loads(call["body"])["CfgIDString"] for call in calls if call["path"] == "/v1/om/config" and call["method"] == "POST"]
        self.assertEqual(len(config_reads), 7)
        self.assertFalse(any("PSWD0" in names or "SSID" in names for names in config_reads))
        self.assertFalse(any(call["method"] == "PUT" for call in calls))
        self.assertNotIn("GOOD-SYNTHETIC", json.dumps(result))

    def test_bar310_new_setting_schema_drift_is_field_local(self):
        calls = []
        bundle = {"status_code": 200, "headers": [], "body": FULL_SETTINGS_BUNDLE}
        bad = {**SYNTHETIC_SETTINGS, "autoreply": 0, "enable_ssh": 0, "sleepTime": 999, "ntpServerAddr": "bad\nserver"}
        result = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(calls, overrides={"/static/js/main.synthetic.chunk.js": bundle}, configuration_values=bad)},
        )
        self.assertTrue(result["ok"])
        fields = result["deviceSettings"]["fields"]
        self.assertEqual(fields["http"]["status"], "read")
        self.assertEqual(fields["autoAnswer"]["value"], "disabled")
        self.assertEqual(fields["ssh"]["status"], "unavailable")
        self.assertEqual(fields["ntp"]["status"], "unavailable")
        self.assertEqual(fields["powerManagement"]["status"], "unavailable")

    def test_huawei_310_answer_mode_uses_one_minimal_write_and_post_read(self):
        bundle = {"status_code": 200, "headers": [], "body": ANSWER_WRITE_BUNDLE}
        for model, poller, validation in (("Bar 310", poll_huawei_bar310_device, "confirmed_local_validation"),
                                          ("Box 310", poll_huawei_box310_device, "confirmed_user_validation"),
                                          ("Box 610", poll_huawei_box610_device, "confirmed_user_validation")):
            for action_id, initial, expected in (("set_huawei_310_auto_answer_manual", 1, "manual"),
                                                 ("set_huawei_310_auto_answer_automatic", 0, "automatic")):
                calls = []
                result = poller(
                    {"ip": "192.0.2.31", "model": model, "allowInsecureTls": True},
                    [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                    {"request": self.success_request(calls, model=model, overrides={"/static/js/main.synthetic.chunk.js": bundle}, configuration_values={**SYNTHETIC_SETTINGS, "autoreply": initial}),
                     "management_tasks": [action_id], "management_settle": lambda: None},
                )
                self.assertTrue(result["ok"])
                action = result["managementActions"][0]
                self.assertEqual(action["id"], action_id)
                self.assertEqual(action["status"], "applied")
                self.assertEqual(action["after"], expected)
                self.assertEqual(action["validationStatus"], validation)
                writes = [call for call in calls if call["path"] == "/v1/om/config" and call["method"] == "PUT"]
                self.assertEqual(len(writes), 1)
                self.assertEqual(json.loads(writes[0]["body"]), {"CfgItemInt": [{"CfgItemID": "autoreply", "CfgItemInfo": 0 if expected == "manual" else 1}], "CfgItemString": []})
                self.assertEqual(result["deviceSettings"]["fields"]["autoAnswer"]["value"], "disabled" if expected == "manual" else "enabled")
                self.assertNotIn("GOOD-SYNTHETIC", json.dumps(result))

    def test_huawei_310_answer_mode_is_idempotent_and_fails_closed(self):
        bundle = {"status_code": 200, "headers": [], "body": ANSWER_WRITE_BUNDLE}
        def run(overrides=None, initial=1, verify=None, tasks=None):
            calls = []
            result = poll_huawei_bar310_device(
                {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {"request": self.success_request(calls, overrides=overrides or {"/static/js/main.synthetic.chunk.js": bundle}, configuration_values={**SYNTHETIC_SETTINGS, "autoreply": initial}, verify_answer_value=verify),
                 "management_tasks": tasks or ["set_huawei_310_auto_answer_manual"], "management_settle": lambda: None},
            )
            return result, calls
        already, calls = run(initial=0)
        self.assertEqual(already["managementActions"][0]["status"], "already_compliant")
        self.assertFalse(any(call["method"] == "PUT" for call in calls))
        drift, calls = run(overrides={"/static/js/main.synthetic.chunk.js": {"status_code": 200, "headers": [], "body": ANSWER_WRITE_BUNDLE.replace('CfgItemID:"autoreply"', "missing-save-field")}})
        self.assertFalse(drift["ok"])
        self.assertEqual(drift["managementActions"][0]["safeError"], "management_contract_unconfirmed")
        self.assertFalse(any(call["method"] == "PUT" for call in calls))
        mismatch, calls = run(verify=1)
        self.assertFalse(mismatch["ok"])
        self.assertEqual(mismatch["managementActions"][0]["safeError"], "configuration_verification_failed")
        self.assertEqual(len([call for call in calls if call["method"] == "PUT"]), 1)
        conflict, calls = run(tasks=["set_huawei_310_auto_answer_manual", "disable_insecure_management_services"])
        self.assertEqual(conflict["safeError"], "management_task_conflict")
        self.assertFalse(calls)

    def test_bar310_reads_site_name_from_guarded_mailbox(self):
        calls = []
        overrides = {
            "/static/js/main.synthetic.chunk.js": {"status_code": 200, "headers": [], "body": MAIN_BUNDLE + " WEB_SubscribeMailboxDataAPI WEB_GetMailboxDataAPI"},
            "/action.cgi?ActionID=WEB_SubscribeMailboxDataAPI": envelope({}),
            "/action.cgi?ActionID=WEB_GetMailboxDataAPI": envelope({"state": {"sitename": "Synthetic Bar Site"}}),
        }
        result = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(calls, overrides=overrides)},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"]["value"], "Synthetic Bar Site")
        self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], "Synthetic Bar Site")
        self.assertFalse(any(call["method"] == "PUT" for call in calls))

    def test_bar_management_action_uses_one_minimal_http_write_and_post_read(self):
        calls = []
        result = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {
                "request": self.success_request(calls, http_value=1),
                "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION],
                "management_settle": lambda: None,
            },
        )

        self.assertTrue(result["ok"])
        action = result["managementActions"][0]
        self.assertEqual(action["status"], "applied")
        self.assertTrue(action["changed"])
        self.assertEqual(action["before"], {"httpPort80": "enabled", "telnetPort23": "not_exposed"})
        self.assertEqual(action["after"], {"httpPort80": "disabled", "telnetPort23": "not_exposed"})
        writes = [item for item in calls if item["path"] == "/v1/om/config" and item["method"] == "PUT"]
        self.assertEqual(len(writes), 1)
        self.assertEqual(json.loads(writes[0]["body"]), {
            "CfgItemInt": [{"CfgItemID": "enable_http", "CfgItemInfo": 0}],
            "CfgItemString": [],
        })
        reads = [json.loads(item["body"])["CfgIDString"] for item in calls if item["path"] == "/v1/om/config" and item["method"] == "POST"]
        self.assertEqual(reads, [["enable_http"], ["enable_http"]])
        self.assertNotIn("GOOD-SYNTHETIC", json.dumps(result))

    def test_bar_management_action_is_idempotent_and_requires_opt_in(self):
        compliant_calls = []
        compliant = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "CloudLink Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(compliant_calls, http_value=0), "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION]},
        )
        self.assertEqual(compliant["managementActions"][0]["status"], "already_compliant")
        self.assertFalse(any(item["method"] == "PUT" for item in compliant_calls))

        read_only_calls = []
        read_only = poll_huawei_bar310_device(
            {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
            [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
            {"request": self.success_request(read_only_calls)},
        )
        self.assertTrue(read_only["ok"])
        self.assertNotIn("managementActions", read_only)
        self.assertEqual(read_only["deviceSettings"]["fields"]["http"]["status"], "read")
        self.assertEqual(read_only["deviceSettings"]["fields"]["telnet"]["status"], "not_exposed")
        self.assertTrue(any(item["path"] == "/v1/om/config" and item["method"] == "POST" for item in read_only_calls))
        self.assertFalse(any(item["method"] == "PUT" for item in read_only_calls))

    def test_bar_management_action_fails_closed_on_http_marker_schema_or_verification_drift(self):
        cases = (
            (MAIN_BUNDLE.replace("enable_http", "missing-http-marker"), 1, 0, "management_contract_unconfirmed"),
            (MAIN_BUNDLE, 2, 0, "configuration_schema_unconfirmed"),
            (MAIN_BUNDLE, 1, 1, "configuration_verification_failed"),
        )
        for bundle, initial, verified, expected in cases:
            calls = []
            result = poll_huawei_bar310_device(
                {"ip": "192.0.2.31", "model": "Bar 310", "allowInsecureTls": True},
                [{"username": "good-user", "password": "GOOD-SYNTHETIC"}],
                {
                    "request": self.success_request(
                        calls,
                        overrides={"/static/js/main.synthetic.chunk.js": {"status_code": 200, "headers": [], "body": bundle}},
                        http_value=initial,
                        verify_http_value=verified,
                    ),
                    "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION],
                    "management_settle": lambda: None,
                },
            )
            self.assertFalse(result["ok"])
            self.assertEqual(result["failedStage"], "management_action")
            self.assertEqual(result["safeError"], expected)
            put_count = len([item for item in calls if item["method"] == "PUT"])
            self.assertEqual(put_count, 1 if expected == "configuration_verification_failed" else 0)

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
        self.assertEqual(result["siteName"], {"status": "protocol_required", "value": None})
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
