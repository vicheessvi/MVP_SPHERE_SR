from __future__ import annotations

import json
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

    def test_nack_fails_and_cancel_unblocks_pending_result(self) -> None:
        plan = {"devices": [{"ip": "192.0.2.20"}]}

        def runner(_plan, options):
            options["on_result"]({"ip": "192.0.2.20", "ok": False}, {"index": 0, "total": 1, "device": _plan["devices"][0]})

        first = create_polling_job({"plan": plan, "credentials": [{"username": "u", "password": "p"}], "run_plan": runner})
        pending = wait_until(first.result)
        self.assertTrue(first.acknowledge(pending["resultId"], False))
        self.assertEqual(first.join(2)["safeError"], "result_save_failed")
        second = create_polling_job({"plan": plan, "credentials": [{"username": "u", "password": "p"}], "run_plan": runner})
        wait_until(second.result)
        second.cancel()
        self.assertEqual(second.join(2)["status"], "cancelled")

    def test_invalid_input_and_safe_helpers(self) -> None:
        with self.assertRaises(JobInputError):
            create_polling_job({"plan": {"devices": [], "password": "x"}, "credentials": [{}]})
        with self.assertRaises(JobInputError):
            create_polling_job({"plan": {"devices": [{"ip": "192.0.2.1"}]}, "credentials": []})
        self.assertEqual(result_filename({}, 2), "unsupported-0003.json")
        self.assertEqual(safe_job_error(RuntimeError("sensitive")), "local_runtime_error")

    def test_one_hundred_results_keep_order_and_ack_backpressure(self) -> None:
        devices = [{"ip": f"192.0.2.{index}", "category": "controller", "manufacturer": "Unknown", "model": "Synthetic", "pollingSupported": False} for index in range(1, 101)]
        job = create_polling_job({"plan": {"schemaVersion": 2, "intervalSeconds": 0, "devices": devices}, "credentials": [{"username": "u", "password": "p"}]})
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
