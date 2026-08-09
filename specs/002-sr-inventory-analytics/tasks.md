# Tasks: SR inventory, polling history and analytics

**Input**: Design documents from `specs/002-sr-inventory-analytics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by the feature; extend the existing dependency-free harness before implementation.

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Vendor pinned SheetJS CE 0.20.3 and license in `vendor/xlsx.full.min.js` and `vendor/LICENSE.sheetjs.txt`
- [x] T002 Load the local XLSX parser before application/test scripts in `index.html` and `tests.html`
- [x] T003 Extend local-data and secret exclusions in `.gitignore`

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Add failing v2 migration/state shape tests in `tests.js`
- [x] T005 Add failing pure normalization, SR classification, timestamp, filename-IP and ping-status tests in `tests.js`
- [x] T006 Extend state schema, v1→v2 migration, backup compatibility and Administrator МЦТП defaults in `app.js`
- [x] T007 Add SR/device/run/result/change/issue constructors and normalizers to the public test surface in `app.js`
- [x] T008 Add polling adapter descriptor registry with truthful support states and no transports in `app.js`
- [x] T009 Run foundational regression checks and fix compatibility in `app.js` and `tests.js`

**Checkpoint**: v2 foundation preserves all legacy entities and exposes pure inventory/polling primitives.

---

## Phase 3: User Story 1 - Import SR inventory (Priority: P1) 🎯 MVP

**Goal**: Import local SR XLSX rows, classify and synchronize inventory without losing existing devices/history.

**Independent Test**: Synthetic workbook with VCS/controller/panel, optional domain and invalid row produces correct inventory and isolated issues.

- [x] T010 [US1] Add failing SR row import, optional-domain, classification, alias and sync tests in `tests.js`
- [x] T011 [US1] Implement XLSX workbook-to-rows parsing and required-header validation in `app.js`
- [x] T012 [US1] Implement conservative Device identity merge, Location merge and SR synchronization in `app.js`
- [x] T013 [US1] Implement SR XLSX upload form and per-import outcomes in `app.js`
- [x] T014 [US1] Validate User Story 1 tests and legacy regression suite via `tests.js`

**Checkpoint**: SR inventory is functional independently of polling history.

---

## Phase 4: User Story 2 - Import polling runs and history (Priority: P2)

**Goal**: Import folder-based JSON runs, match by IP, classify Extron controller/panel, preserve unmatched/errors and compute device changes.

**Independent Test**: Two synthetic runs produce two snapshots/changes; malformed/unmatched files do not stop the batch; duplicate reimport is idempotent.

- [x] T015 [US2] Add failing Primary Controller, TLP, ping, malformed, unmatched, duplicate and two-snapshot tests in `tests.js`
- [x] T016 [US2] Implement run-folder timestamp and JSON filename parsing plus normalized polling status in `app.js`
- [x] T017 [US2] Implement inventory matching, Extron classification conflict handling and immutable PollingResult ingestion in `app.js`
- [x] T018 [US2] Implement deterministic device history ordering and DeviceChange reconciliation with configurable ignored paths in `app.js`
- [x] T019 [US2] Implement polling run folder UI with batch isolation and manual timestamp fallback in `app.js`
- [x] T020 [US2] Validate User Story 2 tests and legacy regression suite via `tests.js`

**Checkpoint**: Imported polling runs provide device history and explainable changes end-to-end.

---

## Phase 5: User Story 3 - Category inventory modules (Priority: P3)

**Goal**: Show all VCS/controllers/panels with shared filters and device drill-down regardless of polling history.

**Independent Test**: Each category screen shows correct SR devices, filters work, and device detail distinguishes unpolled/history states.

- [x] T021 [US3] Add failing inventory selector/filter/summary tests in `tests.js`
- [x] T022 [US3] Implement shared inventory view selectors and filter model in `app.js`
- [x] T023 [US3] Implement VCS, Controllers and Panels tables plus Device detail/history/change views in `app.js`
- [x] T024 [US3] Add responsive filter/table/detail styling in `styles.css`

**Checkpoint**: Category modules are independently usable as inventory screens.

---

## Phase 6: User Story 4 - Dashboard analytics (Priority: P4)

**Goal**: Replace Overview with a truthful Dashboard aggregating inventory/latest polling results.

**Independent Test**: Synthetic fixture totals match expected category, polling, error, ping and change counts; unavailable metrics remain unknown.

- [x] T025 [US4] Add failing dashboard analytics projection tests in `tests.js`
- [x] T026 [US4] Implement analytics projection and drill-down filter handoff in `app.js`
- [x] T027 [US4] Replace Overview rendering/navigation with Dashboard cards, category summaries and unavailable analytics states in `app.js` and `styles.css`

**Checkpoint**: Dashboard contains only evidence-backed metrics.

---

## Phase 7: User Story 5 - Polling plan and support truth (Priority: P5)

**Goal**: Preview device selection/schedule/support while blocking fake network execution.

**Independent Test**: Plan records selection and time, Extron/other devices show truthful support, and no adapter/network call is made.

- [x] T028 [US5] Add failing adapter capability and blocked polling-plan tests in `tests.js`
- [x] T029 [US5] Implement polling plan preview/persistence and blocked-no-adapter UI in `app.js`

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T030 Update architecture/product context and add ADR-0004 in `docs/architecture.md`, `docs/project-vision.md`, `docs/context-map.md`, and `docs/decisions/ADR-0004-sr-inventory-xlsx-extension.md`
- [x] T031 Update usage/security documentation in `README.md` and append the implementation milestone to `docs/implementation-log.md`
- [x] T032 Validate `.gitignore` and scan tracked source paths for local SR/run/database/credential artifacts
- [x] T033 Run exact syntax and full regression commands from `specs/002-sr-inventory-analytics/quickstart.md`
- [x] T034 Record automated/manual acceptance status in `specs/002-sr-inventory-analytics/quickstart.md` and mark all completed tasks

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 blocks all stories.
- US1 is the inventory foundation and blocks US2–US5.
- US2 blocks history-derived portions of US3/US4.
- US3 and US4 can proceed after US1/US2.
- US5 depends on inventory selectors and adapter registry, not on UI analytics.
- Documentation and final checks follow implemented stories.

## Parallel Opportunities

- T001 and T003 touch independent paths.
- Documentation contracts were prepared before implementation and can be reviewed independently.
- T024 styling can proceed after the markup contract in T023 is stable.
- T030 and T031 affect separate documentation files but are sequenced to keep terminology consistent.

## Implementation Strategy

1. Preserve legacy regression first with state v2 migration.
2. Deliver SR inventory as the independent MVP.
3. Add imported polling history/change detection.
4. Add category UI and dashboard projections.
5. Add polling plan/support UI without pretending to execute device APIs.
6. Validate all existing and new tests; do not commit, push or deploy.
