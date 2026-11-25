"""Local, secret-free persistence contracts for the explicit analytics workspace."""

from __future__ import annotations

import json
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path

from mvp_runtime.workspace import WorkspaceError, WorkspaceStore


def sample_payload() -> dict:
    return {
        "schemaVersion": 1,
        "state": {
            "version": 3,
            "srImports": [{"rawSha256": "a" * 64, "status": "processed"}],
            "inventoryDevices": [{"id": "synthetic-device", "ipNormalized": "192.0.2.31"}],
            "pollingResults": [{"id": "synthetic-result", "rawSha256": "b" * 64,
                                "normalizedData": {"webBlocks": {"Device Info": {"Model": "TE40"}}}}],
        },
        "log": {
            "rows": [{"path": "synthetic/192.0.2.31.xml", "format": "Huawei TE XML", "size": 42}],
            "summary": {"files": 1, "bytes": 42},
            "indexes": {"te": {"events": [{"id": "synthetic-event", "sources": [
                {"path": "synthetic/192.0.2.31.xml", "line": 7}]}]}},
            "registry": [{"path": "synthetic/192.0.2.31.xml", "size": 42, "lastModified": 1}],
        },
    }


class WorkspaceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.project = self.root / "project"
        self.project.mkdir()
        self.selected = self.root / "selected-workspace"
        self.selected.mkdir()
        self.locator = self.root / "profile" / "workspace-location.json"
        self.store = WorkspaceStore(self.locator, self.project)

    def test_explicit_selection_commit_and_restart_restore(self) -> None:
        self.assertEqual(self.store.status()["status"], "not_configured")
        self.assertFalse(self.locator.exists())
        selected = self.store.select(self.selected)
        self.assertEqual(selected["status"], "ready")
        self.assertEqual(selected["revision"], 0)
        committed = self.store.commit(0, sample_payload())
        self.assertEqual(committed["revision"], 1)
        restarted = WorkspaceStore(self.locator, self.project)
        restored = restarted.load()
        self.assertEqual(restored["revision"], 1)
        self.assertEqual(restored["payload"]["log"]["indexes"]["te"]["events"][0]["id"], "synthetic-event")
        self.assertEqual(json.loads(self.locator.read_text(encoding="utf-8"))["path"], str(self.selected.resolve()))
        self.assertNotIn("synthetic-event", self.locator.read_text(encoding="utf-8"))

    def test_secret_or_raw_payload_rejected_without_replacing_revision(self) -> None:
        self.store.select(self.selected)
        for unsafe in (
            {"rawText": "sensitive source body"},
            {"password": "SYNTHETIC-SECRET"},
            {"field": "Basic U1lOVEhFVElDLVNFR1JFVA=="},
        ):
            payload = sample_payload()
            payload["state"]["pollingResults"][0]["normalizedData"]["unsafe"] = unsafe
            with self.subTest(unsafe=list(unsafe)):
                with self.assertRaises(WorkspaceError):
                    self.store.commit(0, payload)
                self.assertEqual(self.store.status()["revision"], 0)

    def test_conflict_missing_file_and_corruption_never_create_empty_workspace(self) -> None:
        self.store.select(self.selected)
        self.store.commit(0, sample_payload())
        with self.assertRaises(WorkspaceError) as conflict:
            self.store.commit(0, sample_payload())
        self.assertEqual(conflict.exception.code, "workspace_revision_conflict")
        db_path = self.store.database_path()
        db_path.rename(self.root / "moved.sqlite3")
        with self.assertRaises(WorkspaceError) as missing:
            self.store.load()
        self.assertEqual(missing.exception.code, "workspace_missing")
        self.assertFalse(db_path.exists())

    def test_broad_or_project_path_rejected(self) -> None:
        for candidate in (self.root.anchor, self.project, self.project / "data"):
            with self.subTest(candidate=str(candidate)):
                with self.assertRaises(WorkspaceError):
                    self.store.select(candidate)
        self.assertFalse(self.locator.exists())

    def test_polycom_archive_is_restored_only_as_metadata(self) -> None:
        self.store.select(self.selected)
        payload = sample_payload()
        payload["log"]["rows"].append({"path": "synthetic/192.0.2.32.tgz", "format": "Polycom Group TGZ", "size": 80_000_000})
        payload["log"]["registry"].append({"path": "synthetic/192.0.2.32.tgz", "size": 80_000_000,
                                            "lastModified": 2, "analysisStatus": "Архив Polycom: только метаданные"})
        self.store.commit(0, payload)
        restored = WorkspaceStore(self.locator, self.project).load()["payload"]
        self.assertEqual(restored["log"]["rows"][1]["format"], "Polycom Group TGZ")
        self.assertEqual(len(restored["log"]["indexes"]["te"]["events"]), 1)
        self.assertLess(self.store.database_path().stat().st_size, 1_000_000)

    def test_corrupt_database_is_reported_without_replacement(self) -> None:
        self.store.select(self.selected)
        path = self.store.database_path()
        path.write_bytes(b"SYNTHETIC-CORRUPT-DATABASE")
        with self.assertRaises(WorkspaceError) as failure:
            self.store.load()
        self.assertEqual(failure.exception.code, "workspace_corrupt")
        self.assertEqual(path.read_bytes(), b"SYNTHETIC-CORRUPT-DATABASE")

    def test_segment_publish_is_atomic_and_reuses_prior_parts(self) -> None:
        self.store.select(self.selected)
        self.store.commit(0, sample_payload())
        original = self.store.status()
        workspace = original["workspaceId"]
        header = sample_payload()
        for value in list(header["state"].values()) + [header["log"]["rows"], header["log"]["registry"],
                                                        header["log"]["indexes"]["te"]["events"]]:
            if isinstance(value, list):
                value.clear()
        parts = [{"meta": header}, {"key": "state/pollingResults", "offset": 0, "rows": [{"id": "synthetic"}]}]
        start = self.store.begin_parts(workspace, 1)["upload"]
        with self.assertRaises(WorkspaceError):
            self.store.finish_parts(workspace, start, 2)
        self.assertEqual(self.store.load()["payload"], sample_payload())
        for index, part in enumerate(parts):
            body = json.dumps(part)
            self.store.write_part(workspace, start, index, sha256(body.encode()).hexdigest(), body)
        self.store.finish_parts(workspace, start, 2)
        status = self.store.status()
        self.assertEqual(status["partCount"], 2)
        self.assertEqual(json.loads(self.store.read_part(workspace, 2, 1)["body"]), parts[1])
        again = self.store.begin_parts(workspace, 2)["upload"]
        for index, part in enumerate(parts):
            digest = sha256(json.dumps(part).encode()).hexdigest()
            self.assertTrue(self.store.write_part(workspace, again, index, digest, None)["stored"])
        self.store.finish_parts(workspace, again, 2)
        self.assertEqual(self.store.status()["revision"], 3)

    def test_checkpoints_survive_restart_without_publishing(self) -> None:
        selected = self.store.select(self.selected)
        workspace = selected["workspaceId"]
        scope = "b" * 64
        key = "c" * 64
        result = {"kind": "te", "scan": {"ok": True, "markers": [], "bootGaps": []}}
        self.store.write_log_checkpoint(workspace, scope, key, result)
        restarted = WorkspaceStore(self.locator, self.project)
        self.assertEqual(restarted.status()["revision"], 0)
        self.assertEqual(restarted.status()["pendingLogFiles"], 1)
        self.assertEqual(restarted.list_log_checkpoints(workspace, scope, "-"), [key])
        self.assertEqual(restarted.read_log_checkpoint(workspace, scope, key), result)
        fragment={"kind":"te","scan":{**result["scan"],"sourceCompleteness":"fragment"}}
        restarted.write_log_checkpoint(workspace,scope,key,fragment)
        self.assertEqual(restarted.read_log_checkpoint(workspace,scope,key),fragment)
        with self.assertRaises(WorkspaceError):restarted.write_log_checkpoint(workspace,scope,key,{"kind":"te","scan":{**result["scan"],"sourceCompleteness":"invented"}})
        with self.assertRaises(WorkspaceError):
            restarted.write_log_checkpoint(workspace, scope, "d" * 64, {**result, "rawText": "synthetic"})
        restarted.commit(0, sample_payload())
        restarted.clear_log_checkpoints(workspace, scope, 1, [key])
        self.assertEqual(restarted.status()["pendingLogFiles"], 0)

    def test_restore_more_than_128_mib_as_independent_parts(self) -> None:
        workspace = self.store.select(self.selected)["workspaceId"]
        transfer = self.store.begin_parts(workspace, 0)["upload"]
        header = sample_payload()
        header["state"]["pollingResults"] = []
        first = json.dumps({"meta": header})
        self.store.write_part(workspace, transfer, 0, sha256(first.encode()).hexdigest(), first)
        rows = [{"synthetic": "x" * (512 * 1024)}] * 8
        for position in range(1, 34):
            part = json.dumps({"key": "state/pollingResults", "offset": (position - 1) * len(rows), "rows": rows})
            self.store.write_part(workspace, transfer, position, sha256(part.encode()).hexdigest(), part)
        self.store.finish_parts(workspace, transfer, 34)
        restarted = WorkspaceStore(self.locator, self.project)
        status = restarted.status()
        self.assertEqual(status["partCount"], 34)
        total = 0
        for position in range(status["partCount"]):
            total += len(restarted.read_part(workspace, 1, position)["body"])
        self.assertGreater(total, 128 * 1024 * 1024)


if __name__ == "__main__":
    unittest.main()
