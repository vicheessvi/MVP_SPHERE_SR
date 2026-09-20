# Tasks: Huawei Bar 310 polling

**Input**: Design documents from `specs/024-huawei-bar310-polling/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Synthetic contract, security and integration tests are required by the feature specification and project workflow.

## Phase 1: Setup and evidence boundary

**Purpose**: Preserve reviewed evidence and prepare isolated implementation locations.

- [X] T001 Record the controlled read-only evidence and official product sources in `specs/024-huawei-bar310-polling/research.md`
- [X] T002 Define transport, auth, bounds, identity gates and allowlist in `specs/024-huawei-bar310-polling/contracts/huawei-bar310-rest-v1.md`
- [X] T003 Record the architectural decision in `docs/decisions/ADR-0024-huawei-bar310-polling.md`

---

## Phase 2: Foundational catalog and contract tests

**Purpose**: Add failing synthetic expectations before enabling network support.

- [X] T004 [P] Add exact Bar 310 catalog routing and fallback tests in `python_tests/test_catalog.py`
- [X] T005 [P] Add synthetic success, request-order and output-projection tests in `python_tests/test_huawei_bar310.py`
- [X] T006 [P] Add model-mismatch, auth-order, schema-drift, timeout/TLS/oversize and redaction tests in `python_tests/test_huawei_bar310.py`
- [X] T007 [P] Add polling-registry and mixed-plan integration expectations in `python_tests/test_polling.py`

**Checkpoint**: New tests fail because the Bar 310 transport is not registered.

---

## Phase 3: User Story 1 — Получить локальный снимок Bar 310 (Priority: P1) 🎯 MVP

**Goal**: Poll exact Bar 310 and return the established local result shape.

**Independent Test**: A synthetic exact target completes the browser-equivalent session and five GET resources, producing Bar 310 identity, firmware, time/uptime, MAC and capabilities without secrets.

- [X] T008 [US1] Implement bounded HTTPS, cookie, nested-envelope and safe transport helpers in `mvp_runtime/adapters/huawei_bar310.py`
- [X] T009 [US1] Implement pre-auth bundle/model evidence and ordered credential login in `mvp_runtime/adapters/huawei_bar310.py`
- [X] T010 [US1] Implement the five-resource GET allowlist, schema validation and `webBlocks` projection in `mvp_runtime/adapters/huawei_bar310.py`
- [X] T011 [US1] Register `huawei_bar310_rest_v1` in `mvp_runtime/polling.py`
- [X] T012 [US1] Add the exact supported Bar 310 manifest and remove it from the Huawei fallback in `runtime/device-catalog.json`

**Checkpoint**: User Story 1 synthetic contract and catalog tests pass.

---

## Phase 4: User Story 2 — Безопасно отклонить неподтверждённое устройство (Priority: P1)

**Goal**: Fail closed before credentials or success when model, schema, TLS or identity evidence is missing.

**Independent Test**: Each negative synthetic scenario returns a stable safe code, performs no configuration write, and leaks no credential/session value.

- [X] T013 [US2] Add exact pre/post model, stable-identity and required-schema gates in `mvp_runtime/adapters/huawei_bar310.py`
- [X] T014 [US2] Add best-effort logout, bounded cleanup and secret-safe diagnostics in `mvp_runtime/adapters/huawei_bar310.py`
- [X] T015 [US2] Pass the complete Bar 310 negative/security test matrix in `python_tests/test_huawei_bar310.py`

**Checkpoint**: User Story 2 rejects every unknown contract without credential or raw-response disclosure.

---

## Phase 5: User Story 3 — Сохранить существующие режимы работы (Priority: P2)

**Goal**: Integrate the model into planning/help without changing prior adapters or direct-file mode.

**Independent Test**: Existing Extron/Huawei TE/manual workflows remain green while Bar 310 is shown as a separate supported read-only algorithm.

- [X] T016 [P] [US3] Add the Bar 310 algorithm and scope text to `product-catalog.js`
- [X] T017 [P] [US3] Update runtime architecture and navigation context in `docs/architecture.md` and `docs/context-map.md`
- [X] T018 [US3] Update active feature/evidence boundaries in `AGENTS.md` and append the implementation stage to `docs/implementation-log.md`

**Checkpoint**: Reference validation and complete browser/Python regressions pass.

---

## Phase 6: Polish and controlled acceptance

**Purpose**: Remove live artifacts and prove the end-to-end security boundary.

- [X] T019 Remove `.tmp_bar310_evidence_probe.py` and scan tracked/untracked changes for real credentials, target addresses, MAC, serial, tokens and raw device responses
- [X] T020 Run every command in `specs/024-huawei-bar310-polling/quickstart.md` and record results in `docs/implementation-log.md`
- [X] T021 Perform one final authorized read-only Bar 310 adapter acceptance using the memory-only XLSX pool, report only safe stage/status fields, and confirm no repository artifact was created

---

## Dependencies & Execution Order

- Phase 1 precedes all source changes.
- Phase 2 defines failing expectations and precedes Phases 3–4.
- User Story 1 enables the basic successful result; User Story 2 hardens the same adapter immediately afterward.
- User Story 3 depends on the final transport/catalog identifiers from User Story 1 but is independently regression-testable.
- Final acceptance requires every earlier phase.

## Parallel Opportunities

- T004, T005, T006 and T007 touch separate test concerns and can be prepared independently.
- T016 and T017 touch separate reference/document files.
- Source tasks touching `mvp_runtime/adapters/huawei_bar310.py` remain sequential.

## Implementation Strategy

1. Preserve evidence and define the exact contract.
2. Write synthetic tests before registering support.
3. Deliver the read-only Bar 310 adapter and exact catalog route.
4. Complete fail-closed/security behavior.
5. Update the centralized reference and architecture docs.
6. Remove live probe artifacts, run the full matrix, then perform one safe real-device acceptance.
