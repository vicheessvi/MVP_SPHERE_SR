# Data Model: Huawei TE20 management capability

## Capability manifest

- `id`: `disable_insecure_management_services`
- `category`: exact `vcs`
- `manufacturer`: exact normalized `huawei` with the existing vendor alias only
- `models`: exact `TE20`, `TE30`, `TE40`, `TE50`, `TE60`
- `transport`: resolved from the exact device entry; TE20 remains `huawei_te20_web_cgi_v1`

## TE20 preconditions

- exact IP is present once in the immutable plan and belongs to the job allowlist;
- explicit task opt-in and separate management target list are present;
- planned model is exact TE20;
- TE20 legacy pre-auth contract is confirmed before credentials;
- post-auth version reports exact TE20;
- serial or valid MAC confirms device identity;
- current bundle contains read, save and both config markers;
- both current values parse as binary integers.

## Allowed transition

| Parameter | Safe target | Meaning |
| --- | ---: | --- |
| `enabletelnet` | `0` | Telnet disabled |
| `enable_http` | `1` | HTTP disabled in the codec menu |

No other configuration identifier or value is permitted.

## Management result

The existing `managementActions[]` item remains unchanged:

- `id`
- `transport`
- `status`: `applied`, `already_compliant`, `failed` or `skipped_unsupported`
- `changed`
- `writeAttempted`
- optional `before` and `after` with only `httpPort80` and `telnetPort23`
- optional normalized `safeError`

Credentials, cookies, CSRF, raw response bodies and device identifiers outside the ordinary redacted polling result are forbidden.

## State transitions

- Compatible + already safe → `already_compliant`, no write.
- Compatible + not safe → one minimal save → verified safe → `applied`.
- Any failed precondition before save → safe failure or unsupported result, no write.
- Save accepted but post-read missing/mismatched → `failed`, never success.
