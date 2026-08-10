# Tasks: Русский интерфейс и Справочник

**Input**: `specs/005-russian-ui-reference/`

## Phase 1: Setup

- [x] T001 Verify current routes, test zones and ignore rules in `app.js`, `styles.css`, `index.html`, `tests.js`, `.gitignore`
- [x] T002 Record current-to-target terminology mapping in `specs/005-russian-ui-reference/contracts/terminology.md`

## Phase 2: Foundational

- [x] T003 Add presentation dictionary and category/status formatter tests in `tests.js`
- [x] T004 Implement immutable UI dictionaries and safe Russian formatters in `app.js`
- [x] T005 Add reference dataset and pure normalized search tests in `tests.js`
- [x] T006 Implement reference sections, entries and search selector in `app.js`

## Phase 3: User Story 1 — Единый русский интерфейс (P1)

**Independent test**: All accessible routes render mandatory category/status/action labels while import fixtures retain raw values.

- [x] T007 [US1] Add current-route terminology and raw import compatibility regressions in `tests.js`
- [x] T008 [US1] Replace mixed Dashboard labels, statuses, filters and actions using formatters in `app.js`
- [x] T009 [US1] Replace mixed inventory list/detail labels, statuses and capability text in `app.js`
- [x] T010 [US1] Replace mixed upload, credential summary, secure storage and recovery labels in `app.js` and `index.html`
- [x] T011 [US1] Add actionable Russian formatting for current import/data issues in `app.js`

## Phase 4: User Story 2 — Поисковый Справочник (P1)

**Independent test**: Reference route exposes ten sections and searches title, definition and aliases for five control queries.

- [x] T012 [US2] Add route, section-count, uncertainty-label and five-query search tests in `tests.js`
- [x] T013 [US2] Add «Справочник» navigation and route state in `app.js`
- [x] T014 [US2] Render ten reference sections, glossary, abbreviations, statuses, metrics and technical explanations in `app.js`
- [x] T015 [US2] Implement reference search form, no-result state and reset handler in `app.js`
- [x] T016 [US2] Add responsive reference/search/card styles in `styles.css`

## Phase 5: User Story 3 — Контекстная помощь (P2)

**Independent test**: From Dashboard and each equipment category «О модуле» opens the matching reference entry; three KPI hints use the central source.

- [x] T017 [US3] Add context-link and tooltip contract tests in `tests.js`
- [x] T018 [US3] Add «О модуле» controls and route-topic handler in `app.js`
- [x] T019 [US3] Add centralized compact KPI tooltips and reference links in `app.js`
- [x] T020 [US3] Add accessible tooltip/context-control styles in `styles.css`

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T021 Update terminology/reference documentation in `README.md`, `docs/architecture.md`, `docs/project-vision.md`, `docs/context-map.md`, `docs/implementation-log.md`, `AGENTS.md`
- [x] T022 Run syntax, regression, runtime/server, forbidden-visible-term and secret/artifact checks from `specs/005-russian-ui-reference/quickstart.md`
- [x] T023 Run local browser acceptance for navigation, search, context links, import and responsive layout
- [x] T024 Record validation results and close all tasks in `specs/005-russian-ui-reference/quickstart.md` and `specs/005-russian-ui-reference/tasks.md`
- [x] T025 Confirm Git working tree contains only expected unstaged feature changes and perform no commit/push/deploy

## Dependencies

Setup → Foundational → US1 → US2 → US3 → Polish. Search rendering depends on the reference dataset; contextual links depend on the route and entry identifiers.

## Parallel opportunities

- Documentation T021 can proceed after terminology contracts stabilize.
- CSS T016/T020 can be prepared after corresponding markup.
- Search and formatter tests can be written independently before their implementations.

## Implementation strategy

First establish the single presentation dictionary and tests. Then translate all accessible existing routes without changing internal data. Add the self-contained Reference route and finally connect contextual help. Do not refactor internal enum names or legacy data structures merely for localization.
