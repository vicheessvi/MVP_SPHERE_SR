# Implementation Plan: Huawei Bar 310 polling

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-19 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/024-huawei-bar310-polling/spec.md`

## Summary

Add a dedicated Python standard-library adapter for the independently evidenced Huawei Bar 310 HTTPS web contract. The adapter verifies exact Bar 310 identity through a pre-authentication endpoint and bounded same-origin bundle markers, opens an ephemeral cookie session, tries the in-memory XLSX credential pool in row order, carries the returned access token only in memory, calls a fixed GET-only resource allowlist, validates exact post-auth model plus stable identity, projects the result into existing `webBlocks`, and logs out best-effort. Catalog, UI help, documentation and synthetic contract/security tests are updated without changing TE-family or manual-import behavior.

## Technical Context

**Language/Version**: Python 3.11+ production runtime; HTML5/CSS3/Vanilla JavaScript browser UI; Node.js development checks only

**Primary Dependencies**: Python standard library only (`http.client`, `ssl`, `json`, `http.cookies`, `html.parser`, `time`); existing browser code and vendored SheetJS remain unchanged

**Storage**: No application-managed persistence; credentials, cookie and access token remain in process memory; one redacted JSON is written only to the user-selected result folder after the existing ACK flow

**Testing**: Python `unittest` synthetic contract/security tests; existing `tests.js`, reference validation, JavaScript syntax and Python compile checks

**Target Platform**: Windows 10/11 x64 with installed Python 3.11+ and local network access to the selected terminal

**Project Type**: Local desktop-style web application with authenticated loopback runtime and direct-file manual fallback

**Performance Goals**: One active device request at a time; default eight-second per-request bound; one pending result is ACKed before the next device interval

**Constraints**: Exact plan IP; HTTPS/443 only; untrusted local certificate allowed solely by explicit per-job opt-in; 1 MiB API response, 8 MiB main bundle and 12 MiB aggregate static discovery bounds; no redirects, DNS target, HTTP fallback, endpoint guessing, configuration write, external service, third-party package, secret logging or persistent session

**Scale/Scope**: One administrator and one active sequential mixed-device job; exact Bar 310 model aliases only; five confirmed GET resources plus pre-authentication, login/session-change and best-effort logout

## Constitution Check

*GATE before research: PASS. Re-check after design: PASS.*

- **I — raw evidence**: The result retains `capturedAt` and validated confirmed fields; imported raw files are not rewritten and no live transcript is persisted.
- **II — identity before comparison**: The target is the immutable plan IP; exact Bar 310 is checked before credentials and again after login, with SN/ESN or a valid MAC required for success.
- **III — deterministic normalization**: Fixed field allowlists and type checks produce the same projection for the same response objects; raw vendor strings are not silently renamed.
- **IV — incomplete data**: Optional resource failures are explicit unknowns; missing model or stable identity fails closed rather than synthesizing data.
- **V — explainability**: `failedStage`, `safeError`, attempted resource keys and safe per-resource errors explain outcomes without bodies, headers or secrets.
- **VI — local protection**: The XLSX pool order is reused in memory, only the exact HTTPS target is contacted, and credentials/cookie/access token never cross the adapter boundary.
- **Workflow**: Full SpecKit, synthetic success/auth/model/schema/TLS/timeout/redaction tests, real-device read-only acceptance and the complete project regression matrix are required.

No constitution exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/024-huawei-bar310-polling/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── huawei-bar310-rest-v1.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
mvp_runtime/
├── polling.py
└── adapters/
    ├── huawei_te40.py
    └── huawei_bar310.py
runtime/
└── device-catalog.json
python_tests/
├── test_catalog.py
├── test_huawei_bar310.py
└── test_polling.py
product-catalog.js
scripts/validate-reference.js
docs/
├── architecture.md
├── context-map.md
├── implementation-log.md
└── decisions/
    └── ADR-0024-huawei-bar310-polling.md
```

**Structure Decision**: Add one separate Bar 310 adapter behind the existing catalog and polling registry. Reuse server, job, credential, scheduling and result-ACK boundaries unchanged. Keep the TE-family adapter untouched because its CGI actions, payloads and response schemas differ materially.

## Complexity Tracking

No constitution violations or additional architectural layers require justification.
