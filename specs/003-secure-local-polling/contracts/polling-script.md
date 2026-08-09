# Polling script contract

Input plan JSON contains `devices[]` with `ip`, `category`, `manufacturer`, `model`, plus output directory and timeout. Targets must be valid unicast IPs present in the plan.

For every device the script writes one JSON named by normalized IP. It always performs bounded ping first. Failure shape is exactly `failedStage: "ping"` and `ping.ok: false`.

If ping succeeds but no verified provider protocol is registered, output contains `failedStage: "adapter"`, `vendorPolling.status: "protocol_required"`; credentials are not read or transmitted.

The process never prints credentials, raw authorization headers or child-process command lines.
