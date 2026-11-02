# Tasks: TE20 disable auto-update

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/auto-update-action.md`.

## Phase 1: Setup

- [X] T001 Confirm read-only TE20 `isenableautoupgrade` evidence and clean worktree in `mvp_runtime/adapters/huawei_te40.py`, `specs/033-device-settings-audit/evidence-matrix.md`, `git status`.

## Phase 2: Foundational

- [X] T002 Register exact action in `runtime/device-catalog.json` and `app.js` capability map.
- [X] T003 Extend single-target/exclusive-task plan gates in `mvp_runtime/polling.py` and `mvp_runtime/server.py`.

## Phase 3: User Story 1 — Opt-in choice (P1)

**Goal**: «Не менять» по умолчанию, «Отключить» только на одном TE20.
**Independent Test**: План без/с action, чужая модель и конфликт отклоняются.

- [X] T004 [US1] Add form choice, plan projection, consent in `app.js`.
- [X] T005 [US1] Add UI plan tests for unchanged/disable/invalid targets in `tests.js`.

## Phase 4: User Story 2 — Verified write (P1)

**Goal**: Bounded no-op or one-field write and post-read.
**Independent Test**: Synthetic adapter success and fail-closed cases.

- [X] T006 [US2] Implement exact TE20 action in `mvp_runtime/adapters/huawei_te40.py`.
- [X] T007 [US2] Add adapter, plan and API regression tests in `python_tests/test_huawei_te40.py`, `python_tests/test_polling.py`, `python_tests/test_server.py`.

## Phase 5: Polish

- [X] T008 Update `product-catalog.js`, `AGENTS.md`, `docs/context-map.md`, `docs/decisions/ADR-0038-te20-disable-auto-update.md`, `docs/implementation-log.md`, `README.md` and feature docs.
- [X] T009 Run full Python/JavaScript/reference/syntax/diff checks and private-data scan per `specs/035-te20-disable-auto-update/quickstart.md`.

## Dependencies & Execution Order

T001 → T002/T003 → T004/T005 → T006/T007 → T008 → T009. No task is parallel because UI, catalog and runtime allowlist must remain synchronized.

## Implementation Strategy

First deliver the no-change/default UI and validated single-target plan; then enable the bounded TE20 write and synthetic regressions. Live device write is a separate stage.
