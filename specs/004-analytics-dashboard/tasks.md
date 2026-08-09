# Tasks: Операционный Dashboard

**Input**: `specs/004-analytics-dashboard/`

## Phase 1: Setup

- [x] T001 Verify dashboard source/test zones and ignore rules in `app.js`, `styles.css`, `tests.js`, `.gitignore`
- [x] T002 Add dashboard presentation/status constants in `app.js`

## Phase 2: Foundational

- [x] T003 Add latest-result, capability, period and safe-event helper tests in `tests.js`
- [x] T004 Implement deterministic latest-result and period scope helpers in `app.js`
- [x] T005 Implement filtered CurrentDeviceState projection in `app.js`
- [x] T006 Implement `getDashboardSummary` contract and export it in `app.js`

## Phase 3: User Story 1 — Current operational state (P1)

**Independent test**: Empty/SR-only/multi-snapshot data produces correct current inventory, coverage, health, problems and latest run.

- [x] T007 [US1] Add empty, SR-only, category, success, ping, unsupported, dedup and latest-snapshot tests in `tests.js`
- [x] T008 [US1] Implement inventory, coverage, health, problem and latest-run summary sections in `app.js`
- [x] T009 [US1] Replace minimal `renderDashboard` with context, inventory, operational and attention blocks in `app.js`
- [x] T010 [US1] Add responsive KPI/context/attention styles in `styles.css`

## Phase 4: User Story 2 — Filters and drill-down (P1)

**Independent test**: Global filters recalculate summary; KPI actions open existing category modules with matching filters.

- [x] T011 [US2] Add period/current separation, global filter and drill-down filter tests in `tests.js`
- [x] T012 [US2] Implement dashboard filter validation/options and period metrics in `app.js`
- [x] T013 [US2] Extend inventory filtering for ping/change/support/model/location in `app.js`
- [x] T014 [US2] Implement dashboard filter form and route/filter drill-down handlers in `app.js`
- [x] T015 [US2] Add filter and drill-down responsive styles in `styles.css`

## Phase 5: User Story 3 — Priority locations and events (P2)

**Independent test**: VIP, unmatched/data error, change, location and distribution summaries are correct, safe and presentation-limited.

- [x] T016 [US3] Add VIP, unmatched/data issue, change, location and presentation-limit tests in `tests.js`
- [x] T017 [US3] Implement VIP, locations, recent problems/changes and distributions in `app.js`
- [x] T018 [US3] Render VIP, locations, recent activity, distributions and blocked analytics in `app.js`
- [x] T019 [US3] Add location/event/distribution styles in `styles.css`

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T020 Add 5k devices/25k results dashboard performance regression in `tests.js`
- [x] T021 Update Dashboard documentation in `README.md`, `docs/architecture.md`, `docs/project-vision.md`, `docs/implementation-log.md`
- [x] T022 Run syntax, dashboard/legacy, runtime/server and secret/artifact checks from `specs/004-analytics-dashboard/quickstart.md`
- [x] T023 Record validation results in `specs/004-analytics-dashboard/quickstart.md`
- [x] T024 Stage completed feature changes and confirm no untracked/non-ignored files with Git

## Dependencies

Setup → Foundational → US1 → US2 → US3 → Polish. US3 summary helpers depend on the shared CurrentDeviceState projection; CSS portions can follow their corresponding rendered markup.

## Parallel opportunities

- Documentation T021 can begin after summary semantics T006 stabilize.
- CSS T010/T015/T019 can be prepared independently after each corresponding markup task.
- Test fixture construction for T016 can proceed after T005 without waiting for UI rendering.

## Implementation strategy

First deliver a pure, independently tested summary selector. Then replace Dashboard UI with P0 operational blocks, add global filters/drill-down, and finally add only factually supported P1 blocks. Do not implement P2 BI/trends/GCPlus or guessed auth/reboot rules.
