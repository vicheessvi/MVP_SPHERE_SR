# Tasks: Huawei TE family port closure

## Phase 1: Specification and safety boundary

- [x] T001 Define the four-model exact allowlist and provisional evidence boundary in specs/020-huawei-te-family-port-closure/spec.md
- [x] T002 Document the shared guarded contract in specs/020-huawei-te-family-port-closure/contracts/huawei-te-family-management-v1.md

## Phase 2: User Story 1 — capability selection

- [x] T003 [US1] Extend the catalog capability in runtime/device-catalog.json
- [x] T004 [US1] Extend frontend model descriptors and messages in app.js
- [x] T005 [US1] Add catalog and frontend regression coverage in python_tests/test_catalog.py and tests.js

## Phase 3: User Story 2 — guarded write

- [x] T006 [US2] Reuse the guarded action for all supported models in mvp_runtime/adapters/huawei_te40.py
- [x] T007 [US2] Cover all four exact models and runtime routing in python_tests/test_huawei_te40.py and python_tests/test_polling.py

## Phase 4: User Story 3 — reference and documentation

- [x] T008 [US3] Update user-facing reference in product-catalog.js
- [x] T009 [US3] Synchronize architecture and decision records in docs/architecture.md and docs/decisions/ADR-0020-huawei-te-family-port-closure.md

## Phase 5: Validation

- [x] T010 Run complete Python, JavaScript, reference, syntax, diff and secret checks
- [x] T011 Record final validation in docs/implementation-log.md

## Dependencies

US1 precedes US2 routing validation. US3 can be validated after the runtime and catalog agree.

## Independent tests

- US1: four exact models are eligible and any other model is rejected.
- US2: each supported model performs exact read/write/re-read; mismatch and schema drift perform no write.
- US3: UI and reference name the same four-model scope without exposing secrets.
