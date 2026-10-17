# Data Model: Huawei 310 HTTP-only management

## Exact target

- `category = vcs`, `manufacturer = Huawei`, exact Bar 310 / Box 310 / Box 610 model alias from the shared catalog.
- Each exact model keeps its existing public transport and independent contract ID.
- The management task is the existing explicit `disable_insecure_management_services` opt-in on a dedicated selected-target list.

## HTTP setting

- Confirmed by the administrator for all three exact models: `enable_http=0` means disabled; `1` means enabled.
- A current authenticated model-specific bundle must expose the approved config read/save markers and `enable_http` field.
- Read must return a non-boolean integer in `{0,1}` in the guarded configuration shape. Any other type/value is unknown and causes no write.
- If read is `1`, at most one minimal HTTP-only PUT sets `0`; a second read must return `0` before reporting success.
- If read is already `0`, no write occurs and the action is `already_compliant`.

## Telnet result

- `telnetPort23 = not_exposed` means **web management of Telnet is absent according to the administrator's model observation**. It is not a TCP/23 measurement.
- No Telnet configuration request or write is made for Bar 310, Box 310 or Box 610.

## Action result

- `id`, `status`, `changed`, `writeAttempted`, safe `before`/`after`, optional `safeError`.
- `validationStatus`: `confirmed_local_validation` for Bar 310, `provisional_user_validation` for Box 310 and Box 610 until their controlled live actions are reported.
- Credentials, cookies, access tokens, raw config bodies, real IP/MAC/serial and private bundle content never appear in stored results or repository fixtures.
