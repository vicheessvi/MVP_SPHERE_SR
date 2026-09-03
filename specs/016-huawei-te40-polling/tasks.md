# Tasks: Huawei TE40 polling

**Input**: Design documents from `specs/016-huawei-te40-polling/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Contract and regression tests are required by SC-002 through SC-005.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preserve the verified evidence and prepare isolated implementation locations.

- [x] T001 Record the Huawei TE40 evidence boundary and implementation scope in `docs/decisions/ADR-0016-huawei-te40-polling.md`
- [x] T002 [P] Add the feature validation commands and live-data exclusion note to `specs/016-huawei-te40-polling/quickstart.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make model-specific catalog routing fail closed before enabling any Huawei network transport.

- [x] T003 [P] Add exact-model-first and vendor-fallback resolution tests in `python_tests/test_catalog.py`
- [x] T004 [P] Add matching JavaScript catalog resolution regression cases in `tests.js`
- [x] T005 Implement exact-model-first manifest resolution in `mvp_runtime/catalog.py`
- [x] T006 Implement matching exact-model-first resolution in `runtime/model-catalog.js`
- [x] T007 Split the Huawei TE40 supported entry from the remaining protocol-required Huawei models in `runtime/device-catalog.json`

**Checkpoint**: TE40 resolves to its dedicated transport; other Huawei models remain fail-closed without network attempts.

---

## Phase 3: User Story 1 - Автоматический опрос TE40 (Priority: P1) 🎯 MVP

**Goal**: Authenticate to an evidenced TE40 and collect the fixed read-only identity, version, time, network and capability resources.

**Independent Test**: A synthetic compatible device receives the exact login order, cookie and CSRF context and returns one result containing a MAC, serial and multiple additional parameter groups.

### Tests for User Story 1

- [x] T008 [P] [US1] Add synthetic success, login-order, cookie and CSRF contract tests in `python_tests/test_huawei_te40.py`
- [x] T009 [P] [US1] Add projection tests for identity, firmware, local time, network and capabilities in `python_tests/test_huawei_te40.py`
- [x] T010 [P] [US1] Add supported Huawei routing and mixed credential-pool coverage in `python_tests/test_polling.py`

### Implementation for User Story 1

- [x] T011 [US1] Implement bounded HTTPS request, cookie handling and transport classification in `mvp_runtime/adapters/huawei_te40.py`
- [x] T012 [US1] Implement pre-auth bundle validation and browser-compatible authentication in `mvp_runtime/adapters/huawei_te40.py`
- [x] T013 [US1] Implement the six-action read-only allowlist and schema validation in `mvp_runtime/adapters/huawei_te40.py`
- [x] T014 [US1] Implement deterministic Huawei `webBlocks` and validated `rawResources` projection in `mvp_runtime/adapters/huawei_te40.py`
- [x] T015 [US1] Register `huawei_te40_web_cgi_v1` through the existing adapter registry in `mvp_runtime/polling.py`

**Checkpoint**: User Story 1 is independently functional through the existing polling orchestrator.

---

## Phase 4: User Story 2 - Безопасный отказ (Priority: P2)

**Goal**: Fail safely for bad credentials, active sessions, unknown firmware, TLS/timeout and malformed or oversized responses.

**Independent Test**: Every synthetic failure returns only stable safe codes and contains none of the supplied secret markers or raw response text.

### Tests for User Story 2

- [x] T016 [P] [US2] Add auth failure, active-session and unknown-login-bundle tests in `python_tests/test_huawei_te40.py`
- [x] T017 [P] [US2] Add TLS, timeout, malformed-envelope, schema-drift and partial-resource tests in `python_tests/test_huawei_te40.py`
- [x] T018 [P] [US2] Add Huawei credential, cookie and CSRF redaction assertions in `python_tests/test_huawei_te40.py`

### Implementation for User Story 2

- [x] T019 [US2] Complete safe error mapping and bounded response guards in `mvp_runtime/adapters/huawei_te40.py`
- [x] T020 [US2] Ensure all Huawei terminal paths release credential/session references and return sanitizer-compatible diagnostics in `mvp_runtime/adapters/huawei_te40.py`

**Checkpoint**: User Stories 1 and 2 both pass without real device data.

---

## Phase 5: User Story 3 - Сосуществование с другими алгоритмами (Priority: P3)

**Goal**: Run TE40 inside existing mixed plans without changing Extron or manual import behavior.

**Independent Test**: A mixed synthetic plan routes Huawei and Extron to separate adapters, returns one ordered result per target and keeps unsupported Huawei models network-silent.

### Tests for User Story 3

- [x] T021 [P] [US3] Add mixed Huawei/Extron sequencing and unsupported-Huawei no-network tests in `python_tests/test_polling.py`
- [x] T022 [P] [US3] Add frontend supported-device and direct-file manual import regression assertions in `tests.js`

### Implementation for User Story 3

- [x] T023 [US3] Update Huawei TE40 support and local HTTPS conditions in `product-catalog.js`
- [x] T024 [US3] Add Huawei analyzed-parameter rules for confirmed firmware and model fields in `product-catalog.js`

**Checkpoint**: All three user stories are independently testable and integrated.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete documentation, remove live probe artifacts and run the full security/regression matrix.

- [x] T025 [P] Update architecture and implementation history in `docs/architecture.md` and `docs/implementation-log.md`
- [x] T026 Remove `.tmp_huawei_auth_probe.py` and verify no real IP, credential, cookie, MAC, serial or poll result is staged
- [x] T027 Run Python unit, compile, frontend, reference and changed-JavaScript syntax checks from `specs/016-huawei-te40-polling/quickstart.md`
- [x] T028 Run `git diff --check` plus secret, artifact and private-IP scans across staged candidate changes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks adapter registration.
- **User Story 1 (Phase 3)**: Depends on model-specific catalog routing.
- **User Story 2 (Phase 4)**: Uses the adapter surface from US1 but remains independently verified through failure-only tests.
- **User Story 3 (Phase 5)**: Depends on registered US1 behavior and verifies coexistence.
- **Polish (Phase 6)**: Depends on all selected stories.

### User Story Dependencies

- **US1**: Foundational only.
- **US2**: Foundational plus the adapter skeleton from US1.
- **US3**: Foundational plus registered adapter behavior from US1.

### Parallel Opportunities

- T003 and T004 can be prepared in parallel.
- T008 through T010 are independent test surfaces before implementation.
- T016 through T018 are independent failure/security test groups.
- T021 and T022 cover separate Python/frontend integrations.
- Documentation T025 can run alongside final focused test repair once behavior is stable.

## Parallel Example: User Story 1

```text
Task T008: authentication sequence tests in python_tests/test_huawei_te40.py
Task T010: orchestrator routing tests in python_tests/test_polling.py
```

## Implementation Strategy

### MVP First

1. Complete T001–T007.
2. Write and observe failures for T008–T010.
3. Complete T011–T015.
4. Run the independent US1 test set before hardening or documentation changes.

### Incremental Delivery

1. Exact TE40 routing without network behavior leakage.
2. Confirmed login and read-only resource collection.
3. Safe failure/redaction matrix.
4. Mixed-plan, UI reference and manual-mode regression.
5. Full checks and live-artifact removal.

## Notes

- Every task follows the required checkbox, ID, optional parallel marker, story label and explicit file-path format.
- Tests contain synthetic documentation addresses and identifiers only.
- No commit or push is part of these tasks without a separate explicit user request.
