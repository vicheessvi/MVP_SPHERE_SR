from __future__ import annotations

import threading
import unittest
from unittest.mock import patch

from mvp_runtime.polling import ADAPTER_REGISTRY, PollingCancelled, PollingError, abortable_wait, choose_interval_seconds, plan_interval_bounds, probe_device, register_adapter, run_plan, validate_plan_interval


SUPPORTED = {"category": "controller", "manufacturer": "Extron", "model": "IPCP Pro 250", "pollingSupported": True}
HUAWEI_MODELS = tuple({"category": "vcs", "manufacturer": "Huawei", "model": model, "pollingSupported": True} for model in ("TE30", "TE40", "TE50", "TE60"))
HUAWEI_TE20 = {"category": "vcs", "manufacturer": "Huawei", "model": "TE20", "pollingSupported": True}
HUAWEI_BAR310 = {"category": "vcs", "manufacturer": "Huawei", "model": "Bar 310", "pollingSupported": True}
HUAWEI_BOX310 = {"category": "vcs", "manufacturer": "Huawei", "model": "Box 310", "pollingSupported": True}
HUAWEI_BOX610 = {"category": "vcs", "manufacturer": "Huawei", "model": "Box 610", "pollingSupported": True}


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

    def test_random_interval_drawn_for_each_next_device_with_inclusive_bounds(self) -> None:
        waits: list[float] = []
        progress: list[dict] = []
        plan = {"intervalMinSeconds": 5, "intervalMaxSeconds": 10, "devices": [{**SUPPORTED, "ip": f"192.0.2.{number}"} for number in (10, 20, 30)]}
        options = {
            "ping": lambda *_args: {"ok": True, "durationMs": 1},
            "adapters": {"extron_web_dynamic_resources_v1": lambda *_args: {"ok": True}},
            "wait": lambda duration, _event: waits.append(duration),
            "on_progress": progress.append,
        }
        with patch("mvp_runtime.polling.secrets.randbelow", side_effect=[0, 4]) as draw:
            results = run_plan(plan, options)
        self.assertEqual(len(results), 3)
        self.assertEqual(draw.call_args_list[0].args, (6,))
        self.assertEqual(draw.call_args_list[1].args, (5,))
        self.assertEqual(draw.call_count, 2)
        self.assertEqual(waits, [5.0, 10.0])
        self.assertEqual([item["waitSeconds"] for item in progress if item["stage"] == "waiting"], [5, 10])

    def test_consecutive_intervals_never_repeat_including_zero(self) -> None:
        with patch("mvp_runtime.polling.secrets.randbelow", side_effect=[0, 0, 0, 0]) as draw:
            selected = []
            for _ in range(4):
                selected.append(choose_interval_seconds(0, 1, selected[-1] if selected else None))
        self.assertEqual(selected, [0, 1, 0, 1])
        self.assertEqual([call.args[0] for call in draw.call_args_list], [2, 1, 1, 1])

    def test_zero_range_polls_without_wait_and_positive_single_value_is_rejected(self) -> None:
        two_devices = [{**SUPPORTED, "ip": f"192.0.2.{number}"} for number in (10, 20)]
        self.assertEqual(validate_plan_interval({"intervalMinSeconds": 0, "intervalMaxSeconds": 0, "devices": two_devices}), (0, 0))
        devices = [*two_devices, {**SUPPORTED, "ip": "192.0.2.30"}]
        with patch("mvp_runtime.polling.secrets.randbelow") as draw:
            results = run_plan({"intervalMinSeconds": 0, "intervalMaxSeconds": 0, "devices": devices}, {
                "ping": lambda *_args: {"ok": True, "durationMs": 1},
                "adapters": {"extron_web_dynamic_resources_v1": lambda *_args: {"ok": True}},
                "wait": lambda *_args: self.fail("zero range must not wait"),
            })
        self.assertEqual(len(results), 3)
        self.assertTrue(all(result["ok"] for result in results))
        draw.assert_not_called()
        with self.assertRaises(PollingError):
            run_plan({"intervalMinSeconds": 5, "intervalMaxSeconds": 5, "devices": devices}, {"ping": lambda *_args: self.fail("network must not start")})

    def test_interval_bounds_reject_partial_reversed_and_noninteger_values(self) -> None:
        self.assertEqual(plan_interval_bounds({"intervalSeconds": 2}), (2, 2))
        self.assertEqual(plan_interval_bounds({"intervalMinSeconds": 5, "intervalMaxSeconds": 10}), (5, 10))
        for invalid in (
            {"intervalMinSeconds": 5},
            {"intervalMaxSeconds": 10},
            {"intervalMinSeconds": 11, "intervalMaxSeconds": 10},
            {"intervalMinSeconds": True, "intervalMaxSeconds": 10},
            {"intervalMinSeconds": 0.5, "intervalMaxSeconds": 10},
            {"intervalSeconds": -1},
        ):
            with self.subTest(invalid=invalid), self.assertRaises(PollingError):
                plan_interval_bounds(invalid)

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

    def test_huawei_te_family_uses_one_transport_and_shared_credential_pool(self) -> None:
        observed = []

        def huawei_adapter(device, credentials, _options):
            observed.append((device["ipNormalized"], len(credentials)))
            return {"ok": True, "capturedAt": "synthetic", "vendorPolling": {"status": "supported"}}

        result = run_plan(
            {"intervalMinSeconds": 0, "intervalMaxSeconds": 1, "devices": [{**device, "ip": f"192.0.2.{30 + index * 10}"} for index, device in enumerate(HUAWEI_MODELS)]},
            {
                "ping": lambda *_args: {"ok": True, "durationMs": 1},
                "get_credentials": lambda *_args: [{"username": "u1", "password": "p1"}, {"username": "u2", "password": "p2"}],
                "adapters": {"huawei_te_web_cgi_v1": huawei_adapter},
                "wait": lambda *_args: None,
            },
        )
        self.assertTrue(all(item["ok"] for item in result))
        self.assertEqual(observed, [("192.0.2.30", 2), ("192.0.2.40", 2), ("192.0.2.50", 2), ("192.0.2.60", 2)])

    def test_huawei_300_family_routes_three_exact_read_only_transports(self) -> None:
        seen = []
        transports = {
            "huawei_bar300_web_cgi_v1": lambda *_args: seen.append("bar300") or {"ok": True},
            "huawei_box300_web_cgi_v1": lambda *_args: seen.append("box300") or {"ok": True},
            "huawei_box600_web_cgi_v1": lambda *_args: seen.append("box600") or {"ok": True},
        }
        plan = {"intervalMinSeconds": 0, "intervalMaxSeconds": 0, "devices": [
            {"category": "vcs", "manufacturer": "Huawei", "model": model, "ip": f"192.0.2.{number}"}
            for number, model in enumerate(("CloudLink Bar 300", "CloudLink Box 300", "CloudLink Box 600"), 31)
        ]}
        results = run_plan(plan, {"ping": lambda *_args: {"ok": True, "durationMs": 1},
            "get_credentials": lambda *_args: [{"username": "synthetic", "password": "synthetic"}],
            "adapters": transports})
        self.assertEqual(seen, ["bar300", "box300", "box600"])
        self.assertTrue(all(item["ok"] for item in results))
        self.assertNotIn("disable_insecure_management_services", str(results))

    def test_mixed_huawei_extron_plan_keeps_adapters_separate_and_other_huawei_offline(self) -> None:
        calls = []

        def adapter(name):
            def execute(device, _credentials, _options):
                calls.append((name, device["ipNormalized"]))
                return {"ok": True, "capturedAt": "synthetic", "vendorPolling": {"status": "supported"}}
            return execute

        plan = {
            "intervalMinSeconds": 0,
            "intervalMaxSeconds": 1,
            "devices": [
                {**HUAWEI_MODELS[1], "ip": "192.0.2.40"},
                {**SUPPORTED, "ip": "192.0.2.41"},
                {**HUAWEI_TE20, "ip": "192.0.2.42"},
                {**HUAWEI_BAR310, "ip": "192.0.2.44"},
                {**HUAWEI_BOX310, "ip": "192.0.2.45"},
                {**HUAWEI_BOX610, "ip": "192.0.2.46"},
                {"category": "vcs", "manufacturer": "Huawei", "model": "TX50", "ip": "192.0.2.43"},
            ]
        }
        results = run_plan(plan, {
            "ping": lambda *_args: {"ok": True, "durationMs": 1},
            "get_credentials": lambda *_args: [{"username": "u", "password": "p"}],
            "wait": lambda *_args: None,
            "adapters": {
                "huawei_te_web_cgi_v1": adapter("huawei"),
                "huawei_te20_web_cgi_v1": adapter("huawei-te20"),
                "huawei_bar310_rest_v1": adapter("huawei-bar310"),
                "huawei_box310_rest_v1": adapter("huawei-box310"),
                "huawei_box610_rest_v1": adapter("huawei-box610"),
                "extron_web_dynamic_resources_v1": adapter("extron"),
            },
        })
        self.assertEqual(calls, [("huawei", "192.0.2.40"), ("extron", "192.0.2.41"), ("huawei-te20", "192.0.2.42"), ("huawei-bar310", "192.0.2.44"), ("huawei-box310", "192.0.2.45"), ("huawei-box610", "192.0.2.46")])
        self.assertEqual([item["ip"] for item in results], ["192.0.2.40", "192.0.2.41", "192.0.2.42", "192.0.2.44", "192.0.2.45", "192.0.2.46", "192.0.2.43"])
        self.assertTrue(results[3]["ok"] and results[4]["ok"] and results[5]["ok"])
        self.assertFalse(results[6]["networkAttempted"])
        self.assertEqual(results[6]["vendorPolling"]["status"], "protocol_required")

    def test_management_task_reaches_exact_te_bar_and_box_models_through_their_own_transports(self) -> None:
        observed = []

        def adapter(device, _credentials, options):
            observed.append((device["model"], list(options.get("management_tasks") or [])))
            result = {"ok": True, "capturedAt": "synthetic", "vendorPolling": {"status": "supported"}}
            if options.get("management_tasks"):
                result["managementActions"] = [{"id": "disable_insecure_management_services", "status": "applied", "changed": True}]
            return result

        results = run_plan(
            {
                "managementTasks": ["disable_insecure_management_services"],
                "targetSource": "port_closure_list",
                "targetSourceSha256": "a" * 64,
                "intervalMinSeconds": 0,
                "intervalMaxSeconds": 1,
                "devices": [
                    {**HUAWEI_TE20, "ip": "192.0.2.20"},
                    *[
                        {**device, "ip": f"192.0.2.{30 + index * 10}"}
                        for index, device in enumerate(HUAWEI_MODELS)
                    ],
                    {**HUAWEI_BAR310, "ip": "192.0.2.80"},
                    {**HUAWEI_BOX310, "ip": "192.0.2.81"},
                    {**HUAWEI_BOX610, "ip": "192.0.2.82"},
                ],
            },
            {
                "ping": lambda *_args: {"ok": True, "durationMs": 1},
                "get_credentials": lambda *_args: [{"username": "u", "password": "p"}],
                "wait": lambda *_args: None,
                "adapters": {
                    "huawei_te20_web_cgi_v1": adapter,
                    "huawei_te_web_cgi_v1": adapter,
                    "huawei_bar310_rest_v1": adapter,
                    "huawei_box310_rest_v1": adapter,
                    "huawei_box610_rest_v1": adapter,
                },
            },
        )
        self.assertEqual(observed, [
            ("TE20", ["disable_insecure_management_services"]),
            ("TE30", ["disable_insecure_management_services"]),
            ("TE40", ["disable_insecure_management_services"]),
            ("TE50", ["disable_insecure_management_services"]),
            ("TE60", ["disable_insecure_management_services"]),
            ("Bar 310", ["disable_insecure_management_services"]),
            ("Box 310", ["disable_insecure_management_services"]),
            ("Box 610", ["disable_insecure_management_services"]),
        ])
        self.assertTrue(all(item["managementActions"][0]["status"] == "applied" for item in results))

        with self.assertRaises(PollingError):
            run_plan({"managementTasks": ["unknown"], "devices": [{**HUAWEI_MODELS[1], "ip": "192.0.2.40"}]})
        with self.assertRaises(PollingError):
            run_plan({"managementTasks": ["disable_insecure_management_services"], "devices": [{**HUAWEI_MODELS[1], "ip": "192.0.2.40"}]})


if __name__ == "__main__":
    unittest.main()
