# Contract: exact Huawei Box 610 HTTP-only action

## Eligibility

1. Plan schema v3 explicitly opts into `disable_insecure_management_services` and selects an exact Box 610 target from the dedicated list.
2. The existing `huawei_box610_rest_v1` wrapper confirms exact Box 610 before credentials and again after login, with stable SN/ESN or MAC.
3. The current bundle has the guarded `/v1/om/config` read/save markers and `enable_http`; no marker inference from either Box 310 or Bar 310 alone.

## Operation

1. Authenticated `POST /v1/om/config` with only `enable_http` reads a non-boolean integer `0` or `1`.
2. If `0`, return `already_compliant` without PUT. If `1`, send exactly one `PUT /v1/om/config` containing only `CfgItemInt[{CfgItemID:"enable_http",CfgItemInfo:0}]` and empty `CfgItemString`.
3. Repeat the HTTP read; only `0` confirms `applied`. Any unknown, failed or ambiguous response returns a safe failure without further write.
4. Report Telnet web management as `not_exposed`, with no Telnet request/write and no claim about TCP/23.

## Failure gates

Unknown model, unstable identity, missing bundle marker, unexpected read schema, unexpected enabled/disabled value, failed PUT, failed post-read or logout diagnostic all retain safe redacted output. The HTTP write path is provisional until a controlled exact Box 610 live run validates it independently.
