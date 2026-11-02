# Tasks: TE20 independent HTTP/Telnet controls

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/port-actions.md`.

## Phase 1: Setup

- [X] T001 Verify exact TE20 evidence and current branch state in `mvp_runtime/adapters/huawei_te40.py`, `specs/033-device-settings-audit/evidence-matrix.md`, `git status`.

## Phase 2: Foundational

- [X] T002 Add fixed exact-TE20 action IDs and capabilities in `runtime/device-catalog.json` and `app.js`.
- [X] T003 Add single-target and action-conflict validation in `mvp_runtime/polling.py` and `mvp_runtime/server.py`.

## Phase 3: User Story 1 — Independent choice (P1)

**Goal**: Three choices per port, no command for unchanged.

**Independent Test**: Plan generation for nine combinations, conflict and model guards.

- [X] T004 [US1] Add two form selectors and plan projection in `app.js` and `index.html` if necessary.
- [X] T005 [US1] Add browser plan tests for choices, target gate and confirmation in `tests.js`.

## Phase 4: User Story 2 — Verified change (P1)

**Goal**: Bounded single-field writes with independent safe results.

**Independent Test**: Synthetic adapter tests for open, close, no-op and failure.

- [X] T006 [US2] Add exact TE20 per-port pre-read/write/post-read helper in `mvp_runtime/adapters/huawei_te40.py`.
- [X] T007 [US2] Add adapter and runtime validation tests in `python_tests/test_huawei_te40.py`, `python_tests/test_polling.py`, `python_tests/test_server.py`.

## Phase 5: Polish

- [X] T008 Update `AGENTS.md`, `docs/context-map.md`, `docs/decisions/ADR-0037-te20-independent-port-controls.md`, `docs/implementation-log.md`, `product-catalog.js`, and feature docs.
- [X] T009 Run Python, JavaScript, reference, syntax, diff, and secret scans per `specs/034-te20-independent-port-controls/quickstart.md`.

## Dependencies & Execution Order

T001 → T002/T003 → T004/T005 → T006/T007 → T008 → T009. No task is marked parallel because catalog, UI and plan validation must agree before network actions are exposed.

## Implementation Strategy

MVP: selectors and validated plan with no write for unchanged; then exact TE20 adapter action and synthetic regression tests. Live writes are a separate, explicitly selected test after implementation.
