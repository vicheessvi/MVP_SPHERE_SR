# Tasks: Аналитика перезагрузок устройств

## Phase 1 — Design and contract

- [X] T001 Create specification and requirements checklist in `specs/015-reboot-analytics/`
- [X] T002 Complete research, data model, contract, quickstart and constitution re-check

## Phase 2 — Tests first

- [X] T003 [P] Add navigation/reference regression cases in `tests.js`
- [X] T004 [P] Add strict Extron `Device Status.Date − Uptime` and boot-clustering cases in `tests.js`
- [X] T005 [P] Add duplicate, late input, tie, filter and performance cases in `tests.js`

## Phase 3 — Core analytics

- [X] T006 Preserve observation timestamp provenance during polling import in `app.js`
- [X] T007 Implement supported uptime extraction and pair derivation in `app.js`
- [X] T008 Implement full-history index, coverage, filters, aggregations and leaders in `app.js`

## Phase 4 — Product and UI

- [X] T009 Add the `reboots` route after Dashboard through `product-catalog.js`
- [X] T010 Implement filter form, KPI, accessible charts, maxima, empty states and event table in `app.js`
- [X] T011 Add responsive reboot module styles in `styles.css`
- [X] T012 Update Dashboard entry and centralized Reference wording in `app.js` and `product-catalog.js`

## Phase 5 — Documentation and validation

- [X] T013 Add ADR-0015 and update `docs/context-map.md`, `docs/project-vision.md`, `docs/implementation-log.md`
- [X] T014 Run syntax, regression, reference, Python regression, performance, diff and secret/IP scans
- [ ] T015 Complete manual `file://` visual acceptance from `specs/015-reboot-analytics/quickstart.md` (in-app browser policy blocks local file URLs)

## Dependencies

- T003–T005 depend on T001–T002 and must fail before implementation.
- T006–T008 depend on T004–T005.
- T009–T012 depend on T003 and T008.
- T013 depends on final behavior from T006–T012.
- T014–T015 depend on all implementation and documentation tasks.
