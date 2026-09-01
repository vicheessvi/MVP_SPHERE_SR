from __future__ import annotations

import http.client
import json
import threading
import time
import unittest
from http.cookies import SimpleCookie
from pathlib import Path

from mvp_runtime.server import create_server
from python_tests.helpers import credential_xlsx


class ServerHarness:
    def __init__(self) -> None:
        self.server = create_server(Path(__file__).resolve().parent.parent)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host = f"127.0.0.1:{self.server.server_port}"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

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

    def session(self) -> tuple[str, str]:
        status, headers, _ = self.request("GET", f"/launch?token={self.server.state.launch_token}")
        if status != 303:
            raise AssertionError(status)
        cookie = SimpleCookie()
        cookie.load(headers["set-cookie"])
        header = f"mvp_sphere_session={cookie['mvp_sphere_session'].value}"
        status, _, body = self.request("GET", "/api/session", headers={"Cookie": header})
        if status != 200:
            raise AssertionError(status)
        return header, json.loads(body)["csrfToken"]


class ServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.harness = ServerHarness()

    def tearDown(self) -> None:
        self.harness.close()

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
        for path, expected in (("/", b"<!doctype html"), ("/app.js", b"MvpSphereSR"), ("/runtime-config.js", b"__MVP_CSRF__")):
            status, headers, body = self.harness.request("GET", path, headers={"Cookie": cookie})
            self.assertEqual(status, 200)
            self.assertIn(expected, body)
            self.assertEqual(headers["x-frame-options"], "DENY")
            self.assertEqual(headers["cache-control"], "no-store, max-age=0")
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

    def test_credential_plan_result_ack_and_terminal_clear_contract(self) -> None:
        cookie, csrf = self.harness.session()
        digest = self._upload_credentials(cookie, csrf)
        plan = {"schemaVersion": 2, "scheduledAt": "1970-01-01T00:00:00.000Z", "intervalSeconds": 0, "authenticationInputSha256": digest, "devices": [{"ip": "192.0.2.20", "category": "controller", "manufacturer": "Extron", "model": "Synthetic", "pollingSupported": False}]}
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
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf, **{"Content-Type": "application/json"}), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "credentials_required")

    def test_bad_digest_clears_credentials_and_cancel_is_scoped(self) -> None:
        cookie, csrf = self.harness.session()
        self._upload_credentials(cookie, csrf)
        plan = {"schemaVersion": 2, "intervalSeconds": 0, "authenticationInputSha256": "0" * 64, "devices": [{"ip": "192.0.2.30"}]}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "credential_sha_mismatch")
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(json.loads(body)["error"], "credentials_required")
        status, _, body = self.harness.request("POST", "/api/polling/jobs/not-this-session/cancel", headers=self._mutation_headers(cookie, csrf), body=b"")
        self.assertEqual(status, 404)

    def test_preparatory_parse_errors_clear_previous_credentials(self) -> None:
        cookie, csrf = self.harness.session()
        self._upload_credentials(cookie, csrf)
        status, _, body = self.harness.request("POST", "/api/polling/credentials", headers=self._mutation_headers(cookie, csrf, **{"X-File-Name": "not-xlsx.txt"}), body=b"invalid")
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "credential_file_invalid")
        plan = {"schemaVersion": 2, "authenticationInputSha256": "0" * 64, "devices": [{"ip": "192.0.2.40"}]}
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(json.loads(body)["error"], "credentials_required")

        self._upload_credentials(cookie, csrf)
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=b"{")
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["error"], "invalid_json")
        status, _, body = self.harness.request("POST", "/api/polling/jobs", headers=self._mutation_headers(cookie, csrf), body=json.dumps({"plan": plan}).encode())
        self.assertEqual(json.loads(body)["error"], "credentials_required")


if __name__ == "__main__":
    unittest.main()
