# Data Model: Huawei Bar 310 management action

## Action request

- `id`: `disable_insecure_management_services`
- `managementTasks`: explicit plan v3 opt-in
- exact models: `Bar 310`, `CloudLink Bar 310`, `CloudLinc Bar 310`
- transport: existing `huawei_bar310_rest_v1`

## Confirmed configuration

| Field | Read | Safe target | Write policy |
|---|---|---:|---|
| `enable_http` | `POST /v1/om/config` | `0` | one-item `PUT /v1/om/config` when needed |
| Telnet management | no request | none | exact Bar model reports `not_exposed`; TCP/23 is not inferred |

## Safe action result

- `id`: action identifier
- `transport`: `https/443`
- `status`: `already_compliant`, `applied`, `failed`, or `skipped_unsupported`
- `changed`: boolean
- `writeAttempted`: boolean
- `before` / `after`:
  - `httpPort80`: `enabled`, `disabled`, or `unknown`
  - `telnetPort23`: `not_exposed` or `unknown`
- `safeError`: bounded code only when failed

No credential, cookie, access token, raw header/body, IP identity or firmware error detail is added to the action result.
