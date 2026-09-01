from __future__ import annotations

import threading
import unittest

from mvp_runtime.polling import ADAPTER_REGISTRY, PollingCancelled, PollingError, abortable_wait, probe_device, register_adapter, run_plan


SUPPORTED = {"category": "controller", "manufacturer": "Extron", "model": "IPCP Pro 250", "pollingSupported": True}


class PollingTests(unittest.TestCase):
    def test_probe_requires_exact_ip_allowlist(self) -> None:
        with self.assertRaises(PollingError):
            probe_device({**SUPPORTED, "ip": "192.0.2.102"}, {"allowed_ips": {"192.0.2.100"}})

    def test_sequential_order_interval_and_ack_callback(self) -> None:
        order: list[str] = []
        waits: list[float] = []

        def adapter(device, _credentials, _options):
            order.append(device["ipNormalized"])
            return {"ok": True, "capturedAt": "synthetic", "vendorPolling": {"status": "supported"}}

        plan = {"intervalSeconds": 2, "devices": [{**SUPPORTED, "ip": "192.0.2.10"}, {"category": "controller", "manufacturer": "Aten", "model": "VK2200", "ip": "192.0.2.20"}, {**SUPPORTED, "ip": "192.0.2.30"}]}
        results = run_plan(plan, {"ping": lambda _ip, _timeout: {"ok": True, "durationMs": 1}, "get_credentials": lambda *_args: [{"username": "u", "password": "p"}], "adapters": {"extron_web_dynamic_resources_v1": adapter}, "wait": lambda duration, _event: waits.append(duration), "on_result": lambda result, _context: order.append(f"ack:{result['ip']}")})
        self.assertEqual([item["ip"] for item in results], ["192.0.2.10", "192.0.2.20", "192.0.2.30"])
        self.assertEqual(order, ["192.0.2.10", "ack:192.0.2.10", "ack:192.0.2.20", "192.0.2.30", "ack:192.0.2.30"])
        self.assertEqual(waits, [2.0])
        self.assertFalse(results[1]["networkAttempted"])

    def test_duplicate_ip_ping_failure_and_cancellation(self) -> None:
        with self.assertRaises(PollingError):
            run_plan({"devices": [{**SUPPORTED, "ip": "192.0.2.1"}, {**SUPPORTED, "ip": "192.0.2.1"}]})
        result = run_plan({"devices": [{**SUPPORTED, "ip": "192.0.2.2"}]}, {"ping": lambda *_args: {"ok": False, "durationMs": 1, "safeError": "no_ping_response"}})[0]
        self.assertEqual(result["failedStage"], "ping")
        event = threading.Event()
        event.set()
        with self.assertRaises(PollingCancelled):
            abortable_wait(1000, event)

    def test_adapter_registry_is_additive_and_unknown_fails_closed(self) -> None:
        adapter = lambda *_args: {"ok": True}
        register_adapter("synthetic_test_only", adapter)
        self.assertIs(ADAPTER_REGISTRY["synthetic_test_only"], adapter)
        result = run_plan({"devices": [{"category": "controller", "manufacturer": "Unknown", "model": "X", "ip": "192.0.2.8"}]})[0]
        self.assertFalse(result["networkAttempted"])
        self.assertEqual(result["vendorPolling"]["status"], "unsupported")
        ADAPTER_REGISTRY.pop("synthetic_test_only", None)


if __name__ == "__main__":
    unittest.main()
