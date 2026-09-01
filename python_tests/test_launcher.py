from __future__ import annotations

import http.client
import tempfile
import threading
import unittest
from http.cookies import SimpleCookie
from pathlib import Path

from mvp_runtime.launcher import LaunchError, REQUIRED_FILES, validate_environment
from mvp_runtime.server import create_server


class LauncherTests(unittest.TestCase):
    def test_current_project_and_unicode_copy_validate(self) -> None:
        root = Path(__file__).resolve().parent.parent
        self.assertEqual(validate_environment(root, (3, 11, 0)), root)
        for prefix in ("MVP path with spaces ", "МВП_кириллица_"):
            with tempfile.TemporaryDirectory(prefix=prefix) as directory:
                copy_root = Path(directory)
                for relative in REQUIRED_FILES:
                    target = copy_root / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes((root / relative).read_bytes())
                self.assertEqual(validate_environment(copy_root, (3, 12, 0)), copy_root.resolve())
                server = create_server(copy_root)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                try:
                    host = f"127.0.0.1:{server.server_port}"
                    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                    connection.request("GET", f"/launch?token={server.state.launch_token}", headers={"Host": host})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 303)
                    cookie = SimpleCookie()
                    cookie.load(response.getheader("Set-Cookie"))
                    response.read()
                    connection.close()
                    connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                    connection.request("GET", "/", headers={"Host": host, "Cookie": f"mvp_sphere_session={cookie['mvp_sphere_session'].value}"})
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertIn(b"<!doctype html", response.read())
                    connection.close()
                finally:
                    server.shutdown()
                    server.server_close()
                    thread.join(timeout=2)

    def test_old_python_and_missing_resources_fail_before_server(self) -> None:
        with self.assertRaisesRegex(LaunchError, "3.11"):
            validate_environment(Path.cwd(), (3, 10, 99))
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(LaunchError, "неполон"):
                validate_environment(directory, (3, 11, 0))


if __name__ == "__main__":
    unittest.main()
