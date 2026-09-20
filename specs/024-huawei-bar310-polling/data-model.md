# Data Model: Huawei Bar 310 polling

## HuaweiBar310Target

- `ipNormalized`: exact validated IPv4 from the immutable plan; required.
- `category`: must normalize to `vcs`.
- `manufacturer`: must normalize to `huawei` or the configured alias.
- `model`: must match one explicit Bar 310 catalog alias.
- `allowInsecureTls`: explicit boolean scoped to the current plan/job.

Validation: target must resolve to the Bar 310 manifest and be present in the plan allowlist. Hostnames, neighboring addresses and redirects are forbidden.

## HuaweiBar310Session

- `cookies`: bounded same-origin cookie name/value map; memory-only.
- `accessToken`: non-empty token returned only after successful account login; memory-only.
- `preauthModelConfirmed`: exact `/v1/login/device` evidence.
- `bundleConfirmed`: all fixed path markers found in the discovered same-origin main bundle.
- `authenticated`: one XLSX candidate accepted.

State transitions:

```text
new → preauth-confirmed → session-open → authenticated → session-changed → collecting → complete
  └──────────────────────────────────────────────────────────────────────→ failed
```

Every authenticated terminal path attempts a session DELETE and drops references to credentials, cookies and token. None are returned.

## HuaweiBar310Resource

- `key`: one of `version`, `specification`, `systemTime`, `license`, `deviceStatus`.
- `path`: one exact GET path from the contract allowlist.
- `success`: outer application indicator.
- `data`: validated nested object.
- `safeError`: stable code when unavailable or invalid.

Raw body, headers, cookie and access token are not retained in the result.

## HuaweiBar310PollResult

- Common fields: `ip`, `capturedAt`, `ok`, `failedStage`, `safeError`, `loginAttempts`, `credentialAttempts`.
- `vendorPolling`: supported status, contract id and exact model.
- `webInterface`: safe evidence label, TLS mode and model-gate status.
- `webBlocks.Device Info`: exact model and serial/ESN when available.
- `webBlocks.Firmware`: software, hardware, logic and license state fields.
- `webBlocks.Device Status`: local date/time, daylight/DST, uptime components and sleep state.
- `webBlocks.LAN Settings`: exact plan IP and validated named MAC interfaces.
- `webBlocks.Capabilities`: fixed licensed-capability projection.
- `rawResources`: only validated allowlisted fields, passed through shared secret-key sanitization.
- `diagnostics`: attempted keys and safe per-resource errors.

Success requires exact post-auth model and stable identity. Missing optional fields remain absent.

## CatalogManifest

- Supported key: `vcs/huawei/bar310`.
- Supported aliases: exact `Bar 310`, `CloudLink Bar 310` and the existing SR spelling `CloudLinc Bar 310`.
- Transport: `huawei_bar310_rest_v1`.
- Credential mode: memory XLSX pool.
- Management actions: none.

Resolution prefers the exact model entry; other Huawei Bar/Box models continue through the `protocol_required` fallback.
