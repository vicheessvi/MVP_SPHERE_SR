# Tasks: TE20 NTP controls

## Setup

- [X] T001 Review current TE20 read and live bundle evidence in `mvp_runtime/adapters/huawei_te40.py` and `specs/037-te20-ntp-controls/research.md`.

## Foundation

- [X] T002 Register fixed action in `runtime/device-catalog.json` and validate `ntpChanges` in `mvp_runtime/polling.py` and `mvp_runtime/server.py`.

## User Story 1 — Independent choices

- [X] T003 [US1] Add three UI controls and plan/export payload in `app.js`.
- [X] T004 [US1] Test plan combinations and invalid targets in `tests.js`, `python_tests/test_polling.py`, `python_tests/test_server.py`.

## User Story 2 — Guarded write

- [X] T005 [US2] Implement exact-model NTP pre-read/one-write/post-read in `mvp_runtime/adapters/huawei_te40.py`.
- [X] T006 [US2] Test no-op, payload and failures in `python_tests/test_huawei_te40.py`.

## Polish

- [X] T007 Update `AGENTS.md`, `README.md`, `docs/context-map.md`, ADR, log and `product-catalog.js`.
- [X] T008 Run all checks in `specs/037-te20-ntp-controls/quickstart.md` and mark tasks complete.

## Dependencies

T001 → T002 → T003/T004 → T005/T006 → T007 → T008. Work on shared plan and adapter paths is sequential.
