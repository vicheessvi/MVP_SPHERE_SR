from __future__ import annotations

import json
import unittest

from mvp_runtime.redaction import PlanSecretError, assert_no_plan_secrets, sanitize_result


class RedactionTests(unittest.TestCase):
    def test_plan_rejects_secret_keys_recursively(self) -> None:
        assert_no_plan_secrets({"schemaVersion": 2, "devices": [{"ip": "192.0.2.10"}]})
        for value in (
            {"password": "synthetic"},
            {"devices": [{"authorization": "Basic synthetic"}]},
            {"nested": {"credential": {"value": "synthetic"}}},
        ):
            with self.assertRaises(PlanSecretError):
                assert_no_plan_secrets(value)

    def test_result_removes_secret_fields_and_inline_material(self) -> None:
        source = {
            "ip": "192.0.2.10",
            "headers": {"Authorization": "Basic U1lOVEhFVElD"},
            "password": "SYNTHETIC-PASSWORD",
            "nested": ["NortxeSession=SYNTHETIC", {"safe": "value"}],
        }
        clean = sanitize_result(source)
        serialized = json.dumps(clean)
        self.assertNotIn("SYNTHETIC-PASSWORD", serialized)
        self.assertNotIn("NortxeSession", serialized)
        self.assertNotIn("Authorization", serialized)
        self.assertEqual(clean["nested"][0], "[REDACTED]")

    def test_cycles_are_safe(self) -> None:
        source: dict[str, object] = {}
        source["self"] = source
        self.assertEqual(sanitize_result(source)["self"], "[CIRCULAR]")


if __name__ == "__main__":
    unittest.main()
