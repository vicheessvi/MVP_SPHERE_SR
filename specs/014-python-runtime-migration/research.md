# Research: Python runtime migration

## Decision 1 — Installed Python, standard library only

- **Decision**: Target installed Python 3.11+ and require no `pip`, virtual environment or package installation.
- **Rationale**: `python.exe` is explicitly permitted on the target computer, while Node.js, CMD, PowerShell and arbitrary packaged EXE launch are restricted. Standard-library-only runtime makes the copied repository immediately runnable and keeps dependency provenance small.
- **Alternatives considered**: Bundled embeddable Python was rejected after confirmation that Python is already installed; PyInstaller/standalone EXE is prohibited; browser-only polling cannot satisfy CORS/TLS/raw network requirements.

## Decision 2 — Double-click Python entrypoint

- **Decision**: Provide `START_MVP_SPHERE_SR.py` as the sole production automatic-mode entrypoint. It validates Python/platform/resources, starts loopback on a random port and opens the one-time launch URL through `webbrowser`.
- **Rationale**: This avoids manual commands and every prohibited launcher. An official Python installation normally associates `.py` with the interpreter; «Открыть с помощью → python.exe» remains a one-time association fallback.
- **Alternatives considered**: CMD and PowerShell are policy-blocked; `.lnk` is path-bound; custom URI registration requires installation or policy changes.

## Decision 3 — Hardened local server on `ThreadingHTTPServer`

- **Decision**: Use a custom `BaseHTTPRequestHandler` on `ThreadingHTTPServer`, bound explicitly to `127.0.0.1`, with an explicit route/static allowlist, body limits, no directory serving, suppressed request logs and the existing Host/session/Origin/CSRF checks.
- **Rationale**: Browser status/result polling must remain responsive while a job thread performs device I/O. Although generic `http.server` is not a public production web framework, this application exposes one authenticated loopback-only process and replaces every unsafe default with a closed route handler.
- **Alternatives considered**: Flask/FastAPI require package installation; a custom socket HTTP parser adds security-sensitive code without benefit; serving on LAN violates the constitution.

## Decision 4 — XLSX parsing with bounded ZIP/XML reader

- **Decision**: Parse only the first worksheet using `zipfile` and bounded `ElementTree` input. Support shared strings, inline strings, booleans and scalar values; never evaluate formulas, macros, external links or styles. Enforce compressed/uncompressed entry limits and reject malformed/ambiguous workbooks.
- **Rationale**: The credential contract needs only two columns, «Логин» and «Пароль». A narrow parser is testable and avoids a runtime dependency while preserving SHA-256 verification of the exact XLSX bytes.
- **Alternatives considered**: `openpyxl` requires installation; moving credential normalization entirely to the browser would prevent independent runtime verification of the uploaded file.

## Decision 5 — Threaded polling job with explicit synchronization

- **Decision**: Represent one job as a worker thread plus cancellation event and condition-protected pending-result ACK. Session/job dictionaries and public state snapshots are lock-protected.
- **Rationale**: Current behavior is sequential and I/O-bound; threads map directly to blocking ping/HTTPS calls while leaving the HTTP server responsive. One active job per session bounds concurrency.
- **Alternatives considered**: `asyncio` would require rewriting HTTP/TLS primitives or third-party clients; per-device parallelism violates current ordering and interval semantics.

## Decision 6 — Exact HTTPS adapter port

- **Decision**: Port the evidence-based Extron dynamic-resource adapter to `http.client.HTTPSConnection`. Use a default verified `SSLContext`; create an unverified context only when the current job explicitly allows self-signed TLS. Never fall back to HTTP.
- **Rationale**: It preserves the confirmed HTTPS/443 contract and scopes the exception to one connection/job.
- **Alternatives considered**: `urllib` hides some header/cookie details; `requests` is external; global TLS disable and HTTP fallback violate the security contract.

## Decision 7 — Shared catalog, Python as production authority

- **Decision**: Extract model/protocol metadata to `runtime/device-catalog.json`, consumed by Python and any retained migration-oracle JavaScript.
- **Rationale**: Adding devices or protocols must not require editing duplicate language-specific tables.
- **Alternatives considered**: Duplicating constants risks drift; parsing JavaScript from Python is fragile and unsafe.

## Decision 8 — Remove legacy persistent loopback storage

- **Decision**: Do not port `/api/storage/*`, `SecureStore`, DPAPI vault or the PowerShell-based key bootstrap. Confirm no production UI caller exists, replace the historical server test, and document the endpoint removal.
- **Rationale**: The active product constitution and AGENTS contract require memory-only UI/runtime state and explicitly forbid credential persistence. The old endpoint is unused by `app.js` and is the only hidden PowerShell dependency at server startup.
- **Alternatives considered**: Windows DPAPI through `ctypes` is possible but preserves an unused storage surface and contradicts the current memory-only product direction.

## Decision 9 — Migration oracle then deletion

- **Decision**: Build Python contract tests first, compare fixed synthetic outputs against the current JavaScript implementation, then remove Node production launchers/runtime code. Keep Node only for browser regression and reference validation.
- **Rationale**: A direct big-bang deletion would lose evidence for subtle job and Extron behavior.
- **Alternatives considered**: Permanent dual runtimes create two authorities and double future maintenance.
