# Tasks: TE20 SSH

## Setup

- [X] T001 Verify existing `enable_ssh` read evidence in `mvp_runtime/adapters/huawei_te40.py` and worktree state.

## Foundation

- [X] T002 Add exact actions to `runtime/device-catalog.json` and single-target gate to `mvp_runtime/polling.py`.

## User Story 1 — Choice

- [X] T003 [US1] Add three-way SSH choice, plan validation and consent in `app.js`.
- [X] T004 [US1] Test no-change/enable/disable, conflicts and model gate in `tests.js` and `python_tests/test_polling.py`.

## User Story 2 — Verified change

- [X] T005 [US2] Add bounded SSH read/write/post-read in `mvp_runtime/adapters/huawei_te40.py`.
- [X] T006 [US2] Test adapter and API gates in `python_tests/test_huawei_te40.py` and `python_tests/test_server.py`.

## Polish

- [X] T007 Update `product-catalog.js`, `AGENTS.md`, `docs/context-map.md`, `docs/implementation-log.md`, `README.md`, and ADR.
- [X] T008 Run full regression, syntax, reference and secret scans for `specs/036-te20-ssh-controls/quickstart.md`.

## Dependencies

T001 → T002 → T003/T004 → T005/T006 → T007 → T008. No parallel tasks because catalog, UI and runtime gates must stay synchronized.
