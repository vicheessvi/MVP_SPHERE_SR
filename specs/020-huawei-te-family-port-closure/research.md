# Research: Huawei TE family port closure

## Decision: reuse one guarded family contract

The confirmed read-only TE30/TE40/TE50/TE60 transport and TE40 management action share the same web-CGI action mechanism. The extension reuses the existing action IDs and config fields only when the current device bundle and response schema confirm them.

## Rationale

Dynamic marker and schema gates avoid claiming that a model name alone proves firmware compatibility. Exact model matching before credentials and after login prevents the write from being applied to a neighbouring or substituted device.

## Alternatives considered

- Model-specific copies: rejected because they would duplicate one contract and drift.
- Assume every Huawei model is compatible: rejected; only four exact models are allowed.
- Require TCP/80 and TCP/23 probes: rejected by the agreed product criterion; menu values are authoritative for this task.

## Evidence boundary

Controlled read-only polling is confirmed for all four models. Controlled write is confirmed on TE40. TE30/TE50/TE60 remain provisional until the user reports real-device results.
