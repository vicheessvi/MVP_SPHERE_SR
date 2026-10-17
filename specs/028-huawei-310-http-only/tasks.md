# Tasks: Huawei 310 HTTP-only management

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [Box 310 contract](contracts/box310-http-only-v1.md), [Box 610 contract](contracts/box610-http-only-v1.md)

**Organization**: Independently testable user stories, tests before implementation, exact model contracts only.

## Phase 1: Setup

- [X] T001 Record user-confirmed Box HTTP target and Telnet web-management scope in `specs/028-huawei-310-http-only/spec.md` and `research.md`.
- [X] T002 Validate the constitution and model-specific fail-closed design in `specs/028-huawei-310-http-only/plan.md`.

## Phase 2: Foundational tests

- [X] T003 [P] Add independent Box 310 and Box 610 HTTP-only success, already-compliant, marker drift, schema drift and no-Telnet tests in `python_tests/test_huawei_box.py`.
- [X] T004 [P] Add exact model capability and Box read-only-without-opt-in regression tests in `python_tests/test_catalog.py`, `python_tests/test_polling.py` and `tests.js`.

## Phase 3: User Story 1 - Accurate service report (P1)

**Goal**: Each exact 310 model reports Telnet web management unavailable without reading or writing its setting.

**Independent test**: Synthetic opt-in run on each model produces `not_exposed`, zero Telnet config requests and no TCP/23 assertion.

- [X] T005 [US1] Remove Bar 310 Telnet configuration read/marker gate in `mvp_runtime/adapters/huawei_bar310.py` and adjust `python_tests/test_huawei_bar310.py`.
- [X] T006 [US1] Apply the same no-Telnet-request result contract to exact Box actions in `mvp_runtime/adapters/huawei_bar310.py` and `python_tests/test_huawei_box.py`.
- [X] T007 [P] [US1] Clarify mixed TE-versus-310 management labels and reference text in `app.js`, `product-catalog.js` and `runtime/device-catalog.json`.

## Phase 4: User Story 2 - Preserve Bar 310 HTTP action (P1)

**Goal**: The existing Bar action remains HTTP-only with one minimal write and post-read.

**Independent test**: Enabled, disabled and drift scenarios in `python_tests/test_huawei_bar310.py` pass; ordinary polling has no config request.

- [X] T008 [US2] Verify Bar HTTP-only success/idempotence/drift/redaction in `python_tests/test_huawei_bar310.py`.

## Phase 5: User Story 3 - Guarded Box 310 and Box 610 HTTP actions (P1)

**Goal**: Exact Box models can disable HTTP using their separate guarded contracts and the user-confirmed safe target value.

**Independent test**: Each exact Box model performs at most one HTTP-only PUT after all gates and reports success only on post-read `0`; any drift makes zero writes.

- [X] T009 [US3] Declare separate provisional Box 310 and Box 610 action policies in `mvp_runtime/adapters/huawei_box310.py` and `mvp_runtime/adapters/huawei_box610.py`.
- [X] T010 [US3] Route only those exact policies through the shared guarded core in `mvp_runtime/adapters/huawei_bar310.py`, preserving ordinary read-only polling.
- [X] T011 [US3] Add exact Box aliases to the opt-in management allowlist in `runtime/device-catalog.json` and capability projection in `app.js`.
- [X] T012 [US3] Verify mixed TE/Bar/Box plan routing and unsupported Box variants in `python_tests/test_polling.py`, `python_tests/test_catalog.py` and `tests.js`.

## Phase 6: Polish and controlled acceptance

- [X] T013 [P] Update `AGENTS.md`, `docs/context-map.md`, `docs/architecture.md`, `docs/implementation-log.md`, `docs/decisions/ADR-0026-huawei-bar310-port-closure.md` and feature 026/028 documents to distinguish user-confirmed target value from live Box validation.
- [X] T014 Run complete `python_tests/`, `tests.js`, syntax/compile/reference checks and secret/artifact/private-IP scan described in `specs/028-huawei-310-http-only/quickstart.md`.
- [ ] T015 Record controlled live validation for exact Box 310 and exact Box 610 in `specs/028-huawei-310-http-only/research.md`; keep their action status provisional until the user supplies those results.

## Dependencies

T001–T002 → T003–T004 → T005–T008 → T009–T012 → T013–T015. T003 and T004 can proceed in parallel because their primary test files differ. T007 may proceed alongside Box adapter work after T004. T015 depends on available exact devices and cannot be inferred from synthetic tests.

## Suggested MVP

User Story 1 plus preserved Bar 310 action (T005–T008) yields truthful HTTP-only operation immediately. Box actions add independently after their tests and contract guards.
