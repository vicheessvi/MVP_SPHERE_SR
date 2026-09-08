from __future__ import annotations

import json
import ssl
import unittest

from mvp_runtime.adapters.huawei_te40 import DISABLE_INSECURE_SERVICES_ACTION, TE20_TLS_PROFILE, HuaweiTransportError, _https_context, build_web_blocks, poll_huawei_te_device
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
        self.assertEqual(len(resource_calls), 6)
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
            self.assertEqual(result["vendorPolling"]["contract"], "huawei-te-web-cgi-v1")
            self.assertEqual(len([item for item in calls if "Web_RequestCertificate" in item["path"]]), 1)
            self.assertTrue(all(item["tls_profile"] is None for item in calls))

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
        self.assertFalse(any("WEB_GetCfgParamAPI" in item["path"] or "WEB_SaveCfgParamAPI" in item["path"] for item in no_action_calls))

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
