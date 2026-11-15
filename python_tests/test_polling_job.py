from __future__ import annotations

import json
import io
import time
import unittest

from mvp_runtime.polling_job import JobInputError, create_polling_job, result_filename, safe_job_error


def wait_until(predicate, timeout: float = 2.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.005)
    raise AssertionError("condition timeout")


class PollingJobTests(unittest.TestCase):
    def test_polycom_tgz_log_requires_exact_filename_and_explicit_format(self) -> None:
        data = b"\x1f\x8bSYNTHETIC-GZIP"
        decisions = []
        def runner(_plan, options):
            decisions.append(options["on_log"](io.BytesIO(data), {"ip": "192.0.2.31", "filename": "192.0.2.31.tgz",
                "format": "polycom_syslog_tgz_v1", "index": 0, "total": 1}))
            options["on_progress"]({"stage": "processed", "result": {"ok": True, "logCollection": decisions[-1]}})
        job = create_polling_job({"plan": {"devices": [{"ip": "192.0.2.31"}], "collectLogs": True},
                                  "credentials": [{"username": "synthetic", "password": "SYNTHETIC-SECRET"}], "run_plan": runner})
        pending = wait_until(lambda: job.status()["pendingLog"])
        self.assertEqual(pending["filename"], "192.0.2.31.tgz")
        self.assertEqual(pending["format"], "polycom_syslog_tgz_v1")
        self.assertNotIn("SYNTHETIC-SECRET", json.dumps(job.status()))
        stream = job.log_stream(pending["logId"])
        self.assertEqual(stream.read(128), data)
        self.assertTrue(job.acknowledge_log(pending["logId"], True))
        self.assertEqual(job.join(2)["logsSaved"], 1)
        self.assertEqual(decisions, [{"status": "saved"}])

        failures = []
        def invalid_runner(_plan, options):
            for context in ({"ip": "192.0.2.31", "filename": "192.0.2.31.tgz"},
                            {"ip": "192.0.2.31", "filename": "192.0.2.32.tgz", "format": "polycom_syslog_tgz_v1"},
                            {"ip": "192.0.2.31", "filename": "192.0.2.31.xml", "format": "polycom_syslog_tgz_v1"}):
                failures.append(options["on_log"](io.BytesIO(data), context))
        invalid = create_polling_job({"plan": {"devices": [{"ip": "192.0.2.31"}], "collectLogs": True},
                                      "credentials": [{"username": "synthetic", "password": "SYNTHETIC-SECRET"}], "run_plan": invalid_runner})
        self.assertEqual(invalid.join(2)["status"], "completed")
        self.assertTrue(all(item["status"] == "failed" and item["safeError"] == "log_metadata_invalid" for item in failures))

    def test_failed_polycom_log_ack_does_not_stop_next_device(self) -> None:
        outcomes = []
        def runner(_plan, options):
            for index, ip in enumerate(("192.0.2.31", "192.0.2.32")):
                outcome = options["on_log"](io.BytesIO(b"\x1f\x8bSYNTHETIC"), {"ip": ip, "filename": f"{ip}.tgz",
                    "format": "polycom_syslog_tgz_v1", "index": index, "total": 2})
                outcomes.append(outcome)
                options["on_progress"]({"stage": "processed", "result": {"ok": True, "logCollection": outcome}})
        job = create_polling_job({"plan": {"devices": [{"ip": "192.0.2.31"}, {"ip": "192.0.2.32"}], "collectLogs": True},
                                  "credentials": [{"username": "synthetic", "password": "SYNTHETIC-SECRET"}], "run_plan": runner})
        first = wait_until(lambda: job.status()["pendingLog"])
        self.assertTrue(job.acknowledge_log(first["logId"], False))
        second = wait_until(lambda: (job.status()["pendingLog"] if job.status()["pendingLog"]
                               and job.status()["pendingLog"]["logId"] != first["logId"] else None))
        self.assertEqual(second["ip"], "192.0.2.32")
        self.assertTrue(job.acknowledge_log(second["logId"], True))
        finished = job.join(2)
        self.assertEqual((finished["processed"], finished["logsFailed"], finished["logsSaved"]), (2, 1, 1))
        self.assertEqual([item["status"] for item in outcomes], ["failed", "saved"])

    def test_log_stream_waits_for_ack_and_exposes_only_safe_metadata(self) -> None:
        source = io.BytesIO(b"<?xml version='1.0'?><LogModule>synthetic</LogModule>")
        decisions = []
        def runner(_plan, options):
            decisions.append(options["on_log"](source, {"ip": "192.0.2.20", "filename": "192.0.2.20.xml", "index": 0, "total": 1}))
            options["on_progress"]({"stage": "processed", "result": {"ok": True, "logCollection": decisions[-1]}})
            return []
        job = create_polling_job({"plan": {"devices": [{"ip": "192.0.2.20"}], "collectLogs": True}, "credentials": [{"username": "synthetic", "password": "SYNTHETIC-SECRET"}], "run_plan": runner})
        pending = wait_until(lambda: job.status()["pendingLog"])
        self.assertEqual(pending["filename"], "192.0.2.20.xml")
        self.assertNotIn("SYNTHETIC-SECRET", json.dumps(job.status()))
        stream = job.log_stream(pending["logId"])
        self.assertIsNotNone(stream)
        self.assertIsNone(job.log_stream(pending["logId"]))
        self.assertTrue(stream.read(128).startswith(b"<?xml"))
        self.assertTrue(job.acknowledge_log(pending["logId"], True))
        self.assertEqual(job.join(2)["logsSaved"], 1)
        self.assertEqual(decisions, [{"status": "saved"}])

    def test_result_waits_for_ack_then_completes_and_clears(self) -> None:
        terminal: list[dict] = []
        plan = {"intervalSeconds": 0, "devices": [{"ip": "192.0.2.10", "category": "controller", "manufacturer": "Extron", "model": "Synthetic"}]}

        def runner(_plan, options):
            result = {"ip": "192.0.2.10", "ok": True, "headers": {"Authorization": "Basic LEAK"}}
            options["on_result"](result, {"index": 0, "total": 1, "device": _plan["devices"][0]})
            options["on_progress"]({"stage": "processed", "result": result})
            return [result]

        job = create_polling_job({"plan": plan, "plan_id": "p", "credentials": [{"username": "u", "password": "SECRET"}], "run_plan": runner, "on_terminal": terminal.append})
        pending = wait_until(job.result)
        self.assertEqual(job.status()["status"], "waiting_for_save")
        self.assertNotIn("SECRET", json.dumps(pending))
        self.assertNotIn("Authorization", json.dumps(pending))
        self.assertTrue(job.acknowledge(pending["resultId"], True))
        status = job.join(2)
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["processed"], 1)
        self.assertEqual(status["successful"], 1)
        self.assertEqual(len(terminal), 1)

    def test_nack_records_failure_and_cancel_unblocks_pending_result(self) -> None:
        plan = {"devices": [{"ip": "192.0.2.20"}]}

        def runner(_plan, options):
            options["on_result"]({"ip": "192.0.2.20", "ok": False}, {"index": 0, "total": 1, "device": _plan["devices"][0]})

        first = create_polling_job({"plan": plan, "credentials": [{"username": "u", "password": "p"}], "run_plan": runner})
        pending = wait_until(first.result)
        self.assertTrue(first.acknowledge(pending["resultId"], False))
        finished = first.join(2)
        self.assertEqual(finished["status"], "completed")
        self.assertEqual(finished["saveFailed"], 1)
        self.assertEqual(finished["saved"], 0)
        self.assertEqual(finished["saveFailureEvents"][0], {"index": 0, "code": "result_save_failed"})
        second = create_polling_job({"plan": plan, "credentials": [{"username": "u", "password": "p"}], "run_plan": runner})
        wait_until(second.result)
        second.cancel()
        self.assertEqual(second.join(2)["status"], "cancelled")

    def test_nack_does_not_block_next_device(self) -> None:
        devices = [{"ip": "192.0.2.21"}, {"ip": "192.0.2.22"}]

        def runner(_plan, options):
            for index, device in enumerate(devices):
                result = {"ip": device["ip"], "ok": True}
                options["on_result"](result, {"index": index, "total": 2, "device": device})
                options["on_progress"]({"stage": "processed", "result": result})

        job = create_polling_job({"plan": {"devices": devices}, "credentials": [{"username": "u", "password": "p"}], "run_plan": runner})
        first = wait_until(job.result)
        self.assertTrue(job.acknowledge(first["resultId"], False))
        second = wait_until(lambda: (value if (value := job.result()) and value["resultId"] != first["resultId"] else None))
        self.assertTrue(job.acknowledge(second["resultId"], True))
        status = job.join(2)
        self.assertEqual((status["processed"], status["saved"], status["saveFailed"]), (2, 1, 1))

    def test_unacknowledged_result_times_out_and_clears_credentials(self) -> None:
        credentials = [{"username": "u", "password": "p"}]
        def runner(_plan, options):
            options["on_result"]({"ip": "192.0.2.30", "ok": True}, {"index": 0, "total": 1, "device": _plan["devices"][0]})
        job = create_polling_job({"plan": {"devices": [{"ip": "192.0.2.30"}]}, "credentials": credentials, "run_plan": runner, "save_ack_timeout_seconds": 1})
        self.assertEqual(job.join(2)["safeError"], "result_save_timeout")

    def test_invalid_input_and_safe_helpers(self) -> None:
        with self.assertRaises(JobInputError):
            create_polling_job({"plan": {"devices": [], "password": "x"}, "credentials": [{}]})
        with self.assertRaises(JobInputError):
            create_polling_job({"plan": {"devices": [{"ip": "192.0.2.1"}]}, "credentials": []})
        self.assertEqual(result_filename({}, 2), "unsupported-0003.json")
        self.assertEqual(safe_job_error(RuntimeError("sensitive")), "local_runtime_error")

    def test_one_hundred_results_keep_order_and_ack_backpressure(self) -> None:
        devices = [{"ip": f"192.0.2.{index}", "category": "controller", "manufacturer": "Unknown", "model": "Synthetic", "pollingSupported": False} for index in range(1, 101)]
        job = create_polling_job({"plan": {"schemaVersion": 3, "intervalSeconds": 0, "managementTasks": [], "devices": devices}, "credentials": [{"username": "u", "password": "p"}]})
        started = time.monotonic()
        previous = None
        filenames = []
        for expected_index in range(100):
            pending = wait_until(lambda: (value if (value := job.result()) and value["resultId"] != previous else None), timeout=5)
            self.assertEqual(pending["index"], expected_index)
            filenames.append(pending["filename"])
            previous = pending["resultId"]
            self.assertTrue(job.acknowledge(previous, True))
        status = job.join(5)
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["processed"], 100)
        self.assertEqual(status["unsupported"], 100)
        self.assertEqual(filenames[0], "192.0.2.1.json")
        self.assertEqual(filenames[-1], "192.0.2.100.json")
        self.assertLess(time.monotonic() - started, 5)


if __name__ == "__main__":
    unittest.main()
