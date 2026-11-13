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


HTTP_BUNDLE = current_bundle() + ' CfgIDString:["enable_http"] RGenable_http:{id:"enable_http",className:"radio",data:[{text:"Enable",value:1},{text:"Disable",value:2}]}'
TELNET_BUNDLE = current_bundle() + ' CfgIDString:["enabletelnet","enable_ssh","szCfgPwd"] RGenabletelnet:{id:"enabletelnet",className:"radio",data:[{text:"Enable",value:1},{text:"Disable",value:2}]}'
SSH_BUNDLE = current_bundle() + ' CfgIDString:["enabletelnet","enable_ssh","szCfgPwd"] RGenable_ssh:{id:"enable_ssh",className:"radio",data:[{text:"Enable",value:1},{text:"Disable",value:2}]}'
ANSWER_BUNDLE = current_bundle() + ' CfgIDString:["autoreply","isWifiPriority"] SelectAutoreply:{id:"autoreply",label:"mode",style:{},value:1,options:[{value:0,text:"Auto"},{value:1,text:"Manual"}]}'
NTP_BUNDLE = current_bundle() + ' CfgIDString:["synSerTime","ntpGetMode","timeServer","emailSMTPAddr"] RadioGroupEnableNTP:{id:"synSerTime",className:"radio",data:[{text:"Enable",value:1},{text:"Disable",value:0}]} RGntpGetMode:{id:"ntpGetMode",className:"radio",data:[{text:"Auto",value:0},{text:"Manual",value:1}]} TextFieldNTPSvrAddr:{id:"timeServer"'
WIFI_BUNDLE = current_bundle() + ' reqGetWifiStatModeUrl="action.cgi?ActionID=WEB_GetWifiStatModeAPI" this.post(this.reqGetWifiStatModeUrl,{},{}).then getCurrentWifiMode=function RGEnableSta RGEnableAp'
SERVER_TYPE_BUNDLE = current_bundle() + ' cloudsetPanelObjRequest={CfgIDString:["cloudType","cloudCfgType","HwCloudName"]} SelCloudType:{id:"cloudType" Y=2,K=5,J=6,Q=7,Z=8,$=10,ee=11 value:Q,text:a.resName.TXT_CONFIG_SIP_VIDEO_REQUEST_MANUAL'
SLEEP_BUNDLE = current_bundle() + ' powerMagParams={CfgIDString:["suppotReboot","sleepTime","enable_wol","autoReboot","sleepCloseAPP","autoRebootVal","faceWakeUp"]} SelSleepDuration:{id:"sleepTime" value:0,text:a.props.resName.TXT_VCT_NO_SLEEP value:10,text:a.props.resName.TXT_CFG_SITENAME_TIME_10_MINUTE_SLEEP'
WOL_BUNDLE = SLEEP_BUNDLE + ' RGNetworkWakeUp:{id:"enable_wol",className:"radio",data:[{text:"Enable",value:1},{text:"Disable",value:0}]}'
FULL_POWER_BUNDLE = WOL_BUNDLE + ' RGFaceWakeUp:{id:"faceWakeUp",className:"radio",data:[{text:"Enable",value:1},{text:"Disable",value:0}]} RGSleepClean:{id:"sleepCloseAPP",className:"radio",data:[{text:"Enable",value:1},{text:"Disable",value:0}]} RGAutoReboot:{id:"autoReboot",className:"radio",data:[{text:"Enable",value:1},{text:"Disable",value:0}]}'
ALL_SETTINGS_BUNDLE = " ".join((HTTP_BUNDLE, TELNET_BUNDLE, SSH_BUNDLE, ANSWER_BUNDLE,
                                NTP_BUNDLE, WIFI_BUNDLE, SERVER_TYPE_BUNDLE, FULL_POWER_BUNDLE))


def fake_request(calls, model="Bar 300", code=18, *, bundle=None, site_name="Synthetic Site", http_code=0, telnet_code=0, ssh_code=1, answer_code=0, ntp_data=None, wifi_mode=0, server_type_code=7, sleep_code=10, wol_code=0, face_code=0, clean_code=0, restart_code=0, postauth_model=None, timeout_action=None, certificate_success=True, root_error=None):
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
            if payload.get("CfgIDString") == ["enable_http"]:
                return envelope({"enable_http": http_code})
            if payload.get("CfgIDString") == ["enabletelnet"]:
                return envelope({"enabletelnet": telnet_code})
            if payload.get("CfgIDString") == ["enable_ssh"]:
                return envelope({"enable_ssh": ssh_code})
            if payload.get("CfgIDString") == ["autoreply"]:
                return envelope({"autoreply": answer_code})
            if payload.get("CfgIDString") == ["synSerTime", "ntpGetMode", "timeServer"]:
                return envelope({"synSerTime": 1, "ntpGetMode": 1, "timeServer": "ntp.example.test"} if ntp_data is None else ntp_data)
            if payload.get("CfgIDString") == ["cloudType"]:
                return envelope({"cloudType": server_type_code, "AcsPwd": "SYNTHETIC-PRIVATE-PASSWORD"})
            if payload.get("CfgIDString") == ["sleepTime"]:
                return envelope({"sleepTime": sleep_code, "admin_user": "SYNTHETIC-PRIVATE-USER"})
            if payload.get("CfgIDString") == ["enable_wol"]:
                return envelope({"enable_wol": wol_code, "admin_user": "SYNTHETIC-PRIVATE-USER"})
            if payload.get("CfgIDString") == ["faceWakeUp"]:
                return envelope({"faceWakeUp": face_code, "admin_user": "SYNTHETIC-PRIVATE-USER"})
            if payload.get("CfgIDString") == ["sleepCloseAPP"]:
                return envelope({"sleepCloseAPP": clean_code, "admin_user": "SYNTHETIC-PRIVATE-USER"})
            if payload.get("CfgIDString") == ["autoReboot"]:
                return envelope({"autoReboot": restart_code, "admin_user": "SYNTHETIC-PRIVATE-USER"})
            if payload.get("CfgIDString") != ["sitename"]:
                raise AssertionError("Site name read must request only sitename")
            return envelope({"sitename": site_name})
        if action == "WEB_GetWifiStatModeAPI":
            return envelope({"ucWifiMode": wifi_mode, "szMacAddr": "02:00:00:00:00:09", "aszSSID": "SYNTHETIC-PRIVATE-SSID"})
        if action == "WEB_Logout":
            return envelope({})
        raise AssertionError("Unexpected CGI action")
    return request


class Huawei300Tests(unittest.TestCase):
    def test_box300_and_box600_shared_readers_remain_exact_and_provisional(self):
        for poll, model, code, _contract in MODEL_CASES[1:]:
            with self.subTest(model=model):
                calls = []
                result = poll(
                    {"ip": "192.0.2.31", "model": model},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, model=model, code=code, bundle=ALL_SETTINGS_BUNDLE),
                     "allow_insecure_tls": True},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["deviceSettings"]["validationStatus"], "provisional_user_validation")
                for key in ("http", "telnet", "ssh", "autoAnswer", "ntp", "wifi", "autoUpdate", "powerManagement"):
                    field = result["deviceSettings"]["fields"][key]
                    self.assertEqual(field["status"], "read", key)
                    self.assertEqual(field["validationStatus"], "provisional_user_validation", key)
                self.assertEqual(result["deviceSettings"]["fields"]["snmpV2"]["status"], "not_exposed")
                self.assertNotIn("reason", result["deviceSettings"]["fields"]["snmpV2"])
                self.assertEqual(result["deviceSettings"]["fields"]["powerManagement"]["value"]["sleepTimeCode"], 10)
                self.assertTrue(all(item["method"] in ("GET", "POST") for item in calls))
                self.assertFalse(any("WEB_SaveCfgParamAPI" in item["path"] for item in calls))
                self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))
                calls = []
                mismatch = poll(
                    {"ip": "192.0.2.31", "model": model},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, model=model, code=code, bundle=ALL_SETTINGS_BUNDLE,
                                             postauth_model="Bar 300"), "allow_insecure_tls": True},
                )
                self.assertFalse(mismatch["ok"])
                self.assertFalse(any("WEB_GetCfgParamAPI" in item["path"] for item in calls))

    def test_exact_bar300_remaining_power_switches_are_separate_and_bounded(self):
        for code, expected in ((0, False), (1, True)):
            with self.subTest(code=code):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=FULL_POWER_BUNDLE, face_code=code,
                                             clean_code=code, restart_code=code), "allow_insecure_tls": True},
                )
                power = result["deviceSettings"]["fields"]["powerManagement"]
                for name in ("faceWakeEnabled", "clearMemoryInSleepEnabled", "automaticRestartEnabled"):
                    self.assertEqual(power["value"][name], expected)
                self.assertEqual(power["unconfirmedFields"], ["automaticRestartIntervalDays"] if expected else [])
                reads = [json.loads(item["body"])["CfgIDString"] for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
                self.assertEqual(reads, [["sitename"], ["sleepTime"], ["enable_wol"],
                                         ["faceWakeUp"], ["sleepCloseAPP"], ["autoReboot"]])
                self.assertNotIn("SYNTHETIC-PRIVATE-USER", json.dumps(result))
        calls = []
        invalid = poll_huawei_bar300_device(
            {"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, bundle=FULL_POWER_BUNDLE, face_code=2), "allow_insecure_tls": True},
        )
        field = invalid["deviceSettings"]["fields"]["powerManagement"]
        self.assertNotIn("faceWakeEnabled", field["value"])
        self.assertIn("faceWake", field["unconfirmedFields"])
        self.assertEqual(field["value"]["clearMemoryInSleepEnabled"], False)

    def test_exact_bar300_wol_is_optional_narrow_power_fact(self):
        for code, expected in ((0, False), (1, True), (2, None)):
            with self.subTest(code=code):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=WOL_BUNDLE, wol_code=code), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["powerManagement"]
                self.assertEqual(field["value"]["sleepTimeCode"], 10)
                if expected is None:
                    self.assertNotIn("networkWakeEnabled", field["value"])
                    self.assertIn("networkWake", field["unconfirmedFields"])
                else:
                    self.assertEqual(field["value"]["networkWakeEnabled"], expected)
                    self.assertNotIn("networkWake", field["unconfirmedFields"])
                reads = [json.loads(item["body"])["CfgIDString"] for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
                self.assertEqual(reads, [["sitename"], ["sleepTime"], ["enable_wol"]])
                self.assertNotIn("SYNTHETIC-PRIVATE-USER", json.dumps(result))

    def test_exact_bar300_sleep_is_narrow_and_partial(self):
        for code, expected in ((0, "never"), (1, "interval"), (5, "interval"), (10, "interval"),
                               (15, "interval"), (30, "interval"), (60, "interval"), (2, None)):
            with self.subTest(code=code):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=SLEEP_BUNDLE, sleep_code=code), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["powerManagement"]
                self.assertEqual(field["status"], "read" if expected else "unavailable")
                if expected:
                    self.assertEqual(field["value"], {"sleepTimeCode": code, "sleepMode": expected})
                    self.assertIn("automaticRestart", field["unconfirmedFields"])
                reads = [json.loads(item["body"])["CfgIDString"] for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
                self.assertEqual(reads, [["sitename"], ["sleepTime"]])
                self.assertNotIn("SYNTHETIC-PRIVATE-USER", json.dumps(result))
        calls = []
        box = poll_huawei_box300_device(
            {"ip": "192.0.2.31", "model": "Box 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, model="Box 300", code=19, bundle=SLEEP_BUNDLE), "allow_insecure_tls": True},
        )
        self.assertEqual(box["deviceSettings"]["fields"]["powerManagement"]["status"], "read")
        self.assertEqual(box["deviceSettings"]["fields"]["powerManagement"]["validationStatus"], "provisional_user_validation")
        self.assertEqual([json.loads(item["body"])["CfgIDString"] for item in calls if "WEB_GetCfgParamAPI" in item["path"]], [["sitename"], ["sleepTime"]])

    def test_exact_bar300_server_type_audit_is_narrow_and_model_gated(self):
        for code, expected in ((7, "disabled"), (2, "enabled"), (5, "enabled"), (6, "enabled"),
                               (8, "enabled"), (10, "enabled"), (11, "enabled"), (3, None)):
            with self.subTest(code=code):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=SERVER_TYPE_BUNDLE, server_type_code=code), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["autoUpdate"]
                self.assertEqual(field["status"], "read" if expected else "unavailable")
                self.assertEqual(field["value"], expected)
                if expected:
                    self.assertEqual(field["serverTypeCode"], code)
                    self.assertEqual(field["meaning"], "firmware_update_capability")
                reads = [json.loads(item["body"])["CfgIDString"] for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
                self.assertEqual(reads, [["sitename"], ["cloudType"]])
                self.assertNotIn("SYNTHETIC-PRIVATE-PASSWORD", json.dumps(result))
        calls = []
        box = poll_huawei_box300_device(
            {"ip": "192.0.2.31", "model": "Box 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, model="Box 300", code=19, bundle=SERVER_TYPE_BUNDLE), "allow_insecure_tls": True},
        )
        self.assertEqual(box["deviceSettings"]["fields"]["autoUpdate"]["status"], "read")
        self.assertEqual(box["deviceSettings"]["fields"]["autoUpdate"]["validationStatus"], "provisional_user_validation")
        self.assertEqual([json.loads(item["body"])["CfgIDString"] for item in calls if "WEB_GetCfgParamAPI" in item["path"]], [["sitename"], ["cloudType"]])
        calls = []
        drift = poll_huawei_bar300_device(
            {"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, bundle=SERVER_TYPE_BUNDLE.replace("Q=7", "Q=9")), "allow_insecure_tls": True},
        )
        self.assertEqual(drift["deviceSettings"]["fields"]["autoUpdate"]["status"], "protocol_required")
        self.assertEqual([json.loads(item["body"])["CfgIDString"] for item in calls if "WEB_GetCfgParamAPI" in item["path"]], [["sitename"]])

    def test_exact_bar300_wifi_mode_is_separate_read_only_status(self):
        for mode, client, access_point in ((0, False, False), (1, False, True), (2, True, False), (3, True, True)):
            with self.subTest(mode=mode):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=WIFI_BUNDLE, wifi_mode=mode), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["wifi"]
                self.assertEqual(field["status"], "read")
                self.assertEqual(field["value"], {"modeCode": mode, "clientEnabled": client, "accessPointEnabled": access_point})
                status_call = [call for call in calls if "WEB_GetWifiStatModeAPI" in call["path"]]
                self.assertEqual(len(status_call), 1)
                self.assertEqual(json.loads(status_call[0]["body"]), {"acCSRFToken": "SYNTHETIC-CSRF"})
                self.assertFalse(any("WEB_GetWifiCfgAPI" in call["path"] for call in calls))
                self.assertNotIn("SYNTHETIC-PRIVATE-SSID", json.dumps(result))
        calls = []
        invalid = poll_huawei_bar300_device(
            {"ip": "192.0.2.31", "model": "Bar 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, bundle=WIFI_BUNDLE, wifi_mode=4), "allow_insecure_tls": True},
        )
        self.assertEqual(invalid["deviceSettings"]["fields"]["wifi"]["status"], "unavailable")
        calls = []
        box = poll_huawei_box300_device(
            {"ip": "192.0.2.31", "model": "Box 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, model="Box 300", code=19, bundle=WIFI_BUNDLE), "allow_insecure_tls": True},
        )
        self.assertEqual(box["deviceSettings"]["fields"]["wifi"]["status"], "read")
        self.assertEqual(box["deviceSettings"]["fields"]["wifi"]["validationStatus"], "provisional_user_validation")
        self.assertEqual(sum("WEB_GetWifiStatModeAPI" in call["path"] for call in calls), 1)

    def test_exact_bar300_ntp_read_is_narrow_and_schema_checked(self):
        cases = (
            ({"synSerTime": 1, "ntpGetMode": 1, "timeServer": "ntp.example.test"}, "read", True, "manual"),
            ({"synSerTime": 0, "ntpGetMode": 0, "timeServer": ""}, "read", False, "automatic"),
            ({"synSerTime": 1, "ntpGetMode": 2, "timeServer": "ntp.example.test"}, "unavailable", None, None),
            ({"synSerTime": 1, "ntpGetMode": 1, "timeServer": ""}, "unavailable", None, None),
        )
        for data, status, enabled, mode in cases:
            with self.subTest(data=data):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=NTP_BUNDLE, ntp_data=data), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["ntp"]
                self.assertEqual(field["status"], status)
                if status == "read":
                    self.assertEqual(field["value"]["enabled"], enabled)
                    self.assertEqual(field["value"]["mode"], mode)
                reads = [json.loads(item["body"]) for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
                self.assertEqual([read["CfgIDString"] for read in reads], [["sitename"], ["synSerTime", "ntpGetMode", "timeServer"]])
                self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))
        calls = []
        box = poll_huawei_box300_device(
            {"ip": "192.0.2.31", "model": "Box 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, model="Box 300", code=19, bundle=NTP_BUNDLE), "allow_insecure_tls": True},
        )
        self.assertEqual(box["deviceSettings"]["fields"]["ntp"]["status"], "read")
        self.assertEqual(box["deviceSettings"]["fields"]["ntp"]["validationStatus"], "provisional_user_validation")

    def test_exact_bar300_auto_answer_uses_confirmed_cycle_and_narrow_read(self):
        for code, expected in ((0, "enabled"), (1, "disabled"), (2, None)):
            with self.subTest(code=code):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=ANSWER_BUNDLE, answer_code=code), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["autoAnswer"]
                self.assertEqual(field["status"], "read" if expected else "unavailable")
                self.assertEqual(field["value"], expected)
                reads = [json.loads(item["body"]) for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
                self.assertEqual([read["CfgIDString"] for read in reads], [["sitename"], ["autoreply"]])
                self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))
        calls = []
        box = poll_huawei_box300_device(
            {"ip": "192.0.2.31", "model": "Box 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, model="Box 300", code=19, bundle=ANSWER_BUNDLE), "allow_insecure_tls": True},
        )
        self.assertEqual(box["deviceSettings"]["fields"]["autoAnswer"]["status"], "read")
        self.assertEqual(box["deviceSettings"]["fields"]["autoAnswer"]["validationStatus"], "provisional_user_validation")

    def test_exact_bar300_ssh_read_is_narrow_and_model_gated(self):
        for code, expected in ((1, "enabled"), (0, "disabled"), (2, "disabled"), (3, None)):
            with self.subTest(code=code):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=SSH_BUNDLE, ssh_code=code), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["ssh"]
                self.assertEqual(field["status"], "read" if expected else "unavailable")
                self.assertEqual(field["value"], expected)
                reads = [json.loads(item["body"]) for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
                self.assertEqual([read["CfgIDString"] for read in reads], [["sitename"], ["enable_ssh"]])
                self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))
        calls = []
        box = poll_huawei_box300_device(
            {"ip": "192.0.2.31", "model": "Box 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, model="Box 300", code=19, bundle=SSH_BUNDLE), "allow_insecure_tls": True},
        )
        self.assertEqual(box["deviceSettings"]["fields"]["ssh"]["status"], "read")
        self.assertEqual(box["deviceSettings"]["fields"]["ssh"]["validationStatus"], "provisional_user_validation")

    def test_exact_bar300_telnet_read_is_narrow_and_model_gated(self):
        for code, expected in ((0, "disabled"), (1, "enabled"), (2, "disabled"), (3, None)):
            with self.subTest(code=code):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=TELNET_BUNDLE, telnet_code=code), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["telnet"]
                self.assertEqual(field["status"], "read" if expected else "unavailable")
                self.assertEqual(field["value"], expected)
                reads = [json.loads(item["body"]) for item in calls if "WEB_GetCfgParamAPI" in item["path"]]
                self.assertEqual([read["CfgIDString"] for read in reads], [["sitename"], ["enabletelnet"]])
                self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))
        calls = []
        box = poll_huawei_box300_device(
            {"ip": "192.0.2.31", "model": "Box 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, model="Box 300", code=19, bundle=TELNET_BUNDLE), "allow_insecure_tls": True},
        )
        self.assertEqual(box["deviceSettings"]["fields"]["telnet"]["status"], "read")
        self.assertEqual(box["deviceSettings"]["fields"]["telnet"]["validationStatus"], "provisional_user_validation")

    def test_exact_bar300_http_read_uses_confirmed_bundle_and_schema(self):
        for code, expected in ((0, "disabled"), (1, "enabled"), (2, "disabled"), (3, None)):
            with self.subTest(code=code):
                calls = []
                result = poll_huawei_bar300_device(
                    {"ip": "192.0.2.31", "model": "Bar 300"},
                    [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
                    {"request": fake_request(calls, bundle=HTTP_BUNDLE, http_code=code), "allow_insecure_tls": True},
                )
                field = result["deviceSettings"]["fields"]["http"]
                self.assertEqual(field["status"], "read" if expected else "unavailable")
                self.assertEqual(field["value"], expected)
                self.assertEqual(sum('WEB_GetCfgParamAPI' in item["path"] for item in calls), 2)
                self.assertNotIn("SYNTHETIC-SECRET", json.dumps(result))
        calls = []
        result = poll_huawei_box300_device(
            {"ip": "192.0.2.31", "model": "Box 300"},
            [{"username": "synthetic-user", "password": "SYNTHETIC-SECRET"}],
            {"request": fake_request(calls, model="Box 300", code=19, bundle=HTTP_BUNDLE), "allow_insecure_tls": True},
        )
        self.assertEqual(result["deviceSettings"]["fields"]["http"]["status"], "read")
        self.assertEqual(result["deviceSettings"]["fields"]["http"]["validationStatus"], "provisional_user_validation")
        self.assertEqual(sum('WEB_GetCfgParamAPI' in item["path"] for item in calls), 2)

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
        self.assertEqual(result["deviceSettings"]["fields"]["http"]["status"], "protocol_required")
        self.assertEqual(result["deviceSettings"]["fields"]["snmpV2"]["status"], "not_exposed")
        self.assertEqual(result["deviceSettings"]["fields"]["snmpV2"]["reason"], "version_not_supported")
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
                self.assertNotIn("reason", result["deviceSettings"]["fields"]["snmpV2"])

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
