# Tasks: TE20 power controls

## Setup

- [X] T001 Review existing read and live bundle evidence in `mvp_runtime/adapters/huawei_te40.py` and `specs/038-te20-power-controls/research.md`.

## Foundation

- [X] T002 Add fixed action and validate plan schema in `runtime/device-catalog.json`, `mvp_runtime/polling.py`, `mvp_runtime/server.py`.

## User Story 1 — Power choices

- [X] T003 [US1] Add power controls, confirmation and plan/export payload in `app.js`.
- [X] T004 [US1] Test choices, schedule time and model conflicts in `tests.js`, `python_tests/test_polling.py`, `python_tests/test_server.py`.

## User Story 2 — Guarded write

- [X] T005 [US2] Implement pre-read/one-write/post-read in `mvp_runtime/adapters/huawei_te40.py`.
- [X] T006 [US2] Test payload, no-op, invalid schema, post-read and full adapter in `python_tests/test_huawei_te40.py`.

## Polish

- [X] T007 Update `AGENTS.md`, `README.md`, `docs/context-map.md`, ADR/log and `product-catalog.js`.
- [X] T008 Run checks from `specs/038-te20-power-controls/quickstart.md` and mark tasks complete.

## Dependencies

T001 → T002 → T003/T004 → T005/T006 → T007 → T008. Shared code paths are sequential.
