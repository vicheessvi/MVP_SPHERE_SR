# Python loopback compatibility contract

This contract replaces the Node implementation behind the existing feature 013 browser API. JSON field names and status codes remain unchanged unless explicitly stated.

## Session and static resources

- `GET /launch?token=<one-time>` validates exact loopback Host and unused launch token, sets `mvp_sphere_session` as `HttpOnly; SameSite=Strict; Path=/`, then redirects `303 /`.
- `GET /api/session` returns `{ secureRuntime: true, role: "administrator", displayName: "Администратор МЦТП", csrfToken }`.
- `GET /`, `/app.js`, `/product-catalog.js`, `/styles.css`, `/runtime-config.js`, `/vendor/xlsx.full.min.js`, `/runtime/credential-pool.js` serves only the exact allowlisted project files.
- Every response includes no-store, nosniff, DENY frame, no-referrer, same-origin opener and the existing local CSP.

All routes except the initial `/launch` require the session cookie and an exact `Host` of the active `127.0.0.1|localhost` port. Mutations also require exact `Origin` and `X-MVP-CSRF`.

## Credentials

### `POST /api/polling/credentials`

- Requires `.xlsx` filename in `X-File-Name` and body up to 10 MiB.
- Parses only the first worksheet without evaluating formulas.
- Success `200`: `{ ok: true, summary, sourceSha256 }`.
- Invalid file `400`: `{ ok: false, error: "credential_file_invalid" }` and session credential state cleared.
- Active job `409`: `job_already_active`.

### `DELETE /api/polling/credentials`

Clears the in-memory pool when no job is active.

## Jobs

### `POST /api/polling/jobs`

Accepts `{ planId, plan, allowInsecureTls }`. Requires plan schema 2, non-empty unique devices, recursive absence of credential-like keys and exact XLSX SHA-256. Success `202`: `{ ok: true, jobId, status }`.

### `GET /api/polling/jobs/{jobId}`

Returns safe public status fields only. A session can access only its active or last job.

### `POST /api/polling/jobs/{jobId}/cancel`

Sets cancellation, unblocks schedule/interval/ACK wait and returns current safe status.

### `GET /api/polling/jobs/{jobId}/result`

- `204` when no result awaits browser storage.
- `200 { ok: true, resultId, filename, payload, index, total }` for one redacted pending result.

### `POST /api/polling/jobs/{jobId}/result/{resultId}/ack`

Accepts `{ saved: boolean }`. Exact current ID plus boolean is required. `saved=true` allows the runner to continue; `saved=false` terminates with `result_save_failed`.

## Removed legacy endpoint

`/api/storage/*` is intentionally not implemented. It has no production UI caller and conflicts with the current memory-only runtime contract. Requests return `404 not_found`.

## Safe errors

Transport, parser and internal exceptions return only stable codes (`request_too_large`, `invalid_json`, `credential_file_invalid`, `plan_invalid`, `credential_sha_mismatch`, `job_not_found`, `result_ack_rejected`, `local_runtime_error`) and the generic Russian local-operation message. Exception strings, paths, credentials and device response bodies are never returned.

## Adapter evidence contract

An adapter may be registered only when transport, port, TLS behavior, authentication endpoints and minimum response evidence have been confirmed by official documentation or a reproducible device inspection. Its manifest lives in `runtime/device-catalog.json`; implementation lives under `mvp_runtime/adapters/`; registration occurs in `mvp_runtime/polling.py`. It must accept only the exact normalized IP supplied by the immutable plan, enforce bounded time/response sizes, return stable safe errors and pass synthetic success/auth/unknown-contract/TLS/redaction tests. Unknown or incomplete manifests remain `protocol_required` with `networkAttempted: false`.
