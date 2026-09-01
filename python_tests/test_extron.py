from __future__ import annotations

import json
import unittest

from mvp_runtime.adapters.extron import build_web_blocks, extract_resource_uris, poll_extron_device, session_cookie


class ExtronTests(unittest.TestCase):
    def test_resource_discovery_requires_unambiguous_safe_uris(self) -> None:
        one = "/QUJDREVGR0hJSktMTU5PUA=="
        two = "/YWJjZGVmZ2hpamtsbW5vcA=="
        found = extract_resource_uris(f"serialNumber: '{one}'; fwVersion: '{two}'; this.unitInfo")
        self.assertEqual(found["resources"], {"fwVersion": two, "serialNumber": one})
        ambiguous = extract_resource_uris(f"serialNumber: '{one}' serialNumber: '{two}'")
        self.assertNotIn("serialNumber", ambiguous["resources"])

    def test_projection_preserves_project_firmware_and_status_contract(self) -> None:
        blocks = build_web_blocks({
            "modelName": "Synthetic Extron",
            "serialNumber": "SYNTHETIC",
            "fwVersion": "3.05.0000-b001 *(build - Fri, 01 Jan 2021 00:00:00 UTC)",
            "uptime": 90061,
            "controllerConfig": {"filename": "Project", "projfilevers": "0.0.303.0", "cdate": "21.07.2024", "rdate": "07.07.2026", "cfgapp": "GS", "cfgappvers": "2.22.0.4"},
            "allLan": {"ipAddress": "192.0.2.10", "macAddress": "00:00:00:00:00:00"},
        }, "192.0.2.10")
        self.assertEqual(blocks["Project Info"]["Version"], "0.0.303")
        self.assertEqual(blocks["Project Info"]["Saved with"], "GS 2.22.0.4")
        self.assertEqual(blocks["Device Status"]["Uptime"], "1d 1h 1m 1s")
        self.assertIn("Last Updated", blocks["Firmware"])

    def test_login_discovery_and_resources_are_https_contract_only(self) -> None:
        serial_uri = "/QUJDREVGR0hJSktMTU5PUA=="
        firmware_uri = "/YWJjZGVmZ2hpamtsbW5vcA=="
        calls: list[dict] = []

        def request(options: dict) -> dict:
            calls.append(options)
            if options["path"].startswith("/api/login"):
                return {"status_code": 200, "headers": [("Set-Cookie", "NortxeSession=synthetic-cookie; Secure")], "body": ""}
            if options["path"] == "/www/main.js":
                return {"status_code": 200, "headers": [], "body": f"serialNumber: '{serial_uri}'; fwVersion: '{firmware_uri}'; this.unitInfo"}
            values = {f"/api/swis/resource{serial_uri}": "SYNTHETIC-SERIAL", f"/api/swis/resource{firmware_uri}": "1.0.0"}
            return {"status_code": 200, "headers": [], "body": json.dumps({"value": values[options["path"]]})}

        result = poll_extron_device(
            {"ip": "192.0.2.10", "allowInsecureTls": True},
            [{"username": "synthetic-user", "password": "SYNTHETIC-PASSWORD"}],
            {"request": request, "now": lambda: 1_700_000_000.0},
        )
        self.assertTrue(result["ok"])
        self.assertTrue(result["webInterface"]["insecureTls"])
        self.assertEqual(result["webBlocks"]["Device Info"]["Serial Number"], "SYNTHETIC-SERIAL")
        self.assertEqual([item["path"] for item in calls[:2]], ["/api/login?rnd=1700000000000", "/www/main.js"])
        self.assertTrue(all(item["reject_unauthorized"] is False for item in calls))
        self.assertNotIn("SYNTHETIC-PASSWORD", json.dumps(result))

    def test_authorization_failure_and_cookie_parser_are_safe(self) -> None:
        self.assertEqual(session_cookie([("set-cookie", "x=1"), ("Set-Cookie", "NortxeSession=abc; HttpOnly")]), "NortxeSession=abc")
        result = poll_extron_device(
            {"ip": "192.0.2.11"},
            [{"username": "u", "password": "p"}],
            {"request": lambda _options: {"status_code": 401, "headers": [], "body": "sensitive body"}},
        )
        self.assertEqual(result["safeError"], "authorization_failed")
        self.assertNotIn("sensitive", json.dumps(result))


if __name__ == "__main__":
    unittest.main()
