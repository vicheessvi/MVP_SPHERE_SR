from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from mvp_runtime.admin_access import configured, create_verifier, valid_input, verify


class AdminAccessTests(unittest.TestCase):
    def test_first_setup_is_atomic_and_verifier_never_contains_password(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "admin-access.json"
            password = "SYNTHETIC-ADMIN-PASSWORD-123"
            self.assertFalse(configured(path))
            self.assertTrue(create_verifier(path, "synthetic-admin", password))
            self.assertTrue(configured(path))
            self.assertFalse(create_verifier(path, "other-admin", "ANOTHER-SYNTHETIC-SECRET"))
            content = path.read_text(encoding="utf-8")
            self.assertNotIn(password, content)
            self.assertNotIn("synthetic-admin", content)
            self.assertEqual(json.loads(content)["kdf"], "scrypt")
            self.assertTrue(verify(path, "synthetic-admin", password))
            self.assertFalse(verify(path, "synthetic-admin", "WRONG-SYNTHETIC-PASSWORD"))
            self.assertFalse(verify(path, "other-admin", password))

    def test_corrupt_verifier_fails_closed(self) -> None:
        self.assertFalse(valid_input("synthetic-admin", " " * 12))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "admin-access.json"
            path.write_text("{}", encoding="utf-8")
            self.assertTrue(configured(path))
            self.assertFalse(verify(path, "synthetic-admin", "SYNTHETIC-ADMIN-PASSWORD-123"))
            path.write_text("x" * 4097, encoding="utf-8")
            self.assertFalse(verify(path, "synthetic-admin", "SYNTHETIC-ADMIN-PASSWORD-123"))
