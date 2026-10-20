# Tasks: Huawei CloudLink 300-family polling

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/web-cgi.md`, `quickstart.md`.

## Phase 1: Setup

- [x] T001 Record controlled Bar 300 read-only evidence without IP, credentials or raw response in `specs/030-huawei-cloudlink-300-polling/research.md`.
- [x] T002 Verify existing ignore and local-runtime safety boundaries in `.gitignore` and `docs/development-workflow.md`.

## Phase 2: Foundational

- [x] T003 Define exact model code/alias and resource allowlists in `mvp_runtime/adapters/huawei_300.py`.

## Phase 3: User Story 1 — Exact Bar 300 polling (P1)

**Independent Test**: Synthetic Bar 300 contract plus a controlled live read compare identity and Site name.

- [x] T004 [US1] Write failing identity, login, Site name, failure and redaction tests in `python_tests/test_huawei_300.py`.
- [x] T005 [US1] Implement guarded Bar 300 HTTPS web-CGI read-only core in `mvp_runtime/adapters/huawei_300.py`.
- [x] T006 [US1] Confirm live Bar 300 identity/Site name via `mvp_runtime/adapters/huawei_300.py` without logging raw values.

## Phase 4: User Story 2 — Box 300 and Box 600 reuse (P1)

**Independent Test**: Each exact Box synthetic response succeeds, wrong model/bundle is rejected before credentials, and no write occurs.

- [x] T007 [US2] Write failing Box 300/600 exact-model and drift tests in `python_tests/test_huawei_300.py`.
- [x] T008 [US2] Add exact Box 300/600 wrappers and model gates in `mvp_runtime/adapters/huawei_300.py`.
- [x] T009 [US2] Register three distinct transports and exact aliases in `runtime/device-catalog.json` and `mvp_runtime/polling.py`.

## Phase 5: User Story 3 — Existing workflow integration (P2)

**Independent Test**: Mixed plan routes exact 300 models; existing Huawei, Extron, management action and manual import behavior remain unchanged.

- [x] T010 [US3] Add browser capability and analyzed parameter mappings in `app.js` and `product-catalog.js`.
- [x] T011 [US3] Add catalog, plan-routing and reference regression tests in `python_tests/test_catalog.py`, `python_tests/test_polling.py` and `tests.js`.

## Phase 6: Polish and validation

- [x] T012 Document provisional Box live-validation boundary in `docs/decisions/ADR-0031-huawei-cloudlink-300-polling.md`, `docs/architecture.md`, `docs/context-map.md`, `docs/implementation-log.md`, `README.md`, `AGENTS.md` and feature artifacts.
- [x] T013 Run full Python/JavaScript/syntax/reference suites, `git diff --check` and secret/IP/artifact scan; remove temporary probe `scripts/_probe_cloudlink_300.py`.
- [ ] T014 Validate exact Box 300 and Box 600 contracts on separate real devices when available; compare Site name with their interfaces and update provisional status in `docs/decisions/ADR-0031-huawei-cloudlink-300-polling.md`.

## Dependencies

Setup → foundational allowlist → Bar 300 tests/implementation/live check → Box tests/wrappers/catalog → browser integration → validation. Box models remain provisional until separate real-device checks.

## Parallel opportunity

Documentation research and read-only repository integration audit may run independently; implementation of the shared adapter and its tests is sequential to preserve TDD and avoid conflicting edits.

## Implementation strategy

MVP is exact Bar 300. The same core then becomes separately gated for Box 300/600. No management write is included.
