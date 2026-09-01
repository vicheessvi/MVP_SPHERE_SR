from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from mvp_runtime.catalog import CATALOG, CatalogError, load_catalog, normalize, resolve_manifest


class CatalogTests(unittest.TestCase):
    def test_shared_catalog_has_unique_entries_and_confirmed_extron(self) -> None:
        self.assertEqual(CATALOG["schemaVersion"], 1)
        keys = [item["key"] for item in CATALOG["entries"]]
        self.assertEqual(len(keys), len(set(keys)))
        controller = resolve_manifest({"category": "controller", "manufacturer": "Extron", "model": "IPCP Pro 250"})
        self.assertEqual(controller["transport"], "extron_web_dynamic_resources_v1")
        self.assertEqual(controller["protocolStatus"], "supported")
        self.assertTrue(controller["knownModel"])

    def test_alias_and_unknown_fail_closed(self) -> None:
        aliased = resolve_manifest({"category": "vcs", "manufacturer": "Huawey", "model": "TE20"})
        self.assertEqual(aliased["key"], "vcs/huawei")
        self.assertEqual(aliased["protocolStatus"], "protocol_required")
        unknown = resolve_manifest({"category": "controller", "manufacturer": "Unknown Vendor", "model": "x"})
        self.assertEqual(unknown["protocolStatus"], "unsupported")
        self.assertIsNone(unknown["transport"])
        self.assertEqual(normalize("  T  Labs "), "t labs")

    def test_invalid_catalog_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "catalog.json"
            path.write_text(json.dumps({"schemaVersion": 1, "entries": [{"key": "x"}, {"key": "x"}]}), encoding="utf-8")
            with self.assertRaises(CatalogError):
                load_catalog(path)


if __name__ == "__main__":
    unittest.main()
