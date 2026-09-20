# Tasks: Отдельные контракты Huawei Box 310 и Box 610

**Input**: Design documents from `specs/025-huawei-box-polling/`

## Phase 1: Research and contract boundaries

- [X] T001 Record manufacturer evidence and provisional limits in `specs/025-huawei-box-polling/research.md`
- [X] T002 Define separate Box 310 and Box 610 contracts in `specs/025-huawei-box-polling/contracts/`
- [X] T003 Record the architectural decision in `docs/decisions/ADR-0025-huawei-box-polling.md`

## Phase 2: Foundational tests

- [X] T004 [P] Add exact routing and fallback tests in `python_tests/test_catalog.py`
- [X] T005 [P] Add cross-model, pre-credential and projection tests in `python_tests/test_huawei_box.py`
- [X] T006 [P] Add registry/mixed-plan tests in `python_tests/test_polling.py`
- [X] T007 [P] Add frontend/catalog tests in `tests.js`

## Phase 3: User Story 1 - Box 310 contract (Priority: P1)

**Independent Test**: exact synthetic Box 310 succeeds only through its wrapper; other models stop before credentials.

- [X] T008 [US1] Refactor guarded family core without changing Bar behavior in `mvp_runtime/adapters/huawei_bar310.py`
- [X] T009 [US1] Implement exact wrapper in `mvp_runtime/adapters/huawei_box310.py`
- [X] T010 [US1] Register Box 310 transport and manifest in `mvp_runtime/polling.py` and `runtime/device-catalog.json`

## Phase 4: User Story 2 - Box 610 contract (Priority: P1)

**Independent Test**: exact synthetic Box 610 succeeds only through its wrapper; other models stop before credentials.

- [X] T011 [US2] Implement exact wrapper in `mvp_runtime/adapters/huawei_box610.py`
- [X] T012 [US2] Register Box 610 transport and manifest in `mvp_runtime/polling.py` and `runtime/device-catalog.json`

## Phase 5: User Story 3 - UI, reference and Bar regression (Priority: P2)

**Independent Test**: plans expose three distinct confirmed read-only contracts and never assign Bar/Box a management action.

- [X] T013 [US3] Add frontend capability entries in `app.js`
- [X] T014 [US3] Update centralized help and analytic rules in `product-catalog.js`
- [X] T015 [US3] Update `AGENTS.md`, `docs/architecture.md`, `docs/context-map.md` and `docs/implementation-log.md`

## Phase 6: Validation

- [X] T016 Run all commands in `specs/025-huawei-box-polling/quickstart.md`
- [X] T017 Scan tracked/untracked changes for credentials, private IPs and runtime artifacts
- [X] T018 Mark the feature complete, then record independent user validation of Box 310 and Box 610 in `specs/025-huawei-box-polling/spec.md`

## Dependencies & Execution Order

Research precedes tests; tests precede wrappers; catalog registration follows wrappers; documentation and full validation finish the feature. Box 310 and Box 610 wrappers are independently testable after the shared core.

## Parallel Opportunities

T004–T007 touch distinct test concerns. After T008, T009 and T011 can be implemented independently. Documentation files can be updated after final IDs stabilize.

## Implementation Strategy

Preserve the confirmed Bar contract, introduce exact model profiles, deliver Box 310 then Box 610, and never broaden a successful result beyond the wrapper whose gates passed.
