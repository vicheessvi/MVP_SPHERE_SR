# Tasks: Huawei TE20 port closure

**Input**: Design documents from `specs/023-huawei-te20-port-closure/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Contract, routing, UI/reference and full regression tests are required because this feature expands a configuration-changing capability.

**Organization**: Tasks are grouped by user story and retain the existing plan, runtime and result schemas.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the evidence and active feature context without adding dependencies.

- [x] T001 Record the controlled TE20 read/write/re-read evidence without sensitive device data in `specs/023-huawei-te20-port-closure/research.md`
- [x] T002 Point the active SpecKit context to this feature in `.specify/feature.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the exact bounded contract before changing runtime eligibility.

- [x] T003 Define TE20 capability, preconditions, allowed values and result states in `specs/023-huawei-te20-port-closure/data-model.md`
- [x] T004 Define the exact TE20 management interface and fail-closed behavior in `specs/023-huawei-te20-port-closure/contracts/huawei-te20-management-v1.md`

**Checkpoint**: The real-device evidence and bounded management contract are reviewable before source changes.

---

## Phase 3: User Story 1 - Закрыть HTTP и Telnet на TE20 (Priority: P1) 🎯 MVP

**Goal**: Execute the existing guarded read/minimal-write/re-read action for exact TE20.

**Independent Test**: Exact TE20 issues one save with only the two allowed values when needed, issues no save when already safe, and fails closed on contract drift.

### Tests for User Story 1

- [x] T005 [US1] Add failing TE20 write, already-compliant and fail-closed contract cases in `python_tests/test_huawei_te40.py`

### Implementation for User Story 1

- [x] T006 [US1] Permit exact TE20 in the guarded management action without changing its separate TLS polling transport in `mvp_runtime/adapters/huawei_te40.py`
- [x] T007 [US1] Verify plan routing passes the action only to eligible TE20 and preserves unsupported completion in `python_tests/test_polling.py`

**Checkpoint**: User Story 1 is independently functional through the Python polling path.

---

## Phase 4: User Story 2 - Выбрать TE20 теми же фильтрами (Priority: P2)

**Goal**: Project exact TE20 as an eligible target in the existing management plan UI and catalog.

**Independent Test**: TE20 is eligible through exact filter/IP selection while TX50 and unknown Huawei models remain unsupported.

### Tests for User Story 2

- [x] T008 [P] [US2] Add failing exact catalog resolution coverage for TE20 and negative models in `python_tests/test_catalog.py`
- [x] T009 [P] [US2] Add failing frontend capability projection coverage for TE20 and negative models in `tests.js`

### Implementation for User Story 2

- [x] T010 [US2] Add exact TE20 to the capability and resolve the action transport from its exact manifest in `runtime/device-catalog.json`, `mvp_runtime/catalog.py`, and `runtime/model-catalog.js`
- [x] T011 [US2] Update the plan eligibility copy and exact model projection in `app.js`

**Checkpoint**: User Story 2 is independently testable through catalog and frontend plan projection.

---

## Phase 5: User Story 3 - Сохранить безопасный отчёт (Priority: P3)

**Goal**: Keep the result redacted and make the new supported scope visible in Russian help.

**Independent Test**: Management results expose only safe status fields, and the reference validator requires TE20 in the task description without any sensitive evidence.

### Tests for User Story 3

- [x] T012 [P] [US3] Extend reference validation for the five-model capability in `scripts/validate-reference.js`
- [x] T013 [P] [US3] Verify TE20 management output remains redacted in `python_tests/test_huawei_te40.py`

### Implementation for User Story 3

- [x] T014 [US3] Update the centralized Russian task and polling help for confirmed TE20 support in `product-catalog.js`

**Checkpoint**: All user stories are independently functional and documented.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Synchronize architecture/history and prove regression/security quality.

- [x] T015 [P] Record the architecture decision in `docs/decisions/ADR-0023-huawei-te20-port-closure.md`
- [x] T016 Update active feature routing and supported capability documentation in `AGENTS.md`, `docs/context-map.md`, `docs/architecture.md`, `docs/implementation-log.md`, and `README.md`
- [x] T017 Run every validation scenario from `specs/023-huawei-te20-port-closure/quickstart.md`
- [x] T018 Run secret, runtime-artifact and private-IP scans across all changed and untracked files before any commit

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup has no dependencies.
- Foundational depends on Setup and blocks runtime changes.
- User Story 1 depends on the bounded contract.
- User Story 2 can proceed after the contract and integrates with User Story 1 through the shared catalog action.
- User Story 3 depends on the final capability scope.
- Polish depends on all user stories.

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on other stories after Foundational.
- **User Story 2 (P2)**: Catalog eligibility must match User Story 1 runtime support.
- **User Story 3 (P3)**: Documents and validates the final scope but does not change execution behavior.

### Parallel Opportunities

- T008 and T009 affect independent test runtimes.
- T012, T013 and T015 affect independent files after capability scope is fixed.
- Full Python and JavaScript validation groups may run independently after implementation.

---

## Parallel Example: User Story 2

```text
Task: "Add exact catalog resolution coverage for TE20 in python_tests/test_catalog.py"
Task: "Add frontend capability projection coverage for TE20 in tests.js"
```

---

## Implementation Strategy

### MVP First

1. Preserve evidence and exact contract.
2. Add failing TE20 management tests.
3. Expand the guarded runtime model set by one exact model.
4. Validate write, already-safe and fail-closed behavior before UI/catalog changes.

### Incremental Delivery

1. Deliver Python action support.
2. Add exact catalog/UI eligibility.
3. Synchronize Russian help and documentation.
4. Complete all regression and security scans.

## Notes

- No new endpoint, payload field, plan schema or dependency is authorized.
- Do not store the live address, workbook, credentials, device identity or raw response.
- Completed tasks must be marked `[x]` during implementation.
