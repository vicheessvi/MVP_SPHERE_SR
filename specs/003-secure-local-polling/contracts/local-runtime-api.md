# Local runtime API contract

All routes require an ephemeral HttpOnly session created by `GET /launch?token=...`. Runtime binds only to `127.0.0.1`. State-changing requests require same-origin and `X-MVP-CSRF`.

- `GET /api/session` → `{role:"administrator", displayName:"Администратор МЦТП", csrfToken, secureRuntime:true}`.
- `GET /api/storage/:key` → decrypted value or 404; credentials key is forbidden.
- `PUT /api/storage/:key` → atomically encrypt and replace value; JSON/body never logged.
- `DELETE /api/storage/:key` → delete allowed non-vault object.
- `POST /api/credentials/import?format=json|csv` → parse, validate, atomically replace vault; response is `CredentialVaultSummary` only.
- `GET /api/credentials/summary` → summary only; no endpoint returns secrets.

No CORS headers are emitted. Requests with non-loopback Host, cross-site Origin or missing CSRF header are rejected.
