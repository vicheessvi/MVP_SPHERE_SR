# Data Model: Huawei TE40 polling

## HuaweiTe40Target

- `ipNormalized`: exact validated IPv4 from immutable plan; required.
- `category`: must normalize to `vcs`.
- `manufacturer`: must normalize to `huawei` or configured alias.
- `model`: must normalize exactly to `te40` for contract v1.
- `allowInsecureTls`: explicit boolean scoped to the current plan/job.

Validation: target must resolve to the supported TE40 manifest and must be present in the plan allowlist. No neighboring address or hostname resolution is permitted.

## HuaweiWebSession

- `cookie`: bounded name/value pairs received from the exact target; memory-only.
- `csrfToken`: non-empty string returned by successful certificate action; memory-only.
- `initialized`: login markers and warmup completed.
- `authenticated`: credentials accepted and CSRF token received.

State transitions:

```text
new → contract_validated → initialized → authenticated → collecting → complete
  └──────────────────────────────→ failed
```

Every terminal path drops references to credentials, cookie and CSRF token. Session contents never cross the adapter result boundary.

## HuaweiActionResponse

- `action`: one value from the fixed read-only allowlist.
- `httpStatus`: bounded integer status used only for safe classification.
- `success`: application-level success indicator.
- `data`: parsed JSON value after outer-envelope validation.
- `schemaValid`: whether expected keys/types were observed.
- `safeError`: stable code when unavailable or invalid.

Raw response text and response headers are not retained in the result.

## HuaweiPollResult

- Common fields: `ip`, `capturedAt`, `ok`, `failedStage`, `safeError`, `loginAttempts`, `credentialAttempts`.
- `vendorPolling`: supported status and contract id.
- `webInterface`: confirmed markers and whether explicit insecure TLS was used.
- `webBlocks.Device Info`: model and serial number when available.
- `webBlocks.Firmware`: software, hardware, logic, microphone and camera version information when available.
- `webBlocks.Device Status`: device-local date/time and daylight fields when available.
- `webBlocks.LAN Settings`: exact target IP plus separately named WAN/LAN MAC and DHCP address/mask/gateway values.
- `webBlocks.Capabilities`: bounded terminal capabilities object.
- `rawResources`: validated inner objects keyed by stable resource name, never by arbitrary response content.
- `diagnostics`: attempted resource keys and safe per-resource errors.

Validation: success requires a stable identity signal and recognized version/model evidence. Empty optional fields remain absent/unknown. Secret-named keys are excluded and the shared sanitizer runs before API delivery.

## CatalogManifest

- Supported key: `vcs/huawei/te40` with model `TE40`, contract transport and credential-pool mode.
- Fallback key: `vcs/huawei` with remaining known models, `protocol_required` and no transport.

Resolution: exact category/manufacturer/model match has priority. If no model-specific entry matches, the fail-closed manufacturer fallback is returned.
