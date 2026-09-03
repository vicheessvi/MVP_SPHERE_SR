# Implementation Plan: Huawei TE40 polling

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-huawei-te40-polling/spec.md`

## Summary

Add an isolated Python standard-library adapter for the reproducibly evidenced Huawei TE40 legacy web CGI contract. The adapter performs exact-IP HTTPS initialization, validates login-bundle markers before credentials, maintains one ephemeral cookie session, obtains a CSRF token through the browser-equivalent login flow, calls only a fixed allowlist of confirmed read-only actions, projects bounded results into the existing `webBlocks` shape and fails closed on unknown schemas. Catalog resolution is refined to prefer exact model entries so TE40 becomes supported while other Huawei models remain `protocol_required`.

## Technical Context

**Language/Version**: Python 3.11+ production runtime; HTML5/CSS3/Vanilla JavaScript browser UI; Node.js development checks only

**Primary Dependencies**: Python standard library only (`http.client`, `ssl`, `json`, `http.cookies`, `time`); existing browser code and vendored SheetJS remain unchanged

**Storage**: No application-managed persistence; credentials, cookie and CSRF token remain in process memory; browser writes redacted JSON only to the user-selected result folder after ACK

**Testing**: Python `unittest` synthetic contract/security tests; existing `tests.js`, reference validation and syntax checks

**Target Platform**: Windows 10/11 x64 with installed Python 3.11+ and direct local network access to the selected terminal

**Project Type**: Local desktop-style web application with authenticated loopback runtime and direct-file manual fallback

**Performance Goals**: One active device request at a time; maximum 8 seconds per request by default; successful TE40 produces one pending result before the next device interval

**Constraints**: Exact plan IP only; HTTPS/443 only; self-signed and legacy TLS accepted solely under explicit per-job insecure-TLS permission; maximum 8 MiB static bundle and 1 MiB action response; no HTTP fallback, endpoint guessing, external service, third-party package, secret logging or persistent session

**Scale/Scope**: One administrator, one active job, sequential mixed-device plans; first supported Huawei scope is exact model TE40 and six confirmed read-only responses

## Constitution Check

*GATE before research: PASS. Re-check after design: PASS.*

- **I — raw evidence**: The adapter preserves received confirmed fields in a single result with `capturedAt` and endpoint-key diagnostics; imported raw files are not rewritten.
- **II — identity before comparison**: Polling targets only the exact immutable plan IP. TE40 projection preserves serial and both named MAC interfaces; matching remains the frontend authority.
- **III — deterministic normalization**: The same bounded response objects produce the same `webBlocks`; no locale-dependent vendor field rewriting occurs.
- **IV — incomplete data**: Missing optional actions become unknown resource entries, not deletions. Missing all stable evidence fails closed.
- **V — explainability**: `failedStage`, `safeError`, attempted action keys and resource errors explain every outcome without raw error bodies.
- **VI — local protection**: Credentials, cookie and CSRF token are kept in one in-memory adapter invocation and omitted from output. Network access is HTTPS to the exact allowlisted IP only; no external dependency or storage is introduced.
- **Workflow**: Full SpecKit artifacts, synthetic success/auth/unknown-contract/TLS/timeout/redaction tests and complete regression matrix are required.

No constitution exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/016-huawei-te40-polling/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── huawei-te40-web-cgi-v1.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
mvp_runtime/
├── catalog.py
├── polling.py
└── adapters/
    ├── extron.py
    └── huawei_te40.py
runtime/
├── device-catalog.json
└── model-catalog.js
python_tests/
├── test_catalog.py
├── test_huawei_te40.py
└── test_polling.py
product-catalog.js
scripts/validate-reference.js
docs/
├── architecture.md
├── implementation-log.md
└── decisions/
    └── ADR-0016-huawei-te40-polling.md
```

**Structure Decision**: Add one vendor-isolated adapter behind the existing registry and job/server boundaries. Refine shared catalog resolution in both Python and development JavaScript so an exact model-specific supported entry wins over the manufacturer fallback. Keep all browser/API and output-ACK behavior shared.

## Complexity Tracking

No constitution violations or additional architectural layers require justification.
