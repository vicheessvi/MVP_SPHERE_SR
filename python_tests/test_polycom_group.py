"""Synthetic, secret-free contracts for the Polycom Group web adapter."""

from __future__ import annotations

import gzip
import io
import json
import unittest

from mvp_runtime.adapters.polycom_group import (
    PolycomContractError,
    _validate_polycom_log_response,
    _read_exact_config_value,
    _set_polycom_answer_mode,
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
TELNET_BUNDLE_MARKERS = ' '.join((
    'SECURITY_REMOTEACCESS_TELNET_ENABLED:"security.remoteaccess.telnet.enabled"',
    'name:"enableTelnetAccess",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_TELNET_ENABLED',
))
HTTP_BUNDLE_MARKERS = ' '.join((
    'SECURITY_REMOTEACCESS_WEB_ENABLED:"security.remoteaccess.web.enabled"',
    'SECURITY_REMOTEACCESS_WEB_HTTPSONLY:"security.remoteaccess.web.httpsonly"',
    'SECURITY_REMOTEACCESS_WEB_HTTPPORT:"security.remoteaccess.web.httpport"',
    'name:"enableWebAccess",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_WEB_ENABLED',
    'name:"httpsOnly",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_WEB_HTTPSONLY',
    'name:"webAccessPort",type:"int",varsName:configfqnames.SECURITY_REMOTEACCESS_WEB_HTTPPORT',
))
SNMP_BUNDLE_MARKERS = ' '.join((
    'MANAGEMENT_SNMP_ENABLED:"management.snmp.enabled"',
    'MANAGEMENT_SNMP_VERSIONTWO:"management.snmp.versiontwo"',
    'name:"enableSNMPAccess",type:"boolean",varsName:configfqnames.MANAGEMENT_SNMP_ENABLED',
    'varsName:configfqnames.MANAGEMENT_SNMP_VERSIONTWO',
))
AUTO_UPDATE_BUNDLE_MARKERS = ' '.join((
    'SOFTUPDATE_POLLINGENABLED:"softupdate.pollingenabled"',
    'name:"enableAutomaticUpdates",type:"boolean",varsName:configfqnames.SOFTUPDATE_POLLINGENABLED',
))
AUTO_ANSWER_BUNDLE_MARKERS = ' '.join((
    'COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERSINGLECALL:"comm.callsetting.callfeatures.autoanswer.answersinglecall"',
    'COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERMULTIPOINTCALL:"comm.callsetting.callfeatures.autoanswer.answermultipointcall"',
    'name:"autoAnswerSingleCall",type:"string",varsName:configfqnames.COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERSINGLECALL',
    'name:"autoAnswerMultiPointCall",type:"string",varsName:configfqnames.COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERMULTIPOINTCALL',
))
AUTO_ANSWER_WRITE_MARKERS = ' '.join((
    'processJsonWriteValue:function',
    'generateWriteJsonData:function',
    'setConfiguration:function(g,d,e,a){var c={vars:[{name:a.name,value:a.value}]};',
    'g.result!=="NOERROR"',
))
NTP_BUNDLE_MARKERS = ' '.join((
    'TIME_TIMESERVER_MODE:"time.timeserver.mode"',
    'TIME_TIMESERVER_ADDRESS:"time.timeserver.address"',
    'name:"timeServerMode",type:"string",varsName:configfqnames.TIME_TIMESERVER_MODE',
    'name:"timeServerAddress",type:"string",varsName:configfqnames.TIME_TIMESERVER_ADDRESS',
    'name:"secondaryTimeServerAddress",type:"string",varsName:configfqnames.TIME_TIMESERVER_ADDRESS,instanceName:"1"',
    'a[b-1]+=c.instanceName',
))
SSH_LEGACY_BUNDLE_MARKERS = ' '.join((
    'SECURITY_REMOTEACCESS_SSH_ENABLED:"security.remoteaccess.ssh.enabled"',
    'name:"enableSshAccess",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_SSH_ENABLED',
))
SSH_MENU_REFERENCE = 'baseDataUrl:"data/settingdata.json"'
SSH_PRIMARY_SYNTHETIC_NAME = "security.synthetic.sshservice.enabled"
SSH_PRIMARY_SYNTHETIC_BUNDLE = ' '.join((
    'SYNTHETIC_SSH_SERVICE_ENABLED:"security.synthetic.sshservice.enabled"',
    'name:"syntheticSshService",type:"boolean",varsName:configfqnames.SYNTHETIC_SSH_SERVICE_ENABLED',
))
SSH_LEGACY_MENU = {"viewData": [{"viewclass": "Draco.view.adminsettings.security.GlobalSecurityAccessView",
                                "items": [{"name": "enableSshAccess", "label": "ENABLE_LEGACY_API_OVER_SSH"}]}]}
SSH_PRIMARY_MENU = {"viewData": [{"viewclass": "Draco.view.adminsettings.security.GlobalSecurityAccessView",
                                 "items": [{"name": "syntheticSshService", "label": "ENABLE_SSH_SERVICE"},
                                           {"name": "enableSshAccess", "label": "ENABLE_LEGACY_API_OVER_SSH"}]}]}
POWER_BUTTON_BUNDLE_MARKERS = ' '.join((
    'SYSTEM_REMOTE_HANGUPKEYLONGPRESSFUNC:"system.remote.hangupkeylongpressfunc"',
    'addIndividualStoreVar("hangupButtonLongPress","SYSTEM_REMOTE_HANGUPKEYLONGPRESSFUNC")',
))
MAC_NAME = "system.network.wired.ethernet.macaddress"
TELNET_NAME = "security.remoteaccess.telnet.enabled"
HTTP_WEB_NAME = "security.remoteaccess.web.enabled"
HTTP_ONLY_NAME = "security.remoteaccess.web.httpsonly"
HTTP_PORT_NAME = "security.remoteaccess.web.httpport"
SNMP_SERVICE_NAME = "management.snmp.enabled"
SNMP_V2_NAME = "management.snmp.versiontwo"
AUTO_UPDATE_NAME = "softupdate.pollingenabled"
AUTO_ANSWER_SINGLE_NAME = "comm.callsetting.callfeatures.autoanswer.answersinglecall"
AUTO_ANSWER_MULTI_NAME = "comm.callsetting.callfeatures.autoanswer.answermultipointcall"
NTP_MODE_NAME = "time.timeserver.mode"
NTP_PRIMARY_NAME = "time.timeserver.address"
NTP_SECONDARY_NAME = "time.timeserver.address1"
SSH_LEGACY_NAME = "security.remoteaccess.ssh.enabled"
POWER_BUTTON_NAME = "system.remote.hangupkeylongpressfunc"
FULL_SETTINGS_BUNDLE = " ".join((MAIN_BUNDLE, TELNET_BUNDLE_MARKERS, HTTP_BUNDLE_MARKERS,
                                 SNMP_BUNDLE_MARKERS, AUTO_UPDATE_BUNDLE_MARKERS, AUTO_ANSWER_BUNDLE_MARKERS,
                                 NTP_BUNDLE_MARKERS, SSH_LEGACY_BUNDLE_MARKERS, POWER_BUTTON_BUNDLE_MARKERS))
FULL_SETTING_VALUES = {
    TELNET_NAME: "False", HTTP_WEB_NAME: "True", HTTP_ONLY_NAME: "False", HTTP_PORT_NAME: "80",
    SNMP_SERVICE_NAME: "False", SNMP_V2_NAME: "True", AUTO_UPDATE_NAME: "False",
    AUTO_ANSWER_SINGLE_NAME: "Yes", AUTO_ANSWER_MULTI_NAME: "No",
    NTP_MODE_NAME: "Manual", NTP_PRIMARY_NAME: "ntp1.example.test", NTP_SECONDARY_NAME: "",
    SSH_LEGACY_NAME: "True", POWER_BUTTON_NAME: "Power_Off",
}
LOG_BUNDLE = MAIN_BUNDLE + ' createDownloadLogsClickHandler:function(){window.open("/a_getsyslog.cgi","_self")}'
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
    def test_polycom_log_response_requires_tgz_gzip_and_bounded_length(self):
        headers = [("Content-Length", "1024"), ("Content-Disposition", 'attachment; filename="systemlog.tgz"')]
        self.assertEqual(_validate_polycom_log_response(200, headers, b"\x1f\x8b\x08synthetic"), 1024)
        for status, changed, prefix in (
            (404, headers, b"\x1f\x8b\x08synthetic"),
            (200, headers, b"<html>Error</html>"),
            (200, [("Content-Length", "1024"), ("Content-Disposition", 'attachment; filename="systemlog.xml"')], b"\x1f\x8b\x08synthetic"),
            (200, [("Content-Length", "0"), headers[1]], b"\x1f\x8b\x08synthetic"),
            (200, [("Content-Length", str(65 * 1024 * 1024)), headers[1]], b"\x1f\x8b\x08synthetic"),
            (200, [("Content-Length", "1024"), headers[1], ("Content-Type", "text/html")], b"\x1f\x8b\x08synthetic"),
        ):
            with self.subTest(status=status, headers=changed):
                with self.assertRaises(PolycomContractError):
                    _validate_polycom_log_response(status, changed, prefix)

    def test_group310_log_collection_is_guarded_and_failure_isolated(self):
        calls = []
        opened = []
        metadata = []
        data = b"\x1f\x8bSYNTHETIC-ARCHIVE"
        def opener(options):
            opened.append({"ip": options["ip"], "reject_unauthorized": options["reject_unauthorized"]})
            return io.BytesIO(data)
        def sink(stream, info):
            metadata.append(info)
            self.assertEqual(stream.read(128), data)
            return {"status": "saved"}
        result = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": self.fake_request(calls, bundle=LOG_BUNDLE), "collect_logs": True,
             "log_opener": opener, "on_log": sink},
        )
        self.assertTrue(result["ok"])
        self.assertEqual(result["logCollection"], {"status": "saved", "validationStatus": "confirmed_user_validation"})
        self.assertEqual(metadata, [{"ip": "192.0.2.31", "filename": "192.0.2.31.tgz", "format": "polycom_syslog_tgz_v1"}])
        self.assertEqual(opened, [{"ip": "192.0.2.31", "reject_unauthorized": True}])
        self.assertNotIn(SYNTHETIC_PASSWORD, json.dumps(result))
        self.assertNotIn("SYNTHETIC-ARCHIVE", json.dumps(result))
        self.assertEqual(json.loads(calls[-1]["body"]), {"action": "Logout"})

        failed = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": self.fake_request([], bundle=LOG_BUNDLE), "collect_logs": True,
             "log_opener": opener, "on_log": lambda _stream, _info: {"status": "failed"}},
        )
        self.assertTrue(failed["ok"])
        self.assertEqual(failed["logCollection"]["status"], "failed")
        self.assertEqual(failed["logCollection"]["safeError"], "log_save_failed")

        not_supported = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": self.fake_request([], bundle=MAIN_BUNDLE), "collect_logs": True,
             "log_opener": lambda _options: self.fail("Drifted bundle must not open log"), "on_log": sink},
        )
        self.assertTrue(not_supported["ok"])
        self.assertEqual(not_supported["logCollection"]["status"], "protocol_required")

        wrong = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": self.fake_request([], model="RealPresence Group 500", bundle=LOG_BUNDLE), "collect_logs": True,
             "log_opener": lambda _options: self.fail("Wrong model must not open log"), "on_log": sink},
        )
        self.assertFalse(wrong["ok"])

    def test_other_exact_group_models_log_export_is_confirmed_after_individual_checks(self):
        data = b"\x1f\x8bSYNTHETIC-ARCHIVE"
        for model, wrapper in WRAPPERS.items():
            if model.endswith("310"):
                continue
            with self.subTest(model=model):
                calls = []
                seen = []
                result = wrapper({"ip": "192.0.2.31", "model": model},
                    [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}], {
                        "request": self.fake_request(calls, model=model, bundle=LOG_BUNDLE),
                        "collect_logs": True, "log_opener": lambda _options: io.BytesIO(data),
                        "on_log": lambda stream, metadata: seen.append((metadata["filename"], metadata["format"], stream.read(128))) or {"status": "saved"},
                    })
                self.assertTrue(result["ok"])
                self.assertEqual(result["logCollection"], {"status": "saved", "validationStatus": "confirmed_user_validation"})
                self.assertEqual(seen, [("192.0.2.31.tgz", "polycom_syslog_tgz_v1", data)])
                self.assertEqual(json.loads(calls[-1]["body"]), {"action": "Logout"})
    def test_narrow_config_reader_rejects_neighbor_fields_and_secure_values(self):
        name = "security.remoteaccess.telnet.enabled"
        calls = []

        def perform(method, path, body=None, maximum=None):
            calls.append((method, path, body, maximum))
            return response({"vars": [{"name": name, "value": "False", "isSecure": False}]})

        self.assertEqual(_read_exact_config_value(perform, name), "False")
        self.assertEqual(calls, [("POST", "/rest/config", {"names": [name]}, 65536)])
        for rows in ([{"name": name, "value": "False"}, {"name": "password", "value": SYNTHETIC_PASSWORD}],
                     [{"name": "other", "value": "False"}],
                     [{"name": name, "value": SYNTHETIC_PASSWORD, "isSecure": True}]):
            def malformed(method, path, body=None, maximum=None):
                return response({"vars": rows})
            with self.assertRaises(PolycomContractError):
                _read_exact_config_value(malformed, name)

    def fake_request(self, calls, *, model="RealPresence Group 310", bundle=MAIN_BUNDLE, accept=True, accepted_username="synthetic-user", fail_path=None, serial="SYNTHETIC-SERIAL", mac="02:00:00:00:00:31", system_name="Synthetic Room", config_values=None, menu_data=None):
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
            if method == "GET" and path == "/data/settingdata.json":
                return response(menu_data if menu_data is not None else {"viewData": []})
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
                payload = json.loads(options["body"])
                if "vars" in payload:
                    rows = payload["vars"]
                    self.assertTrue(isinstance(rows, list) and 1 <= len(rows) <= 2)
                    self.assertTrue(all(row["name"] in (AUTO_ANSWER_SINGLE_NAME, AUTO_ANSWER_MULTI_NAME)
                                        and row["value"] in ("Yes", "No") for row in rows))
                    self.assertIsNotNone(config_values)
                    for row in rows:
                        config_values[row["name"]] = row["value"]
                    return response({"vars": [{"name": row["name"], "result": "NOERROR"} for row in rows]})
                names = payload["names"]
                self.assertEqual(len(names), 1)
                if names == [MAC_NAME]:
                    return response({"vars": [{"name": MAC_NAME, "value": mac, "result": "SUCCESS", "isSecure": False, "password": SYNTHETIC_PASSWORD}]})
                if config_values and names[0] in config_values:
                    configured = config_values[names[0]]
                    return response(configured if isinstance(configured, dict) else {"vars": [{"name": names[0], "value": configured, "isSecure": False}]})
                raise AssertionError(f"Unexpected config name: {names[0]}")
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
        self.assertEqual(result["deviceSettings"]["fields"]["wifi"]["status"], "not_exposed")
        self.assertEqual(result["deviceSettings"]["fields"]["ssh"]["status"], "protocol_required")
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

    def test_group310_wifi_is_not_exposed_and_never_read_from_config(self):
        result, calls = self.run_poll(bundle=MAIN_BUNDLE + " " + TELNET_BUNDLE_MARKERS,
                                      config_values={TELNET_NAME: "False"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["deviceSettings"]["fields"]["wifi"], {"status": "not_exposed", "value": None})
        names = [name for call in calls if call["path"] == "/rest/config"
                 for name in json.loads(call["body"])["names"]]
        self.assertFalse(any("wifi" in name.casefold() or "wireless" in name.casefold() for name in names))

    def test_group310_telnet_exact_read_and_fail_closed_values(self):
        bundle = MAIN_BUNDLE + " " + TELNET_BUNDLE_MARKERS
        result, calls = self.run_poll(bundle=bundle, config_values={TELNET_NAME: "False"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["deviceSettings"]["fields"]["telnet"], {
            "status": "read", "value": "disabled", "source": f"POST /rest/config:{TELNET_NAME}",
            "validationStatus": "confirmed_user_validation"})
        self.assertEqual([json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"],
                         [[MAC_NAME], [TELNET_NAME]])
        enabled, _ = self.run_poll(bundle=bundle, config_values={TELNET_NAME: "True"})
        self.assertEqual(enabled["deviceSettings"]["fields"]["telnet"]["value"], "enabled")
        unknown, _ = self.run_poll(bundle=bundle, config_values={TELNET_NAME: "unknown"})
        self.assertEqual(unknown["deviceSettings"]["fields"]["telnet"]["status"], "unavailable")
        self.assertTrue(unknown["ok"])
        drift, drift_calls = self.run_poll(bundle=MAIN_BUNDLE + ' SECURITY_REMOTEACCESS_TELNET_ENABLED:"security.remoteaccess.telnet.enabled"')
        self.assertEqual(drift["deviceSettings"]["fields"]["telnet"]["status"], "protocol_required")
        self.assertFalse(any(json.loads(call["body"])["names"] == [TELNET_NAME] for call in drift_calls if call["path"] == "/rest/config"))

    def test_group310_http_setting_is_inverse_of_https_only_without_port_claim(self):
        bundle = MAIN_BUNDLE + " " + HTTP_BUNDLE_MARKERS
        allowed, calls = self.run_poll(bundle=bundle, config_values={HTTP_WEB_NAME: "True", HTTP_ONLY_NAME: "False", HTTP_PORT_NAME: "80"})
        self.assertTrue(allowed["ok"])
        self.assertEqual(allowed["deviceSettings"]["fields"]["http"], {
            "status": "read", "value": "enabled", "source": f"POST /rest/config:{HTTP_WEB_NAME},{HTTP_ONLY_NAME},{HTTP_PORT_NAME}",
            "webAccessEnabled": True, "httpsOnly": False, "configuredPort": 80,
            "meaning": "web_http_allowed", "validationStatus": "confirmed_user_validation"})
        self.assertEqual([json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"],
                         [[MAC_NAME], [HTTP_WEB_NAME], [HTTP_ONLY_NAME], [HTTP_PORT_NAME]])
        restricted, _ = self.run_poll(bundle=bundle, config_values={HTTP_WEB_NAME: "True", HTTP_ONLY_NAME: "True", HTTP_PORT_NAME: "80"})
        self.assertEqual(restricted["deviceSettings"]["fields"]["http"]["value"], "disabled")
        web_off, _ = self.run_poll(bundle=bundle, config_values={HTTP_WEB_NAME: "False", HTTP_ONLY_NAME: "False", HTTP_PORT_NAME: "80"})
        self.assertEqual(web_off["deviceSettings"]["fields"]["http"]["value"], "disabled")
        invalid, _ = self.run_poll(bundle=bundle, config_values={HTTP_WEB_NAME: "True", HTTP_ONLY_NAME: "unexpected", HTTP_PORT_NAME: "80"})
        self.assertTrue(invalid["ok"])
        self.assertEqual(invalid["deviceSettings"]["fields"]["http"]["status"], "unavailable")
        drift, calls = self.run_poll(bundle=MAIN_BUNDLE + HTTP_BUNDLE_MARKERS.replace('name:"webAccessPort",type:"int",varsName:configfqnames.SECURITY_REMOTEACCESS_WEB_HTTPPORT', ''))
        self.assertEqual(drift["deviceSettings"]["fields"]["http"]["status"], "protocol_required")
        self.assertFalse(any(json.loads(call["body"])["names"] == [HTTP_WEB_NAME] for call in calls if call["path"] == "/rest/config"))

    def test_group310_snmpv2_needs_service_and_version(self):
        bundle = MAIN_BUNDLE + " " + SNMP_BUNDLE_MARKERS
        disabled, calls = self.run_poll(bundle=bundle, config_values={SNMP_SERVICE_NAME: "False", SNMP_V2_NAME: "True"})
        self.assertTrue(disabled["ok"])
        self.assertEqual(disabled["deviceSettings"]["fields"]["snmpV2"], {
            "status": "read", "value": "disabled", "source": f"POST /rest/config:{SNMP_SERVICE_NAME},{SNMP_V2_NAME}",
            "serviceEnabled": False, "configuredEnabled": True, "validationStatus": "confirmed_user_validation"})
        self.assertEqual([json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"],
                         [[MAC_NAME], [SNMP_SERVICE_NAME], [SNMP_V2_NAME]])
        enabled, _ = self.run_poll(bundle=bundle, config_values={SNMP_SERVICE_NAME: "True", SNMP_V2_NAME: "True"})
        self.assertEqual(enabled["deviceSettings"]["fields"]["snmpV2"]["value"], "enabled")
        other_version, _ = self.run_poll(bundle=bundle, config_values={SNMP_SERVICE_NAME: "True", SNMP_V2_NAME: "False"})
        self.assertEqual(other_version["deviceSettings"]["fields"]["snmpV2"]["value"], "disabled")
        unknown, _ = self.run_poll(bundle=bundle, config_values={SNMP_SERVICE_NAME: "True", SNMP_V2_NAME: "unknown"})
        self.assertTrue(unknown["ok"])
        self.assertEqual(unknown["deviceSettings"]["fields"]["snmpV2"]["status"], "unavailable")
        drift, calls = self.run_poll(bundle=MAIN_BUNDLE + SNMP_BUNDLE_MARKERS.replace('varsName:configfqnames.MANAGEMENT_SNMP_VERSIONTWO', ''))
        self.assertEqual(drift["deviceSettings"]["fields"]["snmpV2"]["status"], "protocol_required")
        self.assertFalse(any(json.loads(call["body"])["names"] == [SNMP_SERVICE_NAME] for call in calls if call["path"] == "/rest/config"))

    def test_group310_auto_update_is_exact_polling_switch(self):
        bundle = MAIN_BUNDLE + " " + AUTO_UPDATE_BUNDLE_MARKERS
        disabled, calls = self.run_poll(bundle=bundle, config_values={AUTO_UPDATE_NAME: "False"})
        self.assertTrue(disabled["ok"])
        self.assertEqual(disabled["deviceSettings"]["fields"]["autoUpdate"], {
            "status": "read", "value": "disabled", "source": f"POST /rest/config:{AUTO_UPDATE_NAME}",
            "validationStatus": "confirmed_user_validation"})
        self.assertEqual([json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"],
                         [[MAC_NAME], [AUTO_UPDATE_NAME]])
        enabled, _ = self.run_poll(bundle=bundle, config_values={AUTO_UPDATE_NAME: "True"})
        self.assertEqual(enabled["deviceSettings"]["fields"]["autoUpdate"]["value"], "enabled")
        invalid, _ = self.run_poll(bundle=bundle, config_values={AUTO_UPDATE_NAME: "unknown"})
        self.assertTrue(invalid["ok"])
        self.assertEqual(invalid["deviceSettings"]["fields"]["autoUpdate"]["status"], "unavailable")

    def test_group310_auto_answer_preserves_distinct_call_modes(self):
        bundle = MAIN_BUNDLE + " " + AUTO_ANSWER_BUNDLE_MARKERS
        result, calls = self.run_poll(bundle=bundle, config_values={AUTO_ANSWER_SINGLE_NAME: "Yes", AUTO_ANSWER_MULTI_NAME: "No"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["deviceSettings"]["fields"]["autoAnswer"], {
            "status": "read", "value": {"pointToPoint": "enabled", "multipoint": "disabled"},
            "source": f"POST /rest/config:{AUTO_ANSWER_SINGLE_NAME},{AUTO_ANSWER_MULTI_NAME}",
            "validationStatus": "confirmed_user_validation"})
        self.assertEqual([json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"],
                         [[MAC_NAME], [AUTO_ANSWER_SINGLE_NAME], [AUTO_ANSWER_MULTI_NAME]])
        opposite, _ = self.run_poll(bundle=bundle, config_values={AUTO_ANSWER_SINGLE_NAME: "No", AUTO_ANSWER_MULTI_NAME: "Yes"})
        self.assertEqual(opposite["deviceSettings"]["fields"]["autoAnswer"]["value"],
                         {"pointToPoint": "disabled", "multipoint": "enabled"})
        partial, _ = self.run_poll(bundle=bundle, config_values={AUTO_ANSWER_SINGLE_NAME: "unknown", AUTO_ANSWER_MULTI_NAME: "No"})
        self.assertEqual(partial["deviceSettings"]["fields"]["autoAnswer"]["status"], "read")
        self.assertEqual(partial["deviceSettings"]["fields"]["autoAnswer"]["value"],
                         {"pointToPoint": None, "multipoint": "disabled"})
        self.assertEqual(partial["deviceSettings"]["fields"]["autoAnswer"]["unconfirmedFields"], ["pointToPoint"])
        drift, calls = self.run_poll(bundle=MAIN_BUNDLE + AUTO_ANSWER_BUNDLE_MARKERS.replace(
            'name:"autoAnswerMultiPointCall",type:"string",varsName:configfqnames.COMM_CALLSETTING_CALLFEATURES_AUTOANSWER_ANSWERMULTIPOINTCALL', ''))
        self.assertEqual(drift["deviceSettings"]["fields"]["autoAnswer"]["status"], "protocol_required")
        self.assertFalse(any(json.loads(call["body"])["names"] == [AUTO_ANSWER_SINGLE_NAME] for call in calls if call["path"] == "/rest/config"))

    def test_group310_auto_answer_writes_one_or_both_fields_once(self):
        action = "set_polycom_group_auto_answer"
        bundle = FULL_SETTINGS_BUNDLE + " " + AUTO_ANSWER_WRITE_MARKERS
        for changes, expected_rows in (
            ({"pointToPoint": "manual", "multipoint": None}, [{"name": AUTO_ANSWER_SINGLE_NAME, "value": "No"}]),
            ({"pointToPoint": "manual", "multipoint": "automatic"}, [
                {"name": AUTO_ANSWER_SINGLE_NAME, "value": "No"},
                {"name": AUTO_ANSWER_MULTI_NAME, "value": "Yes"}]),
        ):
            with self.subTest(changes=changes):
                calls = []
                values = {**FULL_SETTING_VALUES}
                result = poll_polycom_group310_device(
                    {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
                    [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
                    {"request": self.fake_request(calls, bundle=bundle, config_values=values),
                     "management_tasks": [action], "polycom_answer_changes": changes,
                     "answer_wait": lambda _seconds: None},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["managementActions"][0]["status"], "applied")
                self.assertEqual(result["managementActions"][0]["writeAttempted"], True)
                self.assertEqual([json.loads(call["body"])["vars"] for call in calls
                                  if call["path"] == "/rest/config" and "vars" in json.loads(call["body"])],
                                 [expected_rows])
                self.assertEqual(values[AUTO_ANSWER_SINGLE_NAME], "No")
                self.assertEqual(values[AUTO_ANSWER_MULTI_NAME], "Yes" if changes["multipoint"] else "No")
                self.assertNotIn(SYNTHETIC_PASSWORD, json.dumps(result))

        calls = []
        unchanged = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": self.fake_request(calls, bundle=bundle, config_values={**FULL_SETTING_VALUES}),
             "management_tasks": [action],
             "polycom_answer_changes": {"pointToPoint": "automatic", "multipoint": None}},
        )
        self.assertTrue(unchanged["ok"])
        self.assertEqual(unchanged["managementActions"][0]["status"], "already_compliant")
        self.assertFalse(any(call["path"] == "/rest/config" and "vars" in json.loads(call["body"])
                             for call in calls if call["method"] == "POST" and call["path"] == "/rest/config"))

    def test_group310_answer_write_fails_closed_on_drift_dnd_and_unclear_write(self):
        action = "set_polycom_group_auto_answer"
        changes = {"pointToPoint": "manual", "multipoint": "automatic"}
        for bundle, initial in (
            (FULL_SETTINGS_BUNDLE, {**FULL_SETTING_VALUES}),
            (FULL_SETTINGS_BUNDLE + " " + AUTO_ANSWER_WRITE_MARKERS,
             {**FULL_SETTING_VALUES, AUTO_ANSWER_SINGLE_NAME: "Do_Not_Disturb"}),
        ):
            calls = []
            result = poll_polycom_group310_device(
                {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
                [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
                {"request": self.fake_request(calls, bundle=bundle, config_values=initial),
                 "management_tasks": [action], "polycom_answer_changes": changes},
            )
            self.assertFalse(result["ok"])
            self.assertEqual(result["managementActions"][0]["status"], "failed")
            self.assertFalse(any(call["path"] == "/rest/config" and "vars" in json.loads(call["body"])
                                 for call in calls if call["method"] == "POST" and call["path"] == "/rest/config"))

        calls = []
        base_request = self.fake_request(calls, bundle=FULL_SETTINGS_BUNDLE + " " + AUTO_ANSWER_WRITE_MARKERS,
                                         config_values={**FULL_SETTING_VALUES})
        def unclear_write(options):
            if options["path"] == "/rest/config" and "vars" in json.loads(options["body"]):
                calls.append(options)
                raise TimeoutError("sensitive-transport-detail")
            return base_request(options)
        result = poll_polycom_group310_device(
            {"ip": "192.0.2.31", "model": "RealPresence Group 310"},
            [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
            {"request": unclear_write, "management_tasks": [action],
             "polycom_answer_changes": changes},
        )
        self.assertFalse(result["ok"])
        self.assertEqual(result["managementActions"][0]["writeAttempted"], True)
        self.assertEqual(len([call for call in calls if call["path"] == "/rest/config"
                              and "vars" in json.loads(call["body"])]), 1)
        self.assertNotIn("sensitive-transport-detail", json.dumps(result))

    def test_polycom_answer_waits_for_two_stable_reads_without_write_retry(self):
        names = (AUTO_ANSWER_SINGLE_NAME, AUTO_ANSWER_MULTI_NAME)
        calls = []
        readings = iter(("Yes", "No", "No", "No", "Yes", "Yes", "Yes", "Yes"))
        def perform(method, path, body=None, maximum=None):
            calls.append((method, path, body))
            if "names" in body:
                return response({"vars": [{"name": body["names"][0], "value": next(readings), "isSecure": False}]})
            return response({"vars": [{"name": names[1], "result": "NOERROR"}]})
        result = _set_polycom_answer_mode(
            perform, FULL_SETTINGS_BUNDLE + " " + AUTO_ANSWER_WRITE_MARKERS,
            {"pointToPoint": None, "multipoint": "automatic"}, 310, wait=lambda _seconds: None,
        )
        self.assertEqual(result["status"], "applied")
        self.assertEqual(len([body for _method, _path, body in calls if "vars" in body]), 1)
        self.assertEqual([body["vars"] for _method, _path, body in calls if "vars" in body],
                         [[{"name": AUTO_ANSWER_MULTI_NAME, "value": "Yes"}]])

    def test_other_exact_groups_use_same_guarded_answer_contract_provisionally(self):
        bundle = FULL_SETTINGS_BUNDLE + " " + AUTO_ANSWER_WRITE_MARKERS
        for model in ("RealPresence Group 300", "RealPresence Group 500", "RealPresence Group 700"):
            with self.subTest(model=model):
                calls = []
                values = {**FULL_SETTING_VALUES}
                result = WRAPPERS[model](
                    {"ip": "192.0.2.31", "model": model},
                    [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
                    {"request": self.fake_request(calls, model=model, bundle=bundle, config_values=values),
                     "management_tasks": ["set_polycom_group_auto_answer"],
                     "polycom_answer_changes": {"pointToPoint": "manual", "multipoint": "automatic"},
                     "answer_wait": lambda _seconds: None},
                )
                self.assertTrue(result["ok"])
                self.assertEqual(result["managementActions"][0]["status"], "applied")
                self.assertEqual(result["managementActions"][0]["validationStatus"], "provisional_user_validation")
                self.assertEqual(len([call for call in calls if call["path"] == "/rest/config"
                                      and "vars" in json.loads(call["body"])]), 1)
                wrong = WRAPPERS[model](
                    {"ip": "192.0.2.31", "model": model},
                    [{"username": "synthetic-user", "password": SYNTHETIC_PASSWORD}],
                    {"request": self.fake_request([], model="RealPresence Group 310", bundle=bundle, config_values={**FULL_SETTING_VALUES}),
                     "management_tasks": ["set_polycom_group_auto_answer"],
                     "polycom_answer_changes": {"pointToPoint": "manual", "multipoint": None}},
                )
                self.assertFalse(wrong["ok"])

    def test_group310_ntp_manual_reads_two_exact_instances_without_leaking_servers(self):
        bundle = MAIN_BUNDLE + " " + NTP_BUNDLE_MARKERS
        values = {NTP_MODE_NAME: "Manual", NTP_PRIMARY_NAME: "ntp1.example.test", NTP_SECONDARY_NAME: ""}
        result, calls = self.run_poll(bundle=bundle, config_values=values)
        self.assertTrue(result["ok"])
        self.assertEqual(result["deviceSettings"]["fields"]["ntp"], {
            "status": "read", "value": {"enabled": True, "mode": "manual", "modeCode": "Manual",
                                        "primaryServer": "ntp1.example.test", "secondaryServer": ""},
            "source": f"POST /rest/config:{NTP_MODE_NAME},{NTP_PRIMARY_NAME},{NTP_SECONDARY_NAME}",
            "validationStatus": "confirmed_user_validation"})
        self.assertEqual([json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"],
                         [[MAC_NAME], [NTP_MODE_NAME], [NTP_PRIMARY_NAME], [NTP_SECONDARY_NAME]])
        self.assertNotIn("ntp1.example.test", json.dumps(result.get("diagnostics") or {}))
        unknown, calls = self.run_poll(bundle=bundle, config_values={NTP_MODE_NAME: "Unexpected"})
        self.assertEqual(unknown["deviceSettings"]["fields"]["ntp"]["status"], "unavailable")
        self.assertFalse(any(json.loads(call["body"])["names"] == [NTP_PRIMARY_NAME] for call in calls if call["path"] == "/rest/config"))
        partial, _ = self.run_poll(bundle=bundle, config_values={NTP_MODE_NAME: "Manual", NTP_PRIMARY_NAME: "ntp1.example.test", NTP_SECONDARY_NAME: {"vars": [{"name": "other", "value": ""}]}})
        self.assertEqual(partial["deviceSettings"]["fields"]["ntp"]["status"], "read")
        self.assertEqual(partial["deviceSettings"]["fields"]["ntp"]["value"]["secondaryServer"], None)
        self.assertEqual(partial["deviceSettings"]["fields"]["ntp"]["unconfirmedFields"], ["secondaryServer"])
        secret, _ = self.run_poll(bundle=bundle, config_values={NTP_MODE_NAME: "Manual", NTP_PRIMARY_NAME: SYNTHETIC_PASSWORD, NTP_SECONDARY_NAME: ""})
        self.assertNotIn(SYNTHETIC_PASSWORD, json.dumps(secret))
        drift, calls = self.run_poll(bundle=MAIN_BUNDLE + NTP_BUNDLE_MARKERS.replace('a[b-1]+=c.instanceName', ''))
        self.assertEqual(drift["deviceSettings"]["fields"]["ntp"]["status"], "protocol_required")
        self.assertFalse(any(json.loads(call["body"])["names"] == [NTP_MODE_NAME] for call in calls if call["path"] == "/rest/config"))

    def test_group310_ssh_legacy_fallback_is_qualified_when_service_absent(self):
        bundle = MAIN_BUNDLE + " " + SSH_LEGACY_BUNDLE_MARKERS + " " + SSH_MENU_REFERENCE
        result, calls = self.run_poll(bundle=bundle, config_values={SSH_LEGACY_NAME: "True"}, menu_data=SSH_LEGACY_MENU)
        self.assertTrue(result["ok"])
        self.assertEqual(result["deviceSettings"]["fields"]["ssh"], {
            "status": "read", "value": "enabled", "source": f"POST /rest/config:{SSH_LEGACY_NAME}",
            "basis": "legacy_api_fallback", "meaning": "ssh_audit_proxy", "ruleVersion": "polycom-ssh-source-priority-v1",
            "validationStatus": "confirmed_user_validation"})
        self.assertEqual([json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"],
                         [[MAC_NAME], [SSH_LEGACY_NAME]])
        disabled, _ = self.run_poll(bundle=bundle, config_values={SSH_LEGACY_NAME: "False"}, menu_data=SSH_LEGACY_MENU)
        self.assertEqual(disabled["deviceSettings"]["fields"]["ssh"]["value"], "disabled")
        unknown, _ = self.run_poll(bundle=bundle, config_values={SSH_LEGACY_NAME: "unknown"}, menu_data=SSH_LEGACY_MENU)
        self.assertEqual(unknown["deviceSettings"]["fields"]["ssh"]["status"], "unavailable")

    def test_group310_ssh_service_takes_priority_only_with_exact_menu_bundle_evidence(self):
        bundle = MAIN_BUNDLE + " " + SSH_LEGACY_BUNDLE_MARKERS + " " + SSH_MENU_REFERENCE + " " + SSH_PRIMARY_SYNTHETIC_BUNDLE
        values = {SSH_LEGACY_NAME: "True", SSH_PRIMARY_SYNTHETIC_NAME: "False"}
        direct, calls = self.run_poll(bundle=bundle, config_values=values, menu_data=SSH_PRIMARY_MENU)
        self.assertTrue(direct["ok"])
        self.assertEqual(direct["deviceSettings"]["fields"]["ssh"], {
            "status": "read", "value": "disabled", "source": f"POST /rest/config:{SSH_PRIMARY_SYNTHETIC_NAME}",
            "basis": "ssh_service_direct", "meaning": "ssh_service_setting", "ruleVersion": "polycom-ssh-source-priority-v1",
            "validationStatus": "provisional_user_validation"})
        names = [json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"]
        self.assertIn([SSH_PRIMARY_SYNTHETIC_NAME], names)
        self.assertNotIn([SSH_LEGACY_NAME], names)

        unreadable, calls = self.run_poll(bundle=bundle, config_values={**values, SSH_PRIMARY_SYNTHETIC_NAME: "unknown"}, menu_data=SSH_PRIMARY_MENU)
        self.assertEqual(unreadable["deviceSettings"]["fields"]["ssh"]["status"], "unavailable")
        self.assertNotIn([SSH_LEGACY_NAME], [json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"])

        malformed, calls = self.run_poll(bundle=bundle.replace('name:"syntheticSshService",type:"boolean"', 'name:"syntheticSshService",type:"string"'),
                                         config_values=values, menu_data=SSH_PRIMARY_MENU)
        self.assertEqual(malformed["deviceSettings"]["fields"]["ssh"]["status"], "protocol_required")
        self.assertNotIn([SSH_LEGACY_NAME], [json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"])
        hidden_menu = {"viewData": [{"viewclass": "Draco.view.adminsettings.security.GlobalSecurityAccessView",
                                     "items": [{"name": "syntheticSshService", "label": "ENABLE_SSH_SERVICE", "hidden": True},
                                               {"name": "enableSshAccess", "label": "ENABLE_LEGACY_API_OVER_SSH"}]}]}
        hidden, _ = self.run_poll(bundle=bundle, config_values=values, menu_data=hidden_menu)
        self.assertEqual(hidden["deviceSettings"]["fields"]["ssh"]["basis"], "legacy_api_fallback")
        bad_menu, calls = self.run_poll(bundle=bundle, config_values=values, menu_data={"viewData": "invalid"})
        self.assertEqual(bad_menu["deviceSettings"]["fields"]["ssh"]["status"], "protocol_required")
        self.assertNotIn([SSH_LEGACY_NAME], [json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"])
        wrong_label_menu = {"viewData": [{"viewclass": "Draco.view.adminsettings.security.GlobalSecurityAccessView",
                                          "items": [{"name": "syntheticSshService", "label": "DISABLE_SSH_SERVICE"}]}]}
        wrong_label, calls = self.run_poll(bundle=bundle, config_values=values, menu_data=wrong_label_menu)
        self.assertEqual(wrong_label["deviceSettings"]["fields"]["ssh"]["status"], "protocol_required")
        self.assertNotIn([SSH_LEGACY_NAME], [json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"])
        wrong_model, calls = self.run_poll(bundle=bundle, observed="RealPresence Group 500", config_values=values, menu_data=SSH_PRIMARY_MENU)
        self.assertFalse(wrong_model["ok"])
        self.assertFalse(any(call["path"] == "/data/settingdata.json" for call in calls))

    def test_group310_power_long_press_does_not_infer_sleep(self):
        bundle = MAIN_BUNDLE + " " + POWER_BUTTON_BUNDLE_MARKERS
        result, calls = self.run_poll(bundle=bundle, config_values={POWER_BUTTON_NAME: "Power_Off"})
        self.assertTrue(result["ok"])
        self.assertEqual(result["deviceSettings"]["fields"]["powerManagement"], {
            "status": "read", "value": {"hangupLongPressAction": "power_off", "actionCode": "Power_Off", "sleepMode": None},
            "source": f"POST /rest/config:{POWER_BUTTON_NAME}", "meaning": "remote_hangup_long_press",
            "unconfirmedFields": ["sleepMode"], "validationStatus": "confirmed_user_validation"})
        self.assertEqual([json.loads(call["body"])["names"] for call in calls if call["path"] == "/rest/config"],
                         [[MAC_NAME], [POWER_BUTTON_NAME]])
        unknown, _ = self.run_poll(bundle=bundle, config_values={POWER_BUTTON_NAME: "Unrecognized_Action"})
        self.assertEqual(unknown["deviceSettings"]["fields"]["powerManagement"]["status"], "unavailable")
        drift, calls = self.run_poll(bundle=MAIN_BUNDLE + POWER_BUTTON_BUNDLE_MARKERS.replace(
            'addIndividualStoreVar("hangupButtonLongPress","SYSTEM_REMOTE_HANGUPKEYLONGPRESSFUNC")', ''))
        self.assertEqual(drift["deviceSettings"]["fields"]["powerManagement"]["status"], "protocol_required")
        self.assertFalse(any(json.loads(call["body"])["names"] == [POWER_BUTTON_NAME] for call in calls if call["path"] == "/rest/config"))

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
                self.assertEqual(result["vendorPolling"]["evidenceStatus"], "confirmed_user_validation")

    def test_shared_setting_reader_respects_each_exact_group_model_and_drift(self):
        for model in WRAPPERS:
            with self.subTest(model=model):
                result, calls = self.run_poll(model=model, bundle=FULL_SETTINGS_BUNDLE,
                                              config_values=FULL_SETTING_VALUES)
                self.assertTrue(result["ok"])
                self.assertEqual(result["deviceSettings"]["validationStatus"], "confirmed_user_validation")
                self.assertEqual(result["deviceSettings"]["fields"]["wifi"]["status"], "not_exposed")
                self.assertEqual(result["deviceSettings"]["fields"]["http"]["value"], "enabled")
                self.assertEqual(result["deviceSettings"]["fields"]["snmpV2"]["value"], "disabled")
                self.assertEqual(result["deviceSettings"]["fields"]["powerManagement"]["value"]["sleepMode"], None)
                self.assertTrue(all(call["method"] in ("GET", "POST") for call in calls))
                self.assertNotIn(SYNTHETIC_PASSWORD, json.dumps(result))
        wrong, calls = self.run_poll(model="RealPresence Group 500", observed="RealPresence Group 310",
                                     bundle=FULL_SETTINGS_BUNDLE, config_values=FULL_SETTING_VALUES)
        self.assertFalse(wrong["ok"])
        self.assertEqual(wrong["safeError"], "target_model_mismatch")
        self.assertFalse(any(json.loads(call["body"])["names"] == [TELNET_NAME] for call in calls if call["path"] == "/rest/config"))
        drift, _ = self.run_poll(model="RealPresence Group 700", bundle=FULL_SETTINGS_BUNDLE.replace(
            'name:"enableWebAccess",type:"boolean",varsName:configfqnames.SECURITY_REMOTEACCESS_WEB_ENABLED', ''),
            config_values=FULL_SETTING_VALUES)
        self.assertTrue(drift["ok"])
        self.assertEqual(drift["deviceSettings"]["fields"]["http"]["status"], "protocol_required")
        self.assertEqual(drift["deviceSettings"]["fields"]["telnet"]["status"], "read")
        malformed, _ = self.run_poll(model="RealPresence Group 300", bundle=FULL_SETTINGS_BUNDLE,
                                     config_values={**FULL_SETTING_VALUES, AUTO_UPDATE_NAME: "unrecognized"})
        self.assertTrue(malformed["ok"])
        self.assertEqual(malformed["deviceSettings"]["fields"]["autoUpdate"]["status"], "unavailable")
        self.assertEqual(malformed["deviceSettings"]["fields"]["telnet"]["status"], "read")

    def test_group300_https_validation_failure_never_sends_credentials_or_http_fallback(self):
        result, calls = self.run_poll(model="RealPresence Group 300", fail_path="/login.html")
        self.assertFalse(result["ok"])
        self.assertEqual(result["failedStage"], "validation")
        self.assertFalse(any(call["path"] == "/rest/session" for call in calls))
        self.assertFalse(any("http://" in call["path"] for call in calls))

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
