# Data Model: Python runtime migration

## RuntimeSession

- `id`: cryptographically random session identifier, cookie-only
- `csrf_token`: cryptographically random mutation token
- `created_at`: UTC ISO timestamp
- `credential_pool`: optional in-memory list of `CredentialPair`
- `credential_sha256`: optional lowercase SHA-256 of exact XLSX bytes
- `credential_summary`: safe counts only
- `active_job_id`: at most one non-terminal job
- `last_job_id`: most recent job available for final status

The session is created only by a valid unused launch token and is destroyed with the process. No field is serialized.

## CredentialPair

- `username`: non-empty trimmed string
- `password`: non-empty exact cell string

Pairs are deduplicated by exact username/password tuple, never shown in DOM/API/status/logs, and cleared by overwriting/removing list references after completion, cancellation or failure.

## CredentialSummary

- `acceptedCount`
- `rejectedCount`
- `duplicateCount`
- `emptyRowCount`
- `rejectedRows`: row number plus safe reason only

## PollingPlan

- `schemaVersion`: exactly `2`
- `authenticationInputSha256`: exact credential XLSX digest
- `scheduledAt`: optional UTC-compatible timestamp
- `intervalSeconds`: non-negative integer
- `devices`: ordered non-empty list of immutable `PlanDevice`

The recursive plan validator rejects keys that can contain credentials or session material.

## PlanDevice

- `ip` / `ipNormalized`: exact IPv4 target
- `category`
- `manufacturer`
- `model`
- `pollingSupported`

Normalized IPs must be unique. Only IPs in this immutable list enter the network allowlist.

## PollingJob

- identity: `id`, optional `planId`
- timestamps: `createdAt`, `scheduledAt`, `startedAt`, `finishedAt`
- settings: `allowInsecureTls`, `total`
- state: `scheduled | running | waiting_for_save | waiting_interval | completed | cancelled | failed`
- counters: `processed`, `successful`, `failed`, `unsupported`
- safe context: `currentDevice`, `safeError`, `pendingResult` boolean
- private synchronization: cancellation event, condition, pending result payload and ACK decision

State transitions:

```text
scheduled -> running -> waiting_for_save -> running/waiting_interval
    |           |              |                    |
    +-----------+--------------+--------------------+-> cancelled
                            final device -> completed
                       unsafe/internal error -> failed
```

Terminal transition clears credentials and all pending result references.

## PendingResult

- `resultId`: random opaque identifier
- `filename`: exact `<IP>.json` or deterministic unsupported fallback
- `payload`: redacted `PollingResult`
- `index`, `total`

Only one pending result exists. The worker cannot advance until `saved=true`; `saved=false` fails the job.

## DeviceAdapterManifest

- `key`
- normalized `category`, `manufacturer`, aliases and models
- `protocolStatus`: `supported | protocol_required | unsupported`
- `transport`: confirmed adapter key or null

The manifest is sourced from `runtime/device-catalog.json`.

## PollingResult

Preserves the existing JSON contract: `ip`, `capturedAt`, `adapterKey`, `ok`, `failedStage`, `ping`, `networkAttempted`, `vendorPolling`, optional `webInterface`, `webBlocks`, `diagnostics`, `safeError` and `outputFile`. Recursive redaction removes secret-named fields, authorization/cookie/header material and credential values before the result reaches the browser.
