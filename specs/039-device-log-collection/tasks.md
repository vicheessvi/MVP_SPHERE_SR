# Tasks: device log collection

## Setup

- [X] T001 Review exact TE20 bundle and current ACK/folder/import contracts in `mvp_runtime/adapters/huawei_te40.py`, `mvp_runtime/polling_job.py`, `app.js`.

## Foundation

- [X] T002 Add `collectLogs` plan validation and exact capability gate in `mvp_runtime/polling.py`, `mvp_runtime/server.py`, `app.js`.
- [X] T003 Add one pending log stream and ACK lifecycle in `mvp_runtime/polling_job.py`, `mvp_runtime/server.py`.

## User Story 1 — Automatic collection

- [X] T004 [US1] Implement TE20 guarded log stream callback in `mvp_runtime/adapters/huawei_te40.py`.
- [X] T005 [US1] Add separate log folder selection and streaming save in `app.js`.
- [X] T006 [US1] Test adapter, runtime stream, ACK, error and unsupported model in `python_tests/` and `tests.js`.

## User Story 2 — Manual import

- [X] T007 [US2] Add nested folder import, metadata projection and format checks in `app.js`.
- [X] T008 [US2] Add metadata, ambiguity, bad-file and performance tests in `tests.js`.

## Polish

- [X] T009 Update `AGENTS.md`, `README.md`, `docs/context-map.md`, ADR/log and `product-catalog.js`.
- [X] T010 Run all checks in `specs/039-device-log-collection/quickstart.md` and mark tasks complete.
- [X] T011 [US1] Confirm exact TE40 `Token` log URL and XML prefix without full download in `mvp_runtime/adapters/huawei_te40.py` and `research.md`.
- [X] T012 [US1] Add marker-gated TE30/40/50/60 log stream and routing in `mvp_runtime/adapters/huawei_te40.py` and `mvp_runtime/polling.py`.
- [X] T013 [US1] Add synthetic exact-model, missing-marker and token-path tests in `python_tests/test_huawei_te40.py` and `python_tests/test_polling.py`.
- [ ] T014 [US1] Confirm complete folder/ACK workflow on TE40 and separate TE30/50/60 exports on user's workstation.

## Dependencies

T001 → T002/T003 → T004/T005/T006 → T007/T008 → T009/T010. Shared runtime and UI paths are sequential.
