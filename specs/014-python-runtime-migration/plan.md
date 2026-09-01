# Implementation Plan: Python runtime migration

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/014-python-runtime-migration/spec.md`

## Summary

Replace the production Node.js/PowerShell loopback runtime with a Python standard-library runtime launched by double-clicking `START_MVP_SPHERE_SR.py` through the already installed and permitted `python.exe`. Preserve the existing HTML/CSS/Vanilla JavaScript interface, plan v2 and polling API, sequential Extron HTTPS workflow, browser result ACK, manual `file://index.html` mode and memory-only credential boundary. Keep legacy JavaScript runtime code only until Python parity tests pass, then remove it from production entrypoints.

## Technical Context

**Language/Version**: Python 3.11+ for production runtime; HTML5/CSS3/Vanilla JavaScript for the existing browser UI; Node.js remains development-only for existing frontend regression during migration

**Primary Dependencies**: Python standard library only (`http.server`, `http.client`, `ssl`, `threading`, `subprocess`, `zipfile`, `xml.etree.ElementTree`, `hashlib`, `secrets`, `webbrowser`); vendored SheetJS remains browser-only

**Storage**: No application-managed persistent runtime storage; session, credentials, jobs and pending results remain in process memory; output JSON is written only by the browser into the user-selected folder

**Testing**: Python `unittest` contract/unit/integration suites; existing `tests.js` and `scripts/validate-reference.js` remain frontend/catalog regression; legacy Node runtime tests act only as migration oracle until equivalent Python coverage exists

**Target Platform**: Windows 10/11 x64 with installed permitted Python 3.11+ and a modern Chromium-based browser supporting File System Access for automatic output

**Project Type**: Local desktop-style web application with authenticated loopback backend and direct-file manual fallback

**Performance Goals**: Interface available within 15 seconds; one polling request active at a time; status requests remain responsive during device I/O; 100-device synthetic plan preserves deterministic order and ACK backpressure

**Constraints**: No Node.js, CMD, PowerShell, `pip`, virtual environment, installer, CDN, telemetry, non-loopback bind or external dependency at production launch; exact device IP allowlist; self-signed TLS bypass scoped to the current job only

**Scale/Scope**: One administrator session and at most one active job per session; 10 MiB credential XLSX limit, 5 MiB plan limit, 16 MiB per device response limit, current frontend scale and 100-device runtime acceptance matrix

## Constitution Check

*GATE before research: PASS. Re-check after design: PASS.*

- **I — raw evidence**: Python adapter returns the same redacted per-device JSON with `capturedAt`, source fields and unchanged browser import provenance; it does not rewrite imported SR/JSON.
- **II — identity before comparison**: Migration does not change frontend matching or identity rules. Runtime targets exact current IPs from immutable plan v2 only.
- **III — deterministic normalization**: Existing frontend normalization remains the authority. Python projections are contract-tested against fixed legacy fixtures.
- **IV — incomplete data**: Adapter errors remain partial/safe results and do not synthesize deletions.
- **V — explainability**: Existing `failedStage`, `safeError`, `vendorPolling`, ping and diagnostics shapes are preserved.
- **VI — local protection**: Server binds `127.0.0.1:0`, validates Host/Origin/session/CSRF, never persists credentials, clears them terminally, and performs network I/O only to plan IPs. Legacy DPAPI storage endpoints are removed because the active product contract is memory-only.
- **Workflow**: Feature uses Full SpecKit. Python tests cover API parity, XLSX rejection, plan allowlist, TLS scoping, cancellation, ACK, redaction and direct-file regression.

No constitution exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/014-python-runtime-migration/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── python-loopback-compatibility.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
START_MVP_SPHERE_SR.py
mvp_runtime/
├── __init__.py
├── launcher.py
├── server.py
├── credentials.py
├── catalog.py
├── redaction.py
├── polling.py
├── polling_job.py
└── adapters/
    ├── __init__.py
    └── extron.py
runtime/
├── credential-pool.js       # browser XLSX preview/validation
└── device-catalog.json      # shared runtime model/protocol source
python_tests/
├── test_credentials.py
├── test_catalog.py
├── test_extron.py
├── test_polling.py
├── test_polling_job.py
└── test_server.py
index.html
app.js
product-catalog.js
styles.css
vendor/
```

**Structure Decision**: Keep the browser application at repository root to preserve direct `index.html` behavior. Add an isolated `mvp_runtime` Python package and a standard-library `unittest` suite. Share model/protocol declarations through JSON instead of duplicating them across Python and JavaScript. Remove the current Node server/polling implementation after parity evidence, while retaining Node only as a development tool for browser regression.

## Complexity Tracking

No constitution violations or additional architectural layers require justification.
