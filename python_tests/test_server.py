from __future__ import annotations

import http.client
import hashlib
import json
import threading
import time
import unittest
import tempfile
from http.cookies import SimpleCookie
from pathlib import Path

from mvp_runtime.server import create_server
from python_tests.helpers import credential_xlsx


class ServerHarness:
    def __init__(self, admin_verifier_path: Path | None = None) -> None:
        self.admin_dir = tempfile.TemporaryDirectory() if admin_verifier_path is None else None
        path = admin_verifier_path or Path(self.admin_dir.name) / "admin-access.json"
        self.server = create_server(Path(__file__).resolve().parent.parent, admin_verifier_path=path)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host = f"127.0.0.1:{self.server.server_port}"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        if self.admin_dir is not None:
            self.admin_dir.cleanup()

    def request(self, method: str, path: str, *, headers: dict[str, str] | None = None, body: bytes | str | None = None) -> tuple[int, dict[str, str], bytes]:
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        merged = {"Host": self.host, **(headers or {})}
        connection.request(method, path, body=body, headers=merged)
        response = connection.getresponse()
        data = response.read()
        result_headers = {key.casefold(): value for key, value in response.getheaders()}
        status = response.status
        connection.close()
        return status, result_headers, data

    def session(self, unlock: bool = True) -> tuple[str, str]:
        status, headers, _ = self.request("GET", f"/launch?token={self.server.state.launch_token}")
        if status != 303:
            raise AssertionError(status)
        cookie = SimpleCookie()
        cookie.load(headers["set-cookie"])
        header = f"mvp_sphere_session={cookie['mvp_sphere_session'].value}"
        status, _, body = self.request("GET", "/api/session", headers={"Cookie": header})
        if status != 200:
            raise AssertionError(status)
        csrf = json.loads(body)["csrfToken"]
        if unlock:
            status, _, _ = self.request("POST", "/api/admin/setup", headers={"Cookie": header, "Origin": f"http://{self.host}", "X-MVP-CSRF": csrf, "Content-Type": "application/json"}, body=json.dumps({"username": "synthetic-admin", "password": "SYNTHETIC-ADMIN-PASSWORD-123"}))
            if status != 200:
                raise AssertionError(status)
        return header, csrf


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.harness = ServerHarness()

    def tearDown(self) -> None:
        self.harness.close()

    def test_first_run_admin_gate_blocks_polling_until_setup_or_login(self) -> None:
        cookie, csrf = self.harness.session(unlock=False)
        headers = {"Cookie": cookie, "Origin": f"http://{self.harness.host}", "X-MVP-CSRF": csrf, "Content-Type": "application/json"}
        status, _, body = self.harness.request("GET", "/api/session", headers={"Cookie": cookie})
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["adminConfigured"])
        status, _, body = self.harness.request("POST", "/api/polling/credentials", headers=headers, body="{}")
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body)["error"], "admin_login_required")
        status, _, _ = self.harness.request("POST", "/api/admin/setup", headers=headers, body=json.dumps({"username": "synthetic-admin", "password": "short"}))
        self.assertEqual(status, 400)
        secret = "SYNTHETIC-ADMIN-PASSWORD-123"
        status, _, body = self.harness.request("POST", "/api/admin/setup", headers=headers, body=json.dumps({"username": "synthetic-admin", "password": secret}))
        self.assertEqual(status, 200)
        self.assertNotIn(secret, body.decode())
        verifier = self.harness.server.state.admin_verifier_path.read_text(encoding="utf-8")
        self.assertNotIn(secret, verifier)
        status, _, _ = self.harness.request("POST", "/api/admin/setup", headers=headers, body=json.dumps({"username": "other", "password": "ANOTHER-SYNTHETIC-SECRET"}))
        self.assertEqual(status, 409)
        status, _, _ = self.harness.request("POST", "/api/admin/logout", headers=headers, body="{}")
        self.assertEqual(status, 200)
        status, _, body = self.harness.request("GET", "/api/polling/jobs/active", headers={"Cookie": cookie})
        self.assertEqual(status, 403)
        status, _, body = self.harness.request("POST", "/api/admin/login", headers=headers, body=json.dumps({"username": "synthetic-admin", "password": "WRONG-SYNTHETIC-PASSWORD"}))
        self.assertEqual(status, 401)
        self.assertNotIn("WRONG-SYNTHETIC-PASSWORD", body.decode())
        status, _, body = self.harness.request("POST", "/api/admin/login", headers=headers, body=json.dumps({"username": "synthetic-admin", "password": secret}))
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["adminUnlocked"])

    def test_admin_login_throttles_repeated_failures_and_requires_csrf(self) -> None:
        cookie, csrf = self.harness.session()
        status, _, body = self.harness.request("POST", "/api/admin/logout", headers={"Cookie": cookie}, body="{}")
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body)["error"], "csrf_or_origin_rejected")
        headers = {"Cookie": cookie, "Origin": f"http://{self.harness.host}", "X-MVP-CSRF": csrf, "Content-Type": "application/json"}
        status, _, _ = self.harness.request("POST", "/api/admin/logout", headers=headers, body="{}")
        self.assertEqual(status, 200)
        for _ in range(5):
            status, _, _ = self.harness.request("POST", "/api/admin/login", headers=headers, body=json.dumps({"username": "synthetic-admin", "password": "WRONG-SYNTHETIC-PASSWORD"}))
            self.assertEqual(status, 401)
        status, _, body = self.harness.request("POST", "/api/admin/login", headers=headers, body=json.dumps({"username": "synthetic-admin", "password": "SYNTHETIC-ADMIN-PASSWORD-123"}))
        self.assertEqual(status, 429)
        self.assertEqual(json.loads(body)["error"], "admin_retry_later")

    def test_new_runtime_with_existing_verifier_starts_locked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "admin-access.json"
            first = ServerHarness(path)
            try:
                first.session()
            finally:
                first.close()
            second = ServerHarness(path)
            try:
                cookie, _csrf = second.session(unlock=False)
                status, _, body = second.request("GET", "/api/session", headers={"Cookie": cookie})
                self.assertEqual(status, 200)
                self.assertTrue(json.loads(body)["adminConfigured"])
                self.assertFalse(json.loads(body)["adminUnlocked"])
                status, _, body = second.request("GET", "/api/polling/jobs/active", headers={"Cookie": cookie})
                self.assertEqual(status, 403)
                self.assertEqual(json.loads(body)["error"], "admin_login_required")
            finally:
                second.close()

    def test_launch_is_one_time_and_session_is_http_only(self) -> None:
        status, headers, _ = self.harness.request("GET", f"/launch?token={self.harness.server.state.launch_token}")
        self.assertEqual(status, 303)
        self.assertIn("HttpOnly", headers["set-cookie"])
        self.assertIn("SameSite=Strict", headers["set-cookie"])
        status, _, body = self.harness.request("GET", f"/launch?token={self.harness.server.state.launch_token}")
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body)["error"], "invalid_or_used_launch_token")

    def test_host_cookie_origin_and_csrf_are_required(self) -> None:
        status, _, body = self.harness.request("GET", "/api/session")
        self.assertEqual(status, 401)
        self.assertEqual(json.loads(body)["error"], "local_session_required")

        connection = http.client.HTTPConnection("127.0.0.1", self.harness.server.server_port, timeout=3)
        connection.request("GET", "/api/session", headers={"Host": "evil.invalid"})
        response = connection.getresponse()
        self.assertEqual(response.status, 403)
        response.read()
        connection.close()

        cookie, csrf = self.harness.session()
        status, _, body = self.harness.request("POST", "/unknown", headers={"Cookie": cookie, "Origin": "http://evil.invalid", "X-MVP-CSRF": csrf, "Content-Length": "0"})
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body)["error"], "csrf_or_origin_rejected")

    def test_static_allowlist_runtime_marker_and_removed_storage(self) -> None:
        cookie, csrf = self.harness.session()
        for path, expected in (("/", b"<!doctype html"), ("/app.js", b"MvpSphereSR"), ("/runtime/sphere.js", b"MVP_SPHERE_BRAND"), ("/runtime/polling-recovery.js", b"MVP_POLLING_RECOVERY"), ("/runtime-config.js", b"__MVP_CSRF__")):
            status, headers, body = self.harness.request("GET", path, headers={"Cookie": cookie})
            self.assertEqual(status, 200)
            self.assertIn(expected, body)
            self.assertEqual(headers["x-frame-options"], "DENY")
            self.assertEqual(headers["cache-control"], "no-store, max-age=0")
        status, _, body = self.harness.request("GET", "/api/polling/jobs/active", headers={"Cookie": cookie})
        self.assertEqual(status, 200)
        self.assertIsNone(json.loads(body)["activeJobId"])
        status, _, body = self.harness.request("PUT", "/api/storage/state", headers={"Cookie": cookie, "Origin": f"http://{self.harness.host}", "X-MVP-CSRF": csrf, "Content-Length": "2"}, body=b"{}")
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(body)["error"], "not_found")
        status, _, _ = self.harness.request("GET", "/../server.py", headers={"Cookie": cookie})
        self.assertEqual(status, 404)

    def _mutation_headers(self, cookie: str, csrf: str, **extra: str) -> dict[str, str]:
        return {"Cookie": cookie, "Origin": f"http://{self.harness.host}", "X-MVP-CSRF": csrf, **extra}

    def _upload_credentials(self, cookie: str, csrf: str) -> str:
        workbook = credential_xlsx([["Логин", "Пароль"], ["synthetic-user", "SYNTHETIC-SERVER-SECRET"]])
        status, _, body = self.harness.request("POST", "/api/polling/credentials", headers=self._mutation_headers(cookie, csrf, **{"X-File-Name": "synthetic.xlsx", "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), body=workbook)
        self.assertEqual(status, 200, body)
        payload = json.loads(body)
        self.assertNotIn("SYNTHETIC-SERVER-SECRET", body.decode())
        return payload["sourceSha256"]

    def test_manual_credentials_are_ordered_redacted_and_cleared(self) -> None:
        cookie, csrf = self.harness.session()
        pairs = [{"username": "first", "password": "SYNTHETIC-FIRST-SECRET"}, {"username": "second", "password": "SYNTHETIC-SECOND-SECRET"}]
        body = json.dumps({"pairs": pairs}).encode()
        status, _, response = self.harness.request("POST", "/api/polling/credentials", headers=self._mutation_headers(cookie, csrf, **{"Content-Type": "application/json"}), body=body)
        self.assertEqual(status, 200, response)
        payload = json.loads(response)
        self.assertEqual(payload["summary"]["acceptedCount"], 2)
        self.assertNotIn("SYNTHETIC-FIRST-SECRET", response.decode())
        self.assertEqual(payload["sourceSha256"], hashlib.sha256(body).hexdigest())
        status, _, response = self.harness.request("POST", "/api/polling/credentials", headers=self._mutation_headers(cookie, csrf, **{"Content-Type": "application/json"}), body=json.dumps({"pairs": [pairs[0], pairs[0]]}).encode())
        self.assertEqual(status, 400)
        self.assertNotIn("SYNTHETIC-FIRST-SECRET", response.decode())

    def test_credential_plan_result_ack_and_terminal_clear_contract(self) -> None:
        cookie, csrf = self.harness.session()
        digest = self._upload_credentials(cookie, csrf)
        plan = {"schemaVersion": 3, "scheduledAt": "1970-01-01T00:00:00.000Z", "intervalMinSeconds": 5, "intervalMaxSeconds": 10, "authenticationInputSha256": digest, "managementTasks": [], "devices": [{"ip": "192.0.2.20", "category": "controller", "manufacturer": "Extron", "model": "Synthetic", "pollingSupported": False}]}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf, **{"Content-Type": "application/json"}), body=json.dumps({"planId": "synthetic-plan", "plan": plan, "allowInsecureTls": True}).encode())
        self.assertEqual(status, 202, body)
        job_id = json.loads(body)["jobId"]
        pending = None
        for _ in range(200):
            status, _, body = self.harness.request("GET", f"/api/polling/jobs/{job_id}/result", headers={"Cookie": cookie})
            if status == 200:
                pending = json.loads(body)
                break
            self.assertEqual(status, 204)
            time.sleep(0.005)
        self.assertIsNotNone(pending)
        self.assertEqual(pending["filename"], "192.0.2.20.json")
        self.assertNotIn("SYNTHETIC-SERVER-SECRET", json.dumps(pending))
        status, _, body = self.harness.request("GET", "/api/polling/jobs/active", headers={"Cookie": cookie})
        self.assertEqual(json.loads(body)["activeJobId"], job_id)
        status, _, body = self.harness.request("POST", f"/api/polling/jobs/{job_id}/result/{pending['resultId']}/ack", headers=self._mutation_headers(cookie, csrf, **{"Content-Type": "application/json"}), body=b'{"saved":true}')
        self.assertEqual(status, 200, body)
        final = None
        for _ in range(200):
            status, _, body = self.harness.request("GET", f"/api/polling/jobs/{job_id}", headers={"Cookie": cookie})
            final = json.loads(body)
            if final["status"] == "completed":
                break
            time.sleep(0.005)
        self.assertEqual(final["processed"], 1)
        self.assertEqual(final["unsupported"], 1)
        for _ in range(200):
            status, _, body = self.harness.request("GET", "/api/polling/jobs/active", headers={"Cookie": cookie})
            if json.loads(body)["activeJobId"] is None:
                break
            time.sleep(0.005)
        self.assertIsNone(json.loads(body)["activeJobId"])
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf, **{"Content-Type": "application/json"}), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "credentials_required")

    def test_bad_digest_clears_credentials_and_cancel_is_scoped(self) -> None:
        cookie, csrf = self.harness.session()
        self._upload_credentials(cookie, csrf)
        plan = {"schemaVersion": 3, "intervalSeconds": 0, "authenticationInputSha256": "0" * 64, "managementTasks": [], "devices": [{"ip": "192.0.2.30"}]}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "credential_sha_mismatch")
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(json.loads(body)["error"], "credentials_required")
        status, _, body = self.harness.request("POST", "/api/polling/jobs/not-this-session/cancel", headers=self._mutation_headers(cookie, csrf), body=b"")
        self.assertEqual(status, 404)

    def test_invalid_random_interval_rejected_before_job_start(self) -> None:
        cookie, csrf = self.harness.session()
        for bounds in ({"intervalMinSeconds": 10}, {"intervalMinSeconds": 11, "intervalMaxSeconds": 10}, {"intervalMinSeconds": True, "intervalMaxSeconds": 10}):
            with self.subTest(bounds=bounds):
                digest = self._upload_credentials(cookie, csrf)
                plan = {"schemaVersion": 3, "authenticationInputSha256": digest, "managementTasks": [], "devices": [{"ip": "192.0.2.20"}], **bounds}
                status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf, **{"Content-Type": "application/json"}), body=json.dumps({"plan": plan}).encode())
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(body)["error"], "plan_invalid")
        digest = self._upload_credentials(cookie, csrf)
        devices = [{"ip": f"192.0.2.{number}", "category": "controller", "manufacturer": "Extron", "model": "IPCP Pro 250"} for number in (10, 20, 30)]
        plan = {"schemaVersion": 3, "authenticationInputSha256": digest, "managementTasks": [], "intervalMinSeconds": 5, "intervalMaxSeconds": 5, "devices": devices}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf, **{"Content-Type": "application/json"}), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "plan_invalid")

    def test_preparatory_parse_errors_clear_previous_credentials(self) -> None:
        cookie, csrf = self.harness.session()
        self._upload_credentials(cookie, csrf)
        status, _, body = self.harness.request("POST", "/api/polling/credentials", headers=self._mutation_headers(cookie, csrf, **{"X-File-Name": "not-xlsx.txt"}), body=b"invalid")
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "credential_file_invalid")
        plan = {"schemaVersion": 3, "authenticationInputSha256": "0" * 64, "managementTasks": [], "devices": [{"ip": "192.0.2.40"}]}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(json.loads(body)["error"], "credentials_required")

        self._upload_credentials(cookie, csrf)
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=b"{")
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "invalid_json")
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(json.loads(body)["error"], "credentials_required")

    def test_plan_v3_rejects_old_schema_and_unknown_management_task(self) -> None:
        cookie, csrf = self.harness.session()
        digest = self._upload_credentials(cookie, csrf)
        old_plan = {"schemaVersion": 2, "authenticationInputSha256": digest, "devices": [{"ip": "192.0.2.40"}]}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": old_plan}).encode())
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "plan_invalid")

        digest = self._upload_credentials(cookie, csrf)
        missing_list_source = {"schemaVersion": 3, "authenticationInputSha256": digest, "managementTasks": ["disable_insecure_management_services"], "devices": [{"ip": "192.0.2.40"}]}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": missing_list_source}).encode())
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "plan_invalid")

        digest = self._upload_credentials(cookie, csrf)
        unknown_task = {"schemaVersion": 3, "authenticationInputSha256": digest, "managementTasks": ["unknown"], "devices": [{"ip": "192.0.2.40"}]}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": unknown_task}).encode())
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "plan_invalid")

        for action_id in ("set_te20_auto_answer_automatic", "set_te20_auto_answer_manual"):
            digest = self._upload_credentials(cookie, csrf)
            invalid_answer_mode = {"schemaVersion": 3, "authenticationInputSha256": digest, "managementTasks": [action_id], "targetSource": "sr", "targetSourceSha256": "a" * 64, "selection": {"mode": "filters"}, "devices": [{"ip": "192.0.2.40", "category": "vcs", "manufacturer": "Huawei", "model": "TE20"}]}
            status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": invalid_answer_mode}).encode())
            self.assertEqual(status, 400)
            self.assertEqual(json.loads(body)["error"], "plan_invalid")


if __name__ == "__main__":
    unittest.main()
