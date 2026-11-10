from __future__ import annotations

import json
import io
import ssl
import unittest
from unittest.mock import patch

from mvp_runtime.adapters.huawei_te40 import DISABLE_INSECURE_SERVICES_ACTION, DISABLE_TE20_AUTO_UPDATE_ACTION, SET_TE20_AUTO_ANSWER_ACTION, SET_TE20_MANUAL_ANSWER_ACTION, SET_TE20_NTP_ACTION, SET_TE20_POWER_ACTION, TE20_TLS_PROFILE, TE20_PORT_ACTIONS, TE20_SSH_ACTIONS, HuaweiTransportError, _disable_te20_auto_update, _https_context, _read_te20_extra_settings, _read_device_settings, _set_te20_auto_answer_automatic, _set_te20_auto_answer_manual, _set_te20_ntp_settings, _set_te20_power_settings, _set_te20_port_setting, _set_te20_ssh, TE20_READONLY_SETTING_IDS, TE20_POWER_DETAIL_IDS, MANAGEMENT_ACTION_MARKERS, build_web_blocks, poll_huawei_te_device
from mvp_runtime.adapters.device_settings import unknown_device_settings
from mvp_runtime.redaction import sanitize_result


LOGIN_MARKERS = "WEB_GetLoginInfo Web_RequestSessionID Web_RequestCertificate WEB_ChangeSessionID"
RESOURCE_MARKERS = "WEB_GetProductEsnAPI WEB_GetSystemMacAddrAPI WEB_GetVersionInfoAPI WEB_GetTermSpecsInfoAPI WEB_GetSysLocalTimeAPI WEB_GetDhcpIPInfoAPI WEB_GetCfgParamAPI WEB_SaveCfgParamAPI enabletelnet enable_http"


def envelope(data=None, success=1, exception_id=None):
    payload = {"success": success, "data": json.dumps(data or {})}
    if exception_id is not None:
        payload["exception"] = {"id": exception_id}
    return {"status_code": 200, "headers": [], "body": json.dumps(payload)}


def synthetic_resources(model="TE40"):
    return {
        "WEB_GetProductEsnAPI": {"product_esn": "SYNTHETIC-ESN"},
        "WEB_GetSystemMacAddrAPI": {"system_wanMAC_addr": "00:00:00:00:00:01", "system_lanMAC_addr": "00:00:00:00:00:02"},
        "WEB_GetVersionInfoAPI": {"model": model, "softVersion": "V1", "hardVersion": "H1", "logicVersion": "L1", "micVersion": [], "inCamVersion": "C1"},
        "WEB_GetTermSpecsInfoAPI": {"audioProtocol": "SYNTHETIC", "videoProtocol": "SYNTHETIC", "ipSpeed": 1024, "maxEnc": 1, "maxDec": 1},
        "WEB_GetSysLocalTimeAPI": {"year": 2026, "month": 9, "day": 3, "hour": 12, "minute": 0, "second": 1, "daylight": 0, "isDst": 0},
        "WEB_GetDhcpIPInfoAPI": {"IPv4DhcpAddr": "192.0.2.40", "IPv4DhcpNetMask": "255.255.255.0", "IPv4DhcpGaweWay": "192.0.2.1"},
    }


class HuaweiTe40Tests(unittest.TestCase):
    def test_te_family_log_transport_uses_exact_token_path_and_default_tls_profile(self):
        from mvp_runtime.adapters.huawei_te40 import _open_te_family_log_stream
        observed = {}
        class Response:
            status = 200
            def getheader(self, name):
                return "application/x-octet-stream" if name == "Content-Type" else None
            def read(self, _size):
                return b"<?xml version='1.0'?><LogModule/>"
            def close(self):
                pass
        class Connection:
            def __init__(self, ip, port, timeout, context):
                observed.update({"ip": ip, "port": port, "timeout": timeout, "context": context})
            def request(self, method, path, headers):
                observed.update({"method": method, "path": path, "headers": headers})
            def getresponse(self):
                return Response()
            def close(self):
                pass
        with patch("mvp_runtime.adapters.huawei_te40._https_context", return_value="synthetic-context") as context, patch("mvp_runtime.adapters.huawei_te40.http.client.HTTPSConnection", Connection):
            stream = _open_te_family_log_stream({"ip": "192.0.2.40", "reject_unauthorized": False, "cookie": "SyntheticSession=1", "csrf_token": "SYNTHETIC-TOKEN", "nonce": "0.25"})
            self.assertEqual(stream.read(128), b"<?xml version='1.0'?><LogModule/>")
            stream.close()
        context.assert_called_once_with(False, None)
        self.assertEqual(observed["path"], "/log?Token=SYNTHETIC-TOKEN?rmd=0.25")
        self.assertEqual(observed["method"], "GET")
        self.assertEqual(observed["port"], 443)
    def test_te_family_readonly_settings_are_independent_and_redacted(self):
        from mvp_runtime.adapters.huawei_te40 import _read_te_family_extra_settings
        settings = unknown_device_settings("TE40")
        bundle = "WEB_GetCfgParamAPI WEB_GetSnmpCfgAPI WEB_GetWifiStatModeAPI 'enable_ssh' 'isenableautoupgrade' 'synSerTime' 'ntpGetMode' 'timeServer' 'sleepTime' 'autoreply'"
        calls = []
        def action(name, payload):
            calls.append((name, payload))
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"enable_ssh": 1, "isenableautoupgrade": 0, "synSerTime": 0, "ntpGetMode": 1, "timeServer": "", "sleepTime": 10, "autoreply": 0}
            if name == "WEB_GetSnmpCfgAPI":
                return {"success": 1}, {"snmpv2": 0, "IsEnableSnmp": 1, "GetCommunity": "SYNTHETIC-SECRET"}
            return {"success": 1}, {"ucWifiMode": 3, "szMacAddr": "00:00:00:00:00:01"}
        _read_te_family_extra_settings(settings, bundle, "synthetic-csrf", action)
        fields = settings["fields"]
        self.assertEqual(fields["ssh"]["value"], "enabled")
        self.assertEqual(fields["autoUpdate"]["value"], "disabled")
        self.assertEqual(fields["autoAnswer"]["value"], "enabled")
        self.assertEqual(fields["ntp"]["value"]["enabled"], False)
        self.assertEqual(fields["powerManagement"]["value"]["sleepTimeCode"], 10)
        self.assertNotIn("scheduledRestartCode", fields["powerManagement"]["value"])
        self.assertEqual(fields["snmpV2"]["value"], "disabled")
        self.assertEqual(fields["snmpV2"]["serviceEnabled"], True)
        self.assertEqual(fields["wifi"]["value"], {"modeCode": 3, "clientEnabled": True, "accessPointEnabled": True})
        self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI", "WEB_GetSnmpCfgAPI", "WEB_GetWifiStatModeAPI"])
        self.assertNotIn("SYNTHETIC-SECRET", json.dumps(settings))
        unknown = unknown_device_settings("TE40")
        _read_te_family_extra_settings(unknown, "WEB_GetWifiStatModeAPI", "csrf", lambda *_: ({"success": 1}, {"ucWifiMode": 9}))
        self.assertEqual(unknown["fields"]["wifi"], {"status": "unavailable", "value": None})
        self.assertEqual(unknown["fields"]["ssh"]["status"], "protocol_required")
        service_off = unknown_device_settings("TE40")
        _read_te_family_extra_settings(service_off, "WEB_GetSnmpCfgAPI", "csrf", lambda *_: ({"success": 1}, {"snmpv2": 1, "IsEnableSnmp": 0}))
        self.assertEqual(service_off["fields"]["snmpV2"]["value"], "disabled")
        self.assertEqual(service_off["fields"]["snmpV2"]["configuredEnabled"], True)

    def test_te_family_power_schedule_reads_only_verified_fields(self):
        from mvp_runtime.adapters.huawei_te40 import _read_te_family_extra_settings
        ids = ("sleepTime", "rp_shutdown", "enable_poweron", "enable_poweroff", "poweron_hour", "poweron_minute", "poweroff_hour", "poweroff_minute")
        bundle = "WEB_GetCfgParamAPI 'enableTimeReboot' " + " ".join(f"'{key}'" for key in ids)
        values = {"sleepTime": 10, "rp_shutdown": 1, "enable_poweron": 1, "enable_poweroff": 0,
                  "poweron_hour": 6, "poweron_minute": 25, "poweroff_hour": 23, "poweroff_minute": 15}
        calls = []
        def action(name, payload):
            calls.append((name, payload))
            return {"success": 1}, values
        settings = unknown_device_settings("TE40")
        _read_te_family_extra_settings(settings, bundle, "synthetic-csrf", action)
        power = settings["fields"]["powerManagement"]["value"]
        self.assertEqual(power["shutDownEnabled"], True)
        self.assertEqual(power["scheduledPowerOn"], {"enabled": True, "time": "06:25"})
        self.assertEqual(power["scheduledPowerOff"], {"enabled": False, "time": None})
        self.assertNotIn("scheduledRestartCode", power)
        self.assertEqual(calls[0][1]["CfgIDString"], list(ids))
        self.assertNotIn("enableTimeReboot", calls[0][1]["CfgIDString"])
        values["poweron_hour"] = 25
        uncertain = unknown_device_settings("TE40")
        _read_te_family_extra_settings(uncertain, bundle, "synthetic-csrf", action)
        self.assertEqual(uncertain["fields"]["powerManagement"]["value"]["scheduledPowerOn"], {"enabled": True, "time": None, "status": "unavailable"})
    def test_te_family_answer_mode_one_field_write_and_postread(self):
        from mvp_runtime.adapters.huawei_te40 import _set_te_family_answer_mode
        bundle = "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI autoreply data: [[1, this.objStrings.displayTx.TXT_CONFIG_CALL_COMM_MANNED_REPLY], [0, this.objStrings.displayTx.TXT_CONFIG_CALL_COMM_AUTO_REPLY]]"
        for model in ("te30", "te40", "te50", "te60"):
            with self.subTest(model=model):
                state = {"value": 1}
                calls = []
                def action(name, payload):
                    calls.append((name, payload))
                    if name == "WEB_GetCfgParamAPI":
                        return {"success": 1}, {"autoreply": state["value"]}
                    state["value"] = payload["CfgItemInt"][0]["CfgItemInfo"]
                    return {"success": 1}, {}
                result = _set_te_family_answer_mode("set_te_family_auto_answer_automatic", model, bundle, "synthetic-csrf", action)
                self.assertEqual(result["status"], "applied")
                self.assertEqual(result["after"], "automatic")
                self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI", "WEB_SaveCfgParamAPI", "WEB_GetCfgParamAPI"])
                self.assertEqual(calls[1][1]["CfgItemInt"], [{"CfgItemID": "autoreply", "CfgItemInfo": 0}])
                calls.clear()
                result = _set_te_family_answer_mode("set_te_family_auto_answer_manual", model, bundle, "synthetic-csrf", action)
                self.assertEqual(result["status"], "applied")
                self.assertEqual(state["value"], 1)
                self.assertEqual(_set_te_family_answer_mode("set_te_family_auto_answer_manual", model, bundle, "synthetic-csrf", action)["status"], "already_compliant")
        self.assertEqual(_set_te_family_answer_mode("set_te_family_auto_answer_automatic", "te40", "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI autoreply", "csrf", lambda *_: self.fail("must not call"))["safeError"], "management_contract_unconfirmed")
    def test_te20_log_export_is_opt_in_after_identity(self):
        calls = []
        opened = []
        received = []
        bundle = RESOURCE_MARKERS + " exportLogFile '?actkn='"
        request = self.success_request(calls, terminal_model="Huawei TE20", preauth_legacy=True,
            overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}})
        result = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": request, "collect_logs": True,
             "log_opener": lambda options: opened.append(options["ip"]) or io.BytesIO(b"<?xml version='1.0'?><LogModule/>"),
             "on_log": lambda stream, metadata: received.append((metadata["filename"], stream.read())) or {"status": "saved"}},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["logCollection"], {"status": "saved"})
        self.assertEqual(opened, ["192.0.2.20"])
        self.assertEqual(received[0][0], "192.0.2.20.xml")
        self.assertNotIn("LogModule", json.dumps(result))
        without = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request([], terminal_model="Huawei TE20", preauth_legacy=True), "collect_logs": False,
             "log_opener": lambda _options: self.fail("log must not open")},
        )
        self.assertNotIn("logCollection", without)

    def test_te_family_log_export_is_exact_marker_gated_and_opt_in(self):
        for model in ("TE30", "TE40", "TE50", "TE60"):
            with self.subTest(model=model):
                calls, opened, saved = [], [], []
                bundle = RESOURCE_MARKERS + ' exportLogFile "?Token="'
                request = self.success_request(calls, terminal_model=model,
                    overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}})
                result = poll_huawei_te_device(
                    {"ip": "192.0.2.40", "model": model, "allowInsecureTls": True},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                    {"request": request, "collect_logs": True,
                     "log_opener": lambda options: opened.append(options["ip"]) or io.BytesIO(b"<?xml version='1.0'?><LogModule/>"),
                     "on_log": lambda stream, metadata: saved.append((metadata["filename"], stream.read())) or {"status": "saved"}},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["logCollection"], {"status": "saved"})
                self.assertEqual(opened, ["192.0.2.40"])
                self.assertEqual(saved[0][0], "192.0.2.40.xml")
                self.assertNotIn("LogModule", json.dumps(result))
                no_marker = poll_huawei_te_device(
                    {"ip": "192.0.2.40", "model": model, "allowInsecureTls": True},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                    {"request": self.success_request([], terminal_model=model,
                        overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": RESOURCE_MARKERS + " exportLogFile"}}),
                     "collect_logs": True, "log_opener": lambda _options: self.fail("unknown contract must not download"),
                     "on_log": lambda *_: self.fail("unknown contract must not stream")},
                )
                self.assertEqual(no_marker["logCollection"], {"status": "protocol_required"})

    def test_te20_power_writes_only_changed_fields_and_verifies(self):
        state = {"suppotReboot": 0, "sleepTime": 0, "enableTimeReboot": 0, "rebootHour": 4, "rebootMinute": 0}
        calls = []
        def action(name, payload):
            calls.append((name, payload))
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"CfgItemInt": [{"CfgItemID": key, "CfgItemInfo": state[key]} for key in state]}
            for item in payload["CfgItemInt"]:
                state[item["CfgItemID"]] = item["CfgItemInfo"]
            return {"success": 1}, {}
        bundle = "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI suppotReboot sleepTime enableTimeReboot rebootHour rebootMinute"
        changes = {"shutdownRestart": True, "sleepMinutes": 10, "scheduledRestart": True, "restartHour": 3, "restartMinute": 15}
        result = _set_te20_power_settings(bundle, "SYNTHETIC-CSRF", action, changes)
        self.assertEqual(result["id"], SET_TE20_POWER_ACTION)
        self.assertEqual(result["status"], "applied")
        self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI", "WEB_SaveCfgParamAPI", "WEB_GetCfgParamAPI"])
        save = next(payload for name, payload in calls if name == "WEB_SaveCfgParamAPI")
        self.assertEqual([item["CfgItemID"] for item in save["CfgItemInt"]], list(state))
        self.assertEqual(save["CfgItemString"], [])
        calls.clear()
        self.assertEqual(_set_te20_power_settings(bundle, "SYNTHETIC-CSRF", action, changes)["status"], "already_compliant")
        self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI"])

    def test_te20_power_fails_closed_on_marker_schema_schedule_and_postread(self):
        bundle = "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI suppotReboot sleepTime enableTimeReboot rebootHour rebootMinute"
        state = {"suppotReboot": 0, "sleepTime": 0, "enableTimeReboot": 0, "rebootHour": 4, "rebootMinute": 0}
        calls = []
        def action(name, payload):
            calls.append(name)
            return {"success": 1}, dict(state)
        changes = {"shutdownRestart": None, "sleepMinutes": None, "scheduledRestart": None, "restartHour": 3, "restartMinute": 15}
        self.assertEqual(_set_te20_power_settings("WEB_GetCfgParamAPI suppotReboot sleepTime enableTimeReboot rebootHour rebootMinute", "SYNTHETIC-CSRF", action, changes)["safeError"], "management_contract_unconfirmed")
        self.assertEqual(calls, [])
        self.assertEqual(_set_te20_power_settings(bundle, "SYNTHETIC-CSRF", action, changes)["safeError"], "configuration_combination_invalid")
        self.assertEqual(calls, ["WEB_GetCfgParamAPI"])
        def mismatched(name, payload):
            return {"success": 1}, dict(state)
        failed = _set_te20_power_settings(bundle, "SYNTHETIC-CSRF", mismatched, {"shutdownRestart": True, "sleepMinutes": None, "scheduledRestart": None, "restartHour": None, "restartMinute": None})
        self.assertEqual(failed["safeError"], "configuration_verification_failed")
        self.assertTrue(failed["writeAttempted"])

    def test_te20_power_action_in_full_poll_updates_json_after_identity_gate(self):
        calls = []
        bundle = RESOURCE_MARKERS + " suppotReboot sleepTime enableTimeReboot rebootHour rebootMinute"
        result = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(calls, terminal_model="Huawei TE20", preauth_legacy=True,
                                            configuration={"enabletelnet": 0, "enable_http": 0, "suppotReboot": 0, "sleepTime": 0, "enableTimeReboot": 0, "rebootHour": 4, "rebootMinute": 0},
                                            overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}}),
             "management_tasks": [SET_TE20_POWER_ACTION], "power_changes": {"shutdownRestart": None, "sleepMinutes": 5, "scheduledRestart": None, "restartHour": None, "restartMinute": None}},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["managementActions"][0]["status"], "applied")
        self.assertEqual(result["deviceSettings"]["fields"]["powerManagement"]["value"]["sleepTimeCode"], 5)
        writes = [json.loads(item["body"]) for item in calls if "WEB_SaveCfgParamAPI" in item["path"]]
        self.assertEqual([payload["CfgItemInt"] for payload in writes], [[{"CfgItemID": "sleepTime", "CfgItemInfo": 5}]])
        self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))

    def test_te20_ntp_writes_only_changed_fields_once_and_verifies(self):
        state = {"synSerTime": 0, "ntpGetMode": 0, "timeServer": "old.example.test"}
        calls = []
        def action(name, payload):
            calls.append((name, payload))
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"CfgItemInt": [{"CfgItemID": key, "CfgItemInfo": state[key]} for key in ("synSerTime", "ntpGetMode")], "CfgItemString": [{"CfgItemID": "timeServer", "CfgItemInfo": state["timeServer"]}]}
            for item in payload["CfgItemInt"] + payload["CfgItemString"]:
                state[item["CfgItemID"]] = item["CfgItemInfo"]
            return {"success": 1}, {}
        changes = {"enabled": True, "mode": "manual", "server": "new.example.test"}
        bundle = "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI synSerTime ntpGetMode timeServer"
        result = _set_te20_ntp_settings(bundle, "SYNTHETIC-CSRF", action, changes)
        self.assertEqual(result["id"], SET_TE20_NTP_ACTION)
        self.assertEqual(result["status"], "applied")
        self.assertEqual(result["after"], {"enabled": True, "mode": "manual", "server": "new.example.test"})
        self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI", "WEB_SaveCfgParamAPI", "WEB_GetCfgParamAPI"])
        self.assertEqual([payload["CfgIDString"] for name, payload in calls if name == "WEB_GetCfgParamAPI"], [["synSerTime", "ntpGetMode", "timeServer"]] * 2)
        save = next(payload for name, payload in calls if name == "WEB_SaveCfgParamAPI")
        self.assertEqual(save["CfgItemInt"], [{"CfgItemID": "synSerTime", "CfgItemInfo": 1}, {"CfgItemID": "ntpGetMode", "CfgItemInfo": 1}])
        self.assertEqual(save["CfgItemString"], [{"CfgItemID": "timeServer", "CfgItemInfo": "new.example.test"}])
        calls.clear()
        self.assertEqual(_set_te20_ntp_settings(bundle, "SYNTHETIC-CSRF", action, changes)["status"], "already_compliant")
        self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI"])

    def test_te20_ntp_fails_closed_on_marker_schema_combination_and_postread(self):
        bundle = "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI synSerTime ntpGetMode timeServer"
        calls = []
        def current(name, payload):
            calls.append(name)
            return {"success": 1}, {"synSerTime": 1, "ntpGetMode": 1, "timeServer": "ntp.example.test"}
        missing = _set_te20_ntp_settings("WEB_GetCfgParamAPI synSerTime ntpGetMode timeServer", "SYNTHETIC-CSRF", current, {"enabled": False, "mode": None, "server": None})
        self.assertEqual(missing["safeError"], "management_contract_unconfirmed")
        self.assertEqual(calls, [])
        invalid = _set_te20_ntp_settings(bundle, "SYNTHETIC-CSRF", current, {"enabled": False, "mode": "manual", "server": None})
        self.assertEqual(invalid["safeError"], "configuration_combination_invalid")
        self.assertEqual(calls, ["WEB_GetCfgParamAPI"])
        values = iter((1, 1))
        def mismatch(name, payload):
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"synSerTime": next(values), "ntpGetMode": 1, "timeServer": "ntp.example.test"}
            return {"success": 1}, {}
        failed = _set_te20_ntp_settings(bundle, "SYNTHETIC-CSRF", mismatch, {"enabled": False, "mode": None, "server": None})
        self.assertEqual(failed["safeError"], "configuration_verification_failed")
        self.assertTrue(failed["writeAttempted"])

    def test_te20_ntp_action_in_full_poll_uses_exact_model_and_updates_json(self):
        calls = []
        bundle = RESOURCE_MARKERS + " synSerTime ntpGetMode timeServer"
        result = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(calls, terminal_model="Huawei TE20", preauth_legacy=True,
                                            configuration={"enabletelnet": 0, "enable_http": 0, "synSerTime": 1, "ntpGetMode": 1, "timeServer": "ntp.example.test"},
                                            overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}}),
             "management_tasks": [SET_TE20_NTP_ACTION], "ntp_changes": {"enabled": False, "mode": None, "server": None}},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["managementActions"][0]["status"], "applied")
        self.assertFalse(result["deviceSettings"]["fields"]["ntp"]["value"]["enabled"])
        writes = [json.loads(item["body"]) for item in calls if "WEB_SaveCfgParamAPI" in item["path"]]
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["CfgItemInt"], [{"CfgItemID": "synSerTime", "CfgItemInfo": 0}])
        self.assertEqual(writes[0]["CfgItemString"], [])
        self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))

    def test_te20_ssh_actions_are_single_field_guarded_and_verified(self):
        for action_id, target in TE20_SSH_ACTIONS.items():
            with self.subTest(action_id=action_id):
                calls = []
                values = iter((1 - target, target))
                def action(name, payload):
                    calls.append((name, payload))
                    return ({"success": 1}, {"enable_ssh": next(values)}) if name == "WEB_GetCfgParamAPI" else ({"success": 1}, {})
                result = _set_te20_ssh(action_id, "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI enable_ssh", "SYNTHETIC-CSRF", action)
                self.assertEqual(result["status"], "applied")
                self.assertEqual(result["after"], "enabled" if target else "disabled")
                self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI", "WEB_SaveCfgParamAPI", "WEB_GetCfgParamAPI"])
                self.assertEqual([payload["CfgIDString"] for name, payload in calls if name == "WEB_GetCfgParamAPI"], [["enable_ssh"], ["enable_ssh"]])
                self.assertEqual([payload["CfgItemInt"] for name, payload in calls if name == "WEB_SaveCfgParamAPI"], [[{"CfgItemID": "enable_ssh", "CfgItemInfo": target}]])
                no_write = []
                def already(name, payload):
                    no_write.append(name)
                    return {"success": 1}, {"enable_ssh": target}
                self.assertEqual(_set_te20_ssh(action_id, "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI enable_ssh", "SYNTHETIC-CSRF", already)["status"], "already_compliant")
                self.assertEqual(no_write, ["WEB_GetCfgParamAPI"])
        self.assertEqual(_set_te20_ssh("set_te20_ssh_disabled", "WEB_GetCfgParamAPI enable_ssh", "SYNTHETIC-CSRF", lambda *_: self.fail("no network"))["safeError"], "management_contract_unconfirmed")

    def test_te20_auto_update_disable_is_single_field_and_verified(self):
        calls = []
        values = iter((1, 0))

        def action(name, payload):
            calls.append((name, payload))
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"CfgItemInt": [{"CfgItemID": "isenableautoupgrade", "CfgItemInfo": next(values)}]}
            return {"success": 1}, {}

        result = _disable_te20_auto_update("WEB_GetCfgParamAPI WEB_SaveCfgParamAPI isenableautoupgrade", "SYNTHETIC-CSRF", action)
        self.assertEqual(result["id"], DISABLE_TE20_AUTO_UPDATE_ACTION)
        self.assertEqual(result["status"], "applied")
        self.assertEqual(result["before"], "enabled")
        self.assertEqual(result["after"], "disabled")
        self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI", "WEB_SaveCfgParamAPI", "WEB_GetCfgParamAPI"])
        self.assertEqual([payload["CfgIDString"] for name, payload in calls if name == "WEB_GetCfgParamAPI"], [["isenableautoupgrade"], ["isenableautoupgrade"]])
        self.assertEqual([payload["CfgItemInt"] for name, payload in calls if name == "WEB_SaveCfgParamAPI"], [[{"CfgItemID": "isenableautoupgrade", "CfgItemInfo": 0}]])

        already_calls = []
        def already(name, payload):
            already_calls.append(name)
            return {"success": 1}, {"isenableautoupgrade": 0}
        self.assertEqual(_disable_te20_auto_update("WEB_GetCfgParamAPI WEB_SaveCfgParamAPI isenableautoupgrade", "SYNTHETIC-CSRF", already)["status"], "already_compliant")
        self.assertEqual(already_calls, ["WEB_GetCfgParamAPI"])

    def test_te20_auto_update_disable_fails_closed(self):
        calls = []
        def action(name, payload):
            calls.append(name)
            return {"success": 1}, {"isenableautoupgrade": 2}
        self.assertEqual(_disable_te20_auto_update("WEB_GetCfgParamAPI isenableautoupgrade", "SYNTHETIC-CSRF", action)["safeError"], "management_contract_unconfirmed")
        self.assertEqual(calls, [])
        self.assertEqual(_disable_te20_auto_update("WEB_GetCfgParamAPI WEB_SaveCfgParamAPI isenableautoupgrade", "SYNTHETIC-CSRF", action)["safeError"], "configuration_schema_unconfirmed")
        self.assertEqual(calls, ["WEB_GetCfgParamAPI"])

        values = iter((1, 1))
        def mismatch(name, payload):
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"isenableautoupgrade": next(values)}
            return {"success": 1}, {}
        failed = _disable_te20_auto_update("WEB_GetCfgParamAPI WEB_SaveCfgParamAPI isenableautoupgrade", "SYNTHETIC-CSRF", mismatch)
        self.assertEqual(failed["safeError"], "configuration_verification_failed")
        self.assertTrue(failed["writeAttempted"])
        self.assertFalse(failed["changed"])

    def test_te20_auto_update_disable_in_full_poll_follows_identity_gate(self):
        calls = []
        bundle = RESOURCE_MARKERS + " isenableautoupgrade"
        result = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(calls, terminal_model="Huawei TE20", preauth_legacy=True,
                                            configuration={"enabletelnet": 0, "enable_http": 0, "isenableautoupgrade": 1},
                                            overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}}),
             "management_tasks": [DISABLE_TE20_AUTO_UPDATE_ACTION]},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["managementActions"][0]["status"], "applied")
        self.assertEqual(result["deviceSettings"]["fields"]["autoUpdate"]["value"], "disabled")
        writes = [json.loads(item["body"]) for item in calls if "WEB_SaveCfgParamAPI" in item["path"]]
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["CfgItemInt"], [{"CfgItemID": "isenableautoupgrade", "CfgItemInfo": 0}])
        self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))

    def test_te20_port_actions_write_only_selected_field_and_verify(self):
        for action_id, (field, target) in TE20_PORT_ACTIONS.items():
            with self.subTest(action_id=action_id):
                calls = []
                values = iter((1 - target, target))

                def action(name, payload):
                    calls.append((name, payload))
                    if name == "WEB_GetCfgParamAPI":
                        return {"success": 1}, {"CfgItemInt": [{"CfgItemID": field, "CfgItemInfo": next(values)}]}
                    return {"success": 1}, {}

                result = _set_te20_port_setting(action_id, f"WEB_GetCfgParamAPI WEB_SaveCfgParamAPI {field}", "SYNTHETIC-CSRF", action)
                self.assertEqual(result["status"], "applied")
                self.assertEqual(result["before"], "enabled" if target == 0 else "disabled")
                self.assertEqual(result["after"], "enabled" if target == 1 else "disabled")
                self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI", "WEB_SaveCfgParamAPI", "WEB_GetCfgParamAPI"])
                self.assertEqual([payload["CfgIDString"] for name, payload in calls if name == "WEB_GetCfgParamAPI"], [[field], [field]])
                writes = [payload for name, payload in calls if name == "WEB_SaveCfgParamAPI"]
                self.assertEqual(writes[0]["CfgItemInt"], [{"CfgItemID": field, "CfgItemInfo": target}])
                self.assertEqual(writes[0]["CfgItemString"], [])

                no_write_calls = []
                def already(name, payload):
                    no_write_calls.append(name)
                    return {"success": 1}, {field: target}
                self.assertEqual(_set_te20_port_setting(action_id, f"WEB_GetCfgParamAPI WEB_SaveCfgParamAPI {field}", "SYNTHETIC-CSRF", already)["status"], "already_compliant")
                self.assertEqual(no_write_calls, ["WEB_GetCfgParamAPI"])

    def test_te20_port_actions_fail_closed_on_marker_schema_and_post_read(self):
        calls = []
        def never(name, payload):
            calls.append(name)
            return {"success": 1}, {}
        self.assertEqual(_set_te20_port_setting("set_te20_http_open", "WEB_GetCfgParamAPI enable_http", "SYNTHETIC-CSRF", never)["safeError"], "management_contract_unconfirmed")
        self.assertEqual(calls, [])
        self.assertEqual(_set_te20_port_setting("set_te20_http_open", "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI enable_http", "SYNTHETIC-CSRF", never)["safeError"], "configuration_schema_unconfirmed")
        self.assertEqual(calls, ["WEB_GetCfgParamAPI"])
        values = iter((0, 0))
        def post_mismatch(name, payload):
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"enable_http": next(values)}
            return {"success": 1}, {}
        failed = _set_te20_port_setting("set_te20_http_open", "WEB_GetCfgParamAPI WEB_SaveCfgParamAPI enable_http", "SYNTHETIC-CSRF", post_mismatch)
        self.assertEqual(failed["safeError"], "configuration_verification_failed")
        self.assertTrue(failed["writeAttempted"])
        self.assertFalse(failed["changed"])

    def test_te20_port_actions_run_only_after_exact_identity_and_stop_after_failure(self):
        calls = []
        result = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(calls, terminal_model="Huawei TE20", preauth_legacy=True,
                                            configuration={"enabletelnet": 0, "enable_http": 0}),
             "management_tasks": ["set_te20_http_open", "set_te20_telnet_open"]},
        )
        self.assertTrue(result["ok"])
        self.assertEqual([item["status"] for item in result["managementActions"]], ["applied", "applied"])
        writes = [json.loads(item["body"]) for item in calls if "WEB_SaveCfgParamAPI" in item["path"]]
        self.assertEqual([item["CfgItemInt"] for item in writes], [
            [{"CfgItemID": "enable_http", "CfgItemInfo": 1}],
            [{"CfgItemID": "enabletelnet", "CfgItemInfo": 1}],
        ])
        self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))

        mismatch_calls = []
        mismatch = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(mismatch_calls, terminal_model="TE40", preauth_legacy=True),
             "management_tasks": ["set_te20_http_open"]},
        )
        self.assertFalse(mismatch["ok"])
        self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in mismatch_calls))

        conflict_calls = []
        conflict = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": lambda options: conflict_calls.append(options),
             "management_tasks": ["set_te20_http_open", "set_te20_http_closed"]},
        )
        self.assertEqual(conflict["safeError"], "management_task_conflict")
        self.assertEqual(conflict_calls, [])

    def test_te20_auto_answer_write_is_separate_minimal_and_verified(self):
        calls = []
        answers = iter((1, 0))

        def action(name, payload):
            calls.append((name, payload))
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"CfgItemInt": [{"CfgItemID": "autoreply", "CfgItemInfo": next(answers)}]}
            return {"success": 1}, {}

        result = _set_te20_auto_answer_automatic("WEB_GetCfgParamAPI WEB_SaveCfgParamAPI autoreply", "SYNTHETIC-CSRF", action)
        self.assertEqual(result["id"], SET_TE20_AUTO_ANSWER_ACTION)
        self.assertEqual(result["status"], "applied")
        self.assertEqual(result["after"], "automatic")
        writes = [payload for name, payload in calls if name == "WEB_SaveCfgParamAPI"]
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0]["CfgItemInt"], [{"CfgItemID": "autoreply", "CfgItemInfo": 0}])
        self.assertEqual([name for name, _ in calls], ["WEB_GetCfgParamAPI", "WEB_SaveCfgParamAPI", "WEB_GetCfgParamAPI"])

        no_write = []
        def already(name, payload):
            no_write.append(name)
            return {"success": 1}, {"autoreply": 0}
        self.assertEqual(_set_te20_auto_answer_automatic("WEB_GetCfgParamAPI WEB_SaveCfgParamAPI autoreply", "SYNTHETIC-CSRF", already)["status"], "already_compliant")
        self.assertEqual(no_write, ["WEB_GetCfgParamAPI"])

        def unknown(name, payload):
            return {"success": 1}, {"autoreply": 2}
        self.assertEqual(_set_te20_auto_answer_automatic("WEB_GetCfgParamAPI WEB_SaveCfgParamAPI autoreply", "SYNTHETIC-CSRF", unknown)["safeError"], "configuration_schema_unconfirmed")

        manual_calls = []
        manual_values = iter((0, 1))
        def set_manual(name, payload):
            manual_calls.append((name, payload))
            if name == "WEB_GetCfgParamAPI":
                return {"success": 1}, {"autoreply": next(manual_values)}
            return {"success": 1}, {}
        manual_result = _set_te20_auto_answer_manual("WEB_GetCfgParamAPI WEB_SaveCfgParamAPI autoreply", "SYNTHETIC-CSRF", set_manual)
        self.assertEqual(manual_result["id"], SET_TE20_MANUAL_ANSWER_ACTION)
        self.assertEqual(manual_result["status"], "applied")
        self.assertEqual(manual_result["after"], "manual")
        self.assertEqual([payload for name, payload in manual_calls if name == "WEB_SaveCfgParamAPI"][0]["CfgItemInt"], [{"CfgItemID": "autoreply", "CfgItemInfo": 1}])

    def test_te20_wifi_capability_absent_is_not_exposed_but_other_firmware_remains_unknown(self):
        def action(_name, _payload):
            return {"success": 1}, {"CfgItemInt": [
                {"CfgItemID": "enabletelnet", "CfgItemInfo": 0},
                {"CfgItemID": "enable_http", "CfgItemInfo": 0},
            ]}

        bundle = " ".join(MANAGEMENT_ACTION_MARKERS)
        absent = _read_device_settings("te20", bundle, "SYNTHETIC-CSRF", action, {"termSpecs": {"EnableWifi": 0}})
        capable = _read_device_settings("te20", bundle, "SYNTHETIC-CSRF", action, {"termSpecs": {"EnableWifi": 1}})
        self.assertEqual(absent["fields"]["wifi"], {"status": "not_exposed", "value": None, "reason": "capability_absent"})
        self.assertEqual(capable["fields"]["wifi"], {"status": "protocol_required", "value": None})

    def test_te20_confirmed_readonly_settings_and_ntp_server(self):
        settings = unknown_device_settings("TE20")
        calls = []

        def action(name, payload):
            calls.append((name, payload))
            if payload["CfgIDString"] == list(TE20_POWER_DETAIL_IDS):
                return {"success": 1}, {"CfgItemInt": [
                    {"CfgItemID": "suppotReboot", "CfgItemInfo": 0},
                    {"CfgItemID": "rebootHour", "CfgItemInfo": 4},
                    {"CfgItemID": "rebootMinute", "CfgItemInfo": 0},
                ]}
            return {"success": 1}, {
                "CfgItemInt": [
                    {"CfgItemID": "enable_ssh", "CfgItemInfo": 1},
                    {"CfgItemID": "isenableautoupgrade", "CfgItemInfo": 0},
                    {"CfgItemID": "synSerTime", "CfgItemInfo": 1},
                    {"CfgItemID": "ntpGetMode", "CfgItemInfo": 1},
                    {"CfgItemID": "sleepTime", "CfgItemInfo": 0},
                    {"CfgItemID": "enableTimeReboot", "CfgItemInfo": 0},
                    {"CfgItemID": "autoreply", "CfgItemInfo": 1},
                ],
                "CfgItemString": [{"CfgItemID": "timeServer", "CfgItemInfo": "ntp.example.test"}],
            }

        _read_te20_extra_settings(settings, "WEB_GetCfgParamAPI " + " ".join((*TE20_READONLY_SETTING_IDS, *TE20_POWER_DETAIL_IDS)), "SYNTHETIC-CSRF", action)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0], "WEB_GetCfgParamAPI")
        self.assertEqual(calls[0][1]["CfgIDString"], list(TE20_READONLY_SETTING_IDS))
        self.assertEqual(settings["fields"]["ssh"]["value"], "enabled")
        self.assertEqual(settings["fields"]["autoUpdate"]["value"], "disabled")
        self.assertEqual(settings["fields"]["ntp"]["value"], {"enabled": True, "modeCode": 1, "mode": "manual", "server": "ntp.example.test"})
        self.assertEqual(settings["fields"]["powerManagement"]["value"]["sleepMode"], "never")
        self.assertEqual(settings["fields"]["powerManagement"]["value"]["shutdownRestartEnabled"], False)
        self.assertEqual(settings["fields"]["powerManagement"]["value"]["restartHour"], 4)
        self.assertEqual(settings["fields"]["autoAnswer"]["value"], "disabled")
        self.assertEqual(settings["fields"]["wifi"]["status"], "protocol_required")

    def success_request(self, calls, overrides=None, terminal_model="TE40", configuration=None, persist_save=True, preauth_legacy=False):
        resources = synthetic_resources(terminal_model)
        overrides = overrides or {}
        default_http_value = 1 if "te20" in terminal_model.casefold() else 0
        configuration_state = dict(configuration or {"enabletelnet": 1, "enable_http": default_http_value})

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
                if preauth_legacy:
                    return envelope({"AlreadyLogin": 0, "acCSRFToken": "", "ucTerType": 0, "ucCustomType": 0})
                return envelope({"AlreadyLogin": 0, "szTermType": terminal_model})
            if action == "Web_RequestSessionID":
                return envelope({"acSessionId": ""})
            if action == "Web_RequestCertificate":
                return envelope({"acCSRFToken": "SYNTHETIC-CSRF"})
            if action == "WEB_ChangeSessionID":
                return envelope({"acSessionId": ""})
            if action == "WEB_GetCfgParamAPI":
                return envelope({"CfgItemInt": [{"CfgItemID": key, "CfgItemInfo": value} for key, value in configuration_state.items()]})
            if action == "WEB_SaveCfgParamAPI":
                payload = json.loads(options["body"])
                if persist_save:
                    for item in payload.get("CfgItemInt", []):
                        configuration_state[item["CfgItemID"]] = item["CfgItemInfo"]
                return envelope({})
            return envelope(resources[action])

        return request

    def test_browser_compatible_login_cookie_csrf_and_resource_order(self):
        calls = []
        result = poll_huawei_te_device(
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
        self.assertEqual(len(resource_calls), 7)
        self.assertEqual(result["deviceSettings"]["fields"]["http"]["status"], "read")
        self.assertEqual(result["deviceSettings"]["fields"]["telnet"]["status"], "read")
        self.assertTrue(all(json.loads(item["body"])["acCSRFToken"] == "SYNTHETIC-CSRF" for item in resource_calls))
        self.assertTrue(all(item["headers"].get("Cookie") == "HuaweiSession=synthetic" for item in calls[5:]))
        self.assertTrue(all(item["reject_unauthorized"] is False for item in calls))
        self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))
        self.assertNotIn("SYNTHETIC-CSRF", json.dumps(result))

    def test_te30_te40_te50_te60_share_one_guarded_contract(self):
        for index, model in enumerate(("TE30", "TE40", "TE50", "TE60")):
            calls = []
            result = poll_huawei_te_device(
                {"ip": f"192.0.2.{30 + index * 10}", "model": model, "allowInsecureTls": True},
                [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                {"request": self.success_request(calls, terminal_model=model), "nonce": lambda: "0.25"},
            )
            self.assertTrue(result["ok"], model)
            self.assertEqual(result["webBlocks"]["Device Info"]["Model"], model)
            self.assertEqual(result["siteName"]["status"], "protocol_required")
            self.assertEqual(result["vendorPolling"]["contract"], "huawei-te-web-cgi-v1")
            self.assertEqual(len([item for item in calls if "Web_RequestCertificate" in item["path"]]), 1)
            self.assertTrue(all(item["tls_profile"] is None for item in calls))

    def test_te40_reads_site_name_only_with_current_mailbox_markers(self):
        calls = []
        bundle = RESOURCE_MARKERS + " WEB_SubscribeMailboxDataAPI WEB_GetMailboxDataAPI"
        original = self.success_request(calls, overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}})

        def request(options):
            if "ActionID=WEB_SubscribeMailboxDataAPI" in options["path"]:
                calls.append(options)
                self.assertEqual(json.loads(options["body"])["aszMailboxItems"], ["sitename"])
                return envelope({})
            if "ActionID=WEB_GetMailboxDataAPI" in options["path"]:
                calls.append(options)
                return envelope({"state": {"sitename": "Synthetic Site"}})
            return original(options)

        result = poll_huawei_te_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": request},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"]["value"], "Synthetic Site")
        self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], "Synthetic Site")

    def test_te20_reads_site_name_only_when_legacy_bundle_exposes_mailbox(self):
        calls = []
        bundle = RESOURCE_MARKERS + " WEB_SubscribeMailboxDataAPI WEB_GetMailboxDataAPI"
        original = self.success_request(calls, terminal_model="Huawei TE20", preauth_legacy=True,
            overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}})

        def request(options):
            if "ActionID=WEB_SubscribeMailboxDataAPI" in options["path"]:
                calls.append(options)
                return envelope({})
            if "ActionID=WEB_GetMailboxDataAPI" in options["path"]:
                calls.append(options)
                return envelope({"state": {"sitename": "Synthetic TE20 Site"}})
            return original(options)

        result = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": request},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"]["value"], "Synthetic TE20 Site")
        self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], "Synthetic TE20 Site")
        self.assertTrue(all(item["tls_profile"] == TE20_TLS_PROFILE for item in calls))

    def test_te20_reads_site_name_from_confirmed_config_when_mailbox_subscription_absent(self):
        calls = []
        bundle = RESOURCE_MARKERS + " WEB_GetMailboxDataAPI 'sitename'"
        original = self.success_request(calls, terminal_model="Huawei TE20", preauth_legacy=True,
            overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}})

        def request(options):
            if "ActionID=WEB_GetCfgParamAPI" in options["path"] and json.loads(options["body"]).get("CfgIDString") == ["sitename"]:
                calls.append(options)
                return envelope({"CfgItemString": [{"CfgItemID": "sitename", "CfgItemInfo": "Synthetic TE20 Site"}]})
            return original(options)

        result = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": request},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"], {"status": "read", "value": "Synthetic TE20 Site", "source": "huawei_cfg_sitename"})
        self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], "Synthetic TE20 Site")
        self.assertIn('"siteName"', json.dumps(result))

    def test_te40_reads_site_name_from_confirmed_config_after_identity(self):
        calls = []
        bundle = RESOURCE_MARKERS + " WEB_GetMailBoxDataAPI 'sitename'"
        original = self.success_request(calls, overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}})

        def request(options):
            if "ActionID=WEB_GetCfgParamAPI" in options["path"] and json.loads(options["body"]).get("CfgIDString") == ["sitename"]:
                calls.append(options)
                return envelope({"CfgItemString": [{"CfgItemID": "sitename", "CfgItemInfo": "Synthetic TE40 Site"}]})
            return original(options)

        result = poll_huawei_te_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": request},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["siteName"], {"status": "read", "value": "Synthetic TE40 Site", "source": "huawei_cfg_sitename"})
        self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], "Synthetic TE40 Site")
        site_call = next(index for index, item in enumerate(calls) if json.loads(item.get("body") or "{}").get("CfgIDString") == ["sitename"])
        self.assertGreater(site_call, next(index for index, item in enumerate(calls) if "WEB_GetVersionInfoAPI" in item["path"]))
        self.assertEqual(json.loads(calls[site_call]["body"])["acCSRFToken"], "SYNTHETIC-CSRF")
        self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in calls))

    def test_te30_te50_te60_site_name_config_is_guarded_and_provisional(self):
        for model in ("TE30", "TE50", "TE60"):
            with self.subTest(model=model):
                calls = []
                bundle = RESOURCE_MARKERS + " 'sitename'"
                original = self.success_request(calls, terminal_model=model, overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}})

                def request(options):
                    if "ActionID=WEB_GetCfgParamAPI" in options["path"] and json.loads(options["body"]).get("CfgIDString") == ["sitename"]:
                        calls.append(options)
                        return envelope({"CfgItemString": [{"CfgItemID": "sitename", "CfgItemInfo": f"Synthetic {model} Site"}]})
                    return original(options)

                result = poll_huawei_te_device(
                    {"ip": "192.0.2.40", "model": model, "allowInsecureTls": True},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                    {"request": request},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["siteName"], {"status": "read", "value": f"Synthetic {model} Site", "source": "huawei_cfg_sitename"})
                self.assertEqual(result["webBlocks"]["Device Info"]["Site Name"], f"Synthetic {model} Site")
                site_call = next(index for index, item in enumerate(calls) if json.loads(item.get("body") or "{}").get("CfgIDString") == ["sitename"])
                self.assertGreater(site_call, next(index for index, item in enumerate(calls) if "WEB_GetVersionInfoAPI" in item["path"]))
                self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in calls))

    def test_te_family_site_name_config_fails_closed_without_markers_or_string_schema(self):
        for model, bundle, response in (
            ("TE40", RESOURCE_MARKERS, None),
            ("TE40", RESOURCE_MARKERS + " 'sitename'", {"CfgItemInt": [{"CfgItemID": "sitename", "CfgItemInfo": 1}]}),
            ("TE30", RESOURCE_MARKERS, None),
            ("TE50", RESOURCE_MARKERS + " 'sitename'", {"CfgItemString": [{"CfgItemID": "sitename", "CfgItemInfo": ""}]}),
            ("TE60", RESOURCE_MARKERS + " 'sitename'", {"CfgItemString": [{"CfgItemID": "sitename", "CfgItemInfo": 1}]}),
        ):
            with self.subTest(model=model, response=response):
                calls = []
                original = self.success_request(calls, terminal_model=model, overrides={"/system/web_all.js": {"status_code": 200, "headers": [], "body": bundle}})

                def request(options):
                    if "ActionID=WEB_GetCfgParamAPI" in options["path"] and json.loads(options["body"]).get("CfgIDString") == ["sitename"]:
                        calls.append(options)
                        return envelope(response)
                    return original(options)

                result = poll_huawei_te_device(
                    {"ip": "192.0.2.40", "model": model, "allowInsecureTls": True},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                    {"request": request},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["siteName"]["status"], "unavailable" if response else "protocol_required")
                self.assertNotIn("Site Name", result["webBlocks"]["Device Info"])
                site_calls = [item for item in calls if json.loads(item.get("body") or "{}").get("CfgIDString") == ["sitename"]]
                self.assertEqual(len(site_calls), 1 if response else 0)

    def test_te20_uses_exact_tls11_legacy_preauth_and_guarded_management_action(self):
        calls = []
        result = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(calls, terminal_model="Huawei TE20", preauth_legacy=True), "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION]},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["vendorPolling"]["contract"], "huawei-te20-web-cgi-v1")
        self.assertEqual(result["webBlocks"]["Device Info"]["Model"], "Huawei TE20")
        self.assertEqual(result["deviceSettings"]["fields"]["snmpV2"], {"status": "not_exposed", "value": None, "reason": "version_not_supported"})
        self.assertEqual(result["siteName"], {"status": "protocol_required", "value": None})
        self.assertTrue(all(item["tls_profile"] == TE20_TLS_PROFILE for item in calls))
        self.assertEqual(result["managementActions"][0]["status"], "applied")
        self.assertEqual(result["managementActions"][0]["after"], {"httpPort80": "disabled", "telnetPort23": "disabled"})
        self.assertEqual(len([item for item in calls if "WEB_GetCfgParamAPI" in item["path"]]), 2)
        self.assertEqual(len([item for item in calls if "WEB_SaveCfgParamAPI" in item["path"]]), 1)
        save_call = next(item for item in calls if "WEB_SaveCfgParamAPI" in item["path"])
        self.assertEqual(json.loads(save_call["body"])["CfgItemInt"], [
            {"CfgItemID": "enabletelnet", "CfgItemInfo": 0},
            {"CfgItemID": "enable_http", "CfgItemInfo": 0},
        ])
        context = _https_context(False, TE20_TLS_PROFILE)
        self.assertEqual(context.minimum_version, ssl.TLSVersion.TLSv1_1)
        self.assertEqual(context.maximum_version, ssl.TLSVersion.TLSv1_1)

    def test_te20_preauth_or_postauth_schema_drift_fails_closed(self):
        preauth_calls = []
        preauth = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(preauth_calls, overrides={"/action.cgi?ActionID=WEB_GetLoginInfo?rmd=0.5": envelope({"AlreadyLogin": 0, "ucTerType": 1, "ucCustomType": 0, "acCSRFToken": ""})}, terminal_model="Huawei TE20", preauth_legacy=True), "nonce": lambda: "0.5"},
        )
        self.assertEqual(preauth["safeError"], "preauth_contract_unconfirmed")
        self.assertFalse(any("Web_RequestCertificate" in item["path"] for item in preauth_calls))

        postauth_calls = []
        normal = self.success_request(postauth_calls, terminal_model="Huawei TE20", preauth_legacy=True)

        def mismatched_version(options):
            if "ActionID=WEB_GetVersionInfoAPI" in options["path"]:
                postauth_calls.append(options)
                return envelope(synthetic_resources("TE40")["WEB_GetVersionInfoAPI"])
            return normal(options)

        postauth = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": mismatched_version},
        )
        self.assertEqual(postauth["safeError"], "resource_schema_unconfirmed")

    def test_opt_in_te_family_action_reads_writes_exact_values_and_verifies_menu_state(self):
        for index, model in enumerate(("TE30", "TE40", "TE50", "TE60")):
            calls = []
            result = poll_huawei_te_device(
                {"ip": f"192.0.2.{30 + index * 10}", "model": model, "allowInsecureTls": True},
                [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
                {"request": self.success_request(calls, terminal_model=model), "nonce": lambda: "0.25", "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION], "management_settle": lambda: None},
            )
            self.assertTrue(result["ok"], model)
            self.assertEqual(result["managementActions"], [{
                "id": DISABLE_INSECURE_SERVICES_ACTION,
                "transport": "https/443",
                "changed": True,
                "writeAttempted": True,
                "status": "applied",
                "before": {"httpPort80": "enabled", "telnetPort23": "enabled"},
                "after": {"httpPort80": "disabled", "telnetPort23": "disabled"},
            }])
            config_calls = [item for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
            save_calls = [item for item in calls if "WEB_SaveCfgParamAPI" in item["path"]]
            self.assertEqual(len(config_calls), 2, model)
            self.assertEqual(len(save_calls), 1, model)
            payload = json.loads(save_calls[0]["body"])
            self.assertEqual(payload["CfgItemInt"], [
                {"CfgItemID": "enabletelnet", "CfgItemInfo": 0},
                {"CfgItemID": "enable_http", "CfgItemInfo": 1},
            ])
            self.assertEqual(payload["CfgItemString"], [])
            self.assertEqual(set(payload), {"CfgItemInt", "CfgItemString", "acCSRFToken"})
            self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))
            self.assertNotIn("SYNTHETIC-CSRF", json.dumps(result))

    def test_action_is_idempotent_and_not_run_without_opt_in(self):
        no_action_calls = []
        no_action = poll_huawei_te_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": self.success_request(no_action_calls)},
        )
        self.assertTrue(no_action["ok"])
        self.assertTrue(any("WEB_GetCfgParamAPI" in item["path"] for item in no_action_calls))
        self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in no_action_calls))
        self.assertEqual(no_action["deviceSettings"]["fields"]["telnet"]["status"], "read")

        compliant_calls = []
        compliant = poll_huawei_te_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": self.success_request(compliant_calls, configuration={"enabletelnet": 0, "enable_http": 1}), "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION]},
        )
        self.assertTrue(compliant["ok"])
        self.assertEqual(compliant["managementActions"][0]["status"], "already_compliant")
        self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in compliant_calls))

        te20_calls = []
        te20_compliant = poll_huawei_te_device(
            {"ip": "192.0.2.20", "model": "TE20", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {
                "request": self.success_request(te20_calls, terminal_model="Huawei TE20", configuration={"enabletelnet": 0, "enable_http": 0}, preauth_legacy=True),
                "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION],
            },
        )
        self.assertTrue(te20_compliant["ok"])
        self.assertEqual(te20_compliant["managementActions"][0]["status"], "already_compliant")
        self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in te20_calls))

    def test_failed_verification_is_visible_and_never_reopens_services(self):
        calls = []
        result = poll_huawei_te_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": self.success_request(calls, persist_save=False), "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION], "management_settle": lambda: None},
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["failedStage"], "management_action")
        self.assertEqual(result["safeError"], "configuration_verification_failed")
        self.assertEqual(result["managementActions"][0]["status"], "failed")
        save_calls = [item for item in calls if "WEB_SaveCfgParamAPI" in item["path"]]
        self.assertEqual(len(save_calls), 1)
        self.assertEqual(json.loads(save_calls[0]["body"])["CfgItemInt"][0]["CfgItemInfo"], 0)

    def test_management_contract_and_configuration_schema_drift_never_write(self):
        for model in ("TE20", "TE30", "TE50", "TE60"):
            terminal_model = "Huawei TE20" if model == "TE20" else model
            preauth_legacy = model == "TE20"
            missing_marker_calls = []
            missing_marker = poll_huawei_te_device(
                {"ip": "192.0.2.80", "model": model, "allowInsecureTls": True},
                [{"username": "u", "password": "p"}],
                {
                    "request": self.success_request(missing_marker_calls, {"/system/web_all.js": {"status_code": 200, "headers": [], "body": "WEB_GetProductEsnAPI WEB_GetSystemMacAddrAPI WEB_GetVersionInfoAPI WEB_GetTermSpecsInfoAPI WEB_GetSysLocalTimeAPI WEB_GetDhcpIPInfoAPI"}}, terminal_model=terminal_model, preauth_legacy=preauth_legacy),
                    "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION],
                },
            )
            self.assertFalse(missing_marker["ok"], model)
            self.assertEqual(missing_marker["safeError"], "management_contract_unconfirmed")
            self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in missing_marker_calls), model)

            schema_calls = []
            schema = poll_huawei_te_device(
                {"ip": "192.0.2.81", "model": model, "allowInsecureTls": True},
                [{"username": "u", "password": "p"}],
                {
                    "request": self.success_request(schema_calls, {"/action.cgi?ActionID=WEB_GetCfgParamAPI?rmd=0.5": envelope({"CfgItemInt": [{"CfgItemID": "enable_http", "CfgItemInfo": 0}]})}, terminal_model=terminal_model, preauth_legacy=preauth_legacy),
                    "nonce": lambda: "0.5",
                    "management_tasks": [DISABLE_INSECURE_SERVICES_ACTION],
                },
            )
            self.assertFalse(schema["ok"], model)
            self.assertEqual(schema["safeError"], "configuration_schema_unconfirmed")
            self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in schema_calls), model)

    def test_planned_model_is_checked_before_credentials_and_after_version(self):
        pre_auth_calls = []
        pre_auth_result = poll_huawei_te_device(
            {"ip": "192.0.2.50", "model": "TE50", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": self.success_request(pre_auth_calls, terminal_model="TE40")},
        )
        self.assertEqual(pre_auth_result["safeError"], "target_model_mismatch")
        self.assertFalse(any("Web_RequestCertificate" in item["path"] for item in pre_auth_calls))

        post_auth_calls = []
        normal = self.success_request(post_auth_calls, terminal_model="TE50")

        def mismatched_version(options):
            if "ActionID=WEB_GetVersionInfoAPI" in options["path"]:
                post_auth_calls.append(options)
                return envelope(synthetic_resources("TE40")["WEB_GetVersionInfoAPI"])
            return normal(options)

        post_auth_result = poll_huawei_te_device(
            {"ip": "192.0.2.50", "model": "TE50", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": mismatched_version},
        )
        self.assertEqual(post_auth_result["safeError"], "resource_schema_unconfirmed")

        blocked_calls = []
        blocked = poll_huawei_te_device(
            {"ip": "192.0.2.70", "model": "TX50", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": lambda options: blocked_calls.append(options)},
        )
        self.assertEqual(blocked["safeError"], "invalid_or_unsupported_target")
        self.assertEqual(blocked_calls, [])

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

        result = poll_huawei_te_device(
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

        result = poll_huawei_te_device(
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
        active_result = poll_huawei_te_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": active, "nonce": lambda: "0.5"},
        )
        self.assertEqual(active_result["safeError"], "interactive_session_active")
        self.assertFalse(any("WEB_Logout" in item["path"] for item in active_calls))

        unknown_calls = []
        unknown = self.success_request(unknown_calls, {"/system/login/login.js": {"status_code": 200, "headers": [], "body": "unknown"}})
        unknown_result = poll_huawei_te_device(
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
            result = poll_huawei_te_device(
                {"ip": "192.0.2.40", "model": "TE40"},
                [{"username": "u", "password": "p"}],
                {"request": lambda _options, current=error: (_ for _ in ()).throw(current)},
            )
            self.assertEqual(result["safeError"], expected)

        calls = []
        malformed = self.success_request(calls, {
            "/action.cgi?ActionID=WEB_GetProductEsnAPI?rmd=0.5": {"status_code": 200, "headers": [], "body": "not-json"}
        })
        result = poll_huawei_te_device(
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
        drift_result = poll_huawei_te_device(
            {"ip": "192.0.2.40", "model": "TE40", "allowInsecureTls": True},
            [{"username": "u", "password": "p"}],
            {"request": drift, "nonce": lambda: "0.75"},
        )
        self.assertEqual(drift_result["safeError"], "resource_schema_unconfirmed")


if __name__ == "__main__":
    unittest.main()
