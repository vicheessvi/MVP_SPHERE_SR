# Implementation Plan: Polycom RealPresence Group polling

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-10-25 | **Spec**: [spec.md](spec.md)

## Summary

Add one bounded HTTPS web-session core with four exact-model contracts for RealPresence Group 310, 300, 500 and 700. Group 310 was validated locally and subsequently confirmed by the administrator; Group 500 and 700 were confirmed by separate successful administrator polls. Group 300 remains provisional. Reuse the existing plan, ephemeral credentials, adapter registry and JSON output.

## Technical Context

**Language/Version**: Python 3.11+ standard library; Vanilla JavaScript UI
**Primary Dependencies**: `http.client`, `ssl`, `json`, existing local runtime only
**Storage**: Session memory; completed redacted JSON only in user-selected folder
**Testing**: `unittest`, existing `tests.js`, reference validator, controlled live 310 read
**Target Platform**: Windows local host, Python loopback runtime
**Project Type**: Local browser UI plus Python polling runtime
**Performance Goals**: At most one bounded sequential session per device; existing plan interval unchanged
**Constraints**: HTTPS/443 only; explicit target IP; no generic REST crawling; no configuration writes; bounded response and decompression; session cookie in memory; certificate verification by default with existing per-run insecure-TLS opt-in
**Scale/Scope**: Four exact Group models; controlled local validation on 310, user operational confirmation on 310/500/700, pending on 300

## Constitution Check

**Pre-research gate**: PASS. The planned result is source-backed and read-only, never stored internally, uses only Python stdlib and existing loopback workflow, separates planned from observed identity, and represents missing fields as unknown. No write action or external service is required.

**Post-design gate**: PASS. Each model has an exact post-login gate and distinct validation status; user confirmations of 310/500/700 do not relax these gates. The pre-login interface cannot disclose exact model on the checked 310 (`/rest/system` returns 403 without login), so credentials are sent only to the administrator-selected exact IP after the current Polycom login interface and method markers match; this residual risk is disclosed and mitigated by default certificate verification and explicit insecure-TLS consent. An exact model mismatch never yields a successful result.

## Project Structure

### Documentation

```text
specs/031-polycom-group-polling/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/web-rest.md
├── tasks.md
└── checklists/requirements.md
```

### Source Code

```text
mvp_runtime/adapters/polycom_group.py
mvp_runtime/polling.py
runtime/device-catalog.json
app.js
product-catalog.js
python_tests/test_polycom_group.py
python_tests/test_catalog.py
tests.js
docs/context-map.md
docs/decisions/ADR-0032-polycom-group-polling.md
docs/implementation-log.md
```

**Structure Decision**: Keep one shared core with four exact contract descriptors, not four copies of the transport. Keep existing server/job/browser APIs intact.

## Complexity Tracking

No constitution violations. Group 300 remains deliberately provisional; successful tests of 310/500/700 are not claimed as evidence for it.
