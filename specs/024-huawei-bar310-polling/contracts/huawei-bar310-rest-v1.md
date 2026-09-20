# Contract: Huawei Bar 310 HTTPS web API v1

## Scope

Read-only automatic polling for exact Huawei Bar 310 model aliases through the web contract reproduced on a user-authorized device. Test hosts use documentation-only address ranges.

## Transport and bounds

- `https://<exact-plan-ip>:443` only.
- Default timeout: 8 seconds per request, capped at 30 seconds.
- API response: maximum 1 MiB.
- Root HTML/main bundle: maximum 8 MiB each and 12 MiB aggregate discovery.
- Strict certificate verification unless the plan explicitly enables the existing one-run local certificate exception.
- No redirect, hostname, external asset, HTTP fallback or write method other than the session lifecycle POST/DELETE operations below.

## Pre-authentication evidence

1. GET `/` and parse only same-origin absolute script paths matching `/static/js/main.<bounded-name>.chunk.js`.
2. Fetch the single bounded main bundle and require exact markers for every login path, the relative session-change action, `X-Access-Token`, and every resource path.
3. GET `/v1/login/device` and require outer `success == 1`, nested JSON object data and exact `licenseEquipName == "Bar 310"`.

Any failure returns before a credential request.

## Session and authentication

1. POST JSON `null` to `/v1/login/session`; require success and accept bounded same-origin cookies.
2. For each XLSX candidate in row order, POST JSON containing only `account` and `password` to `/v1/login/account`.
3. Record only `{attempt, ok}`. Stop after the first response whose nested data contains a non-empty `acCSRFToken`.
4. Send that value only as `X-Access-Token` while the session is active.
5. POST JSON `null` to `/action.cgi?ActionID=WEB_ChangeSessionID` and require success.
6. After collection or an authenticated failure, DELETE `/v1/login/session` best-effort. Logout failure never converts a valid collected snapshot into a configuration write or exposes session data.

## Envelope

Each JSON response is an object with integer `success`. `data` may be an object or a JSON-encoded string containing an object. Boolean success values, malformed nested JSON and unbounded bodies are rejected.

## Read-only allowlist

| Key | Method and exact path | Accepted fields |
|---|---|---|
| `version` | GET `/v1/om/version` | `terminalType`, `SN`, `softVersion`, `hardVersion`, `logicVersion`, `ESN`, bounded camera/microphone lists, license state/deadline |
| `specification` | GET `/v1/om/version/specification` | `ESN`, `wanMac`, `lanMac`, `apMac`, `staMac`, integer `runMinute`, `runHour`, `runDay`, `isRevoke` |
| `systemTime` | GET `/v1/om/config/systemtime` | integer date/time components plus daylight/DST flags |
| `license` | GET `/v1/om/license` | fixed integer capability and license fields |
| `deviceStatus` | GET `/v1/om/device/status` | integer `isSleep` |

All calls use `X-Access-Token`. There is no configuration POST/PUT/PATCH in this feature.

## Identity and success

- Post-auth `version.terminalType` must equal `Bar 310`.
- Stable identity requires non-empty `SN` or `ESN`, or one syntactically valid MAC in `specification`.
- A missing optional resource is recorded under `diagnostics.resourceErrors`.
- Missing exact model or stable identity returns `resource_schema_unconfirmed` and `ok: false`.

## Safe errors

- `tls_certificate_rejected`
- `tls_handshake_failed`
- `request_timeout`
- `transport_error`
- `response_too_large`
- `web_bundle_unavailable`
- `unsupported_web_contract`
- `target_model_mismatch`
- `session_request_failed`
- `authorization_failed`
- `session_change_failed`
- `resource_envelope_invalid`
- `resource_schema_unconfirmed`

No safe error or diagnostic contains a username, password, cookie, access token, raw header or raw body.
