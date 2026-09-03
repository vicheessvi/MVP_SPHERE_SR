from __future__ import annotations

import threading
import unittest

from mvp_runtime.polling import ADAPTER_REGISTRY, PollingCancelled, PollingError, abortable_wait, probe_device, register_adapter, run_plan


SUPPORTED = {"category": "controller", "manufacturer": "Extron", "model": "IPCP Pro 250", "pollingSupported": True}
HUAWEI = {"category": "vcs", "manufacturer": "Huawei", "model": "TE40", "pollingSupported": True}


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

    def test_huawei_te40_uses_its_transport_and_shared_credential_pool(self) -> None:
        observed = []

        def huawei_adapter(device, credentials, _options):
            observed.append((device["ipNormalized"], len(credentials)))
            return {"ok": True, "capturedAt": "synthetic", "vendorPolling": {"status": "supported"}}

        result = run_plan(
            {"devices": [{**HUAWEI, "ip": "192.0.2.40"}]},
            {
                "ping": lambda *_args: {"ok": True, "durationMs": 1},
                "get_credentials": lambda *_args: [{"username": "u1", "password": "p1"}, {"username": "u2", "password": "p2"}],
                "adapters": {"huawei_te40_web_cgi_v1": huawei_adapter},
            },
        )[0]
        self.assertTrue(result["ok"])
        self.assertEqual(observed, [("192.0.2.40", 2)])

    def test_mixed_huawei_extron_plan_keeps_adapters_separate_and_te20_offline(self) -> None:
        calls = []

        def adapter(name):
            def execute(device, _credentials, _options):
                calls.append((name, device["ipNormalized"]))
                return {"ok": True, "capturedAt": "synthetic", "vendorPolling": {"status": "supported"}}
            return execute

        plan = {
            "devices": [
                {**HUAWEI, "ip": "192.0.2.40"},
                {**SUPPORTED, "ip": "192.0.2.41"},
                {"category": "vcs", "manufacturer": "Huawei", "model": "TE20", "ip": "192.0.2.42"},
            ]
        }
        results = run_plan(plan, {
            "ping": lambda *_args: {"ok": True, "durationMs": 1},
            "get_credentials": lambda *_args: [{"username": "u", "password": "p"}],
            "adapters": {
                "huawei_te40_web_cgi_v1": adapter("huawei"),
                "extron_web_dynamic_resources_v1": adapter("extron"),
            },
        })
        self.assertEqual(calls, [("huawei", "192.0.2.40"), ("extron", "192.0.2.41")])
        self.assertEqual([item["ip"] for item in results], ["192.0.2.40", "192.0.2.41", "192.0.2.42"])
        self.assertFalse(results[2]["networkAttempted"])
        self.assertEqual(results[2]["vendorPolling"]["status"], "protocol_required")


if __name__ == "__main__":
    unittest.main()
