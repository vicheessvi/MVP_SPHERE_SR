# Tasks: Оборудование, время опроса и масштабируемый SR

## Phase 1 — Evidence and tests

- [x] T001 Создать specification/checklist/plan/research/data model/contracts/quickstart в `specs/010-equipment-sr-analysis/`.
- [x] T002 Снять legacy SR benchmark 1k/5k/10k/25k в `benchmarks/sr-import-performance.js` и зафиксировать baseline.
- [x] T003 [P] Добавить failing tests семи category descriptors/classification/routes/reference в `tests.js`.
- [x] T004 [P] Добавить failing tests file timestamp, unknown timestamp и status evidence в `tests.js`.
- [x] T005 [P] Добавить failing tests selective rules, ignored raw fields и late arrival в `tests.js`.
- [x] T006 Добавить failing performance/operation/progress guards SR import в `tests.js`.

## Phase 2 — Catalog and equipment UX (US1, US5)

- [x] T007 [US1] Добавить `EQUIPMENT_CATEGORY_CATALOG`, parent/child modules, terms и validation в `product-catalog.js`.
- [x] T008 [US1] Перевести SR classifier и category consumers на catalog IDs в `app.js`.
- [x] T009 [US1] Реализовать раскрывающуюся navigation и active parent/child state в `app.js`, `styles.css`.
- [x] T010 [US1] Сохранить общий inventory renderer/filter/detail/history для всех семи routes.
- [x] T011 [US5] Перевести Dashboard counts/drilldown/filter на семь catalog categories и компактный block.

## Phase 3 — Time and statuses (US2)

- [x] T012 [US2] Перенести File.lastModified в polling descriptors и реализовать `resolvePollingResultTimestamp`.
- [x] T013 [US2] Разделить run folder time и per-result time, stable known/equal/unknown ordering.
- [x] T014 [US2] Реализовать evidence-based operational statuses и Russian dictionary/filters/rendering.
- [x] T015 [US2] Переименовать presentation field в «Дата и время опроса» и добавить source explanation.

## Phase 4 — Selective changes (US3)

- [x] T016 [US3] Добавить central `ANALYZED_PARAMETER_RULES` и catalog validation.
- [x] T017 [US3] Реализовать scoped path selection/diff с Russian label/rationale; no-rules means no diff.
- [x] T018 [US3] Перевести full rebuild и indexed late-insertion pairs на selective diff.
- [x] T019 [US3] Обновить changes UI/export/dashboard projection, сохранив raw history.

## Phase 5 — Scalable SR (US4)

- [x] T020 [US4] Реализовать location/identity indexes с исходным precedence/ambiguity behavior.
- [x] T021 [US4] Реализовать `processSrImportRows` batches, metrics, cooperative yield и per-row isolation.
- [x] T022 [US4] Интегрировать UI stages/progress и один final analytics render без save/clone roundtrip.
- [x] T023 [US4] Выполнить optimized benchmark 1k/5k/10k/25k и записать сравнение.

## Phase 6 — Reference, documentation and verification

- [x] T024 Обновить Справочник через catalog/HELP sections: equipment, categories, time, statuses, selective changes.
- [x] T025 Добавить ADR-0010 и обновить README, architecture, context-map, implementation-log, AGENTS current feature.
- [x] T026 Выполнить syntax, `tests.js`, `runtime-tests.js`, `server-tests.js`, reference validator. Основной suite 115/115; runtime 12/13 и server blocked историческим DPAPI child-process в sandbox, навигационный contract проходит.
- [x] T027 Выполнить secret/artifact scan и проверить отсутствие external requests/persistence.
- [x] T028 Подготовить итоговый отчёт A–Q и таблицу rules/рисков; не выполнять commit/push/deploy.

## Dependencies

- T003–T006 предшествуют соответствующей production реализации.
- T007 → T008–T011, T016.
- T012 → T013–T015.
- T016 → T017 → T018–T019.
- T020 → T021 → T022 → T023.
- T024–T028 выполняются после functional phases.

## Parallel opportunities

Tasks с `[P]` независимы по смыслу, но в текущем сеансе выполняются последовательно, чтобы не создавать конфликтующих правок одного `tests.js`.

## Phase 7 — Исправления по эксплуатационной проверке

- [x] T029 [P] [US1] Добавить regression tests начального collapsed-state, рабочего toggle и одинакового шрифта в `tests.js` и `runtime-tests.js`.
- [x] T030 [US1] Исправить parent navigation state и стили в `app.js`, `styles.css`.
- [x] T031 [P] [US1] Добавить tests приоритета «Тип модели» и сохранения строк без identity в `tests.js`.
- [x] T032 [US1] Реализовать fallback identity и приоритет классификации в `app.js`, `product-catalog.js`.
- [x] T033 [P] [US2] Добавить exact Extron auth fixture и full-inventory IP matching regression tests в `tests.js`.
- [x] T034 [US2] Реализовать exact auth evidence и подтвердить category-neutral matching в `app.js`.
- [x] T035 Обновить Справочник, ADR/architecture/log и выполнить все syntax/regression/runtime/reference/secret проверки.

## Phase 8 — Целостность current-IP matching

- [x] T036 [P] [US2] Добавить regression `.100/.102`: current controller выигрывает у historical scaler, а история скалера изолирована, в `tests.js`.
- [x] T037 [P] [US2] Добавить tests отсутствующего current IP, reused IP и current/historical index semantics в `tests.js`.
- [x] T038 [P] [US2] Добавить tests category conflict, согласованного и конфликтующего internal IP в `tests.js`.
- [x] T039 [US2] Разделить current/historical indexes и реализовать единый fail-closed resolver в legacy и indexed paths `app.js`.
- [x] T040 [US2] Добавить русскую диагностику конфликтов и правило current SR в `product-catalog.js`, `app.js`.
- [x] T041 Обновить ADR/architecture/README/log и matching contracts без удаления `ipHistory`.
- [x] T042 Выполнить syntax, regression, runtime/server/reference, matching performance, secret scan и `git diff --check`; не выполнять commit/push/deploy.

## Phase 9 — Повторное исправление lifecycle навигации

- [x] T043 [P] [US1] Заменить source-string проверки на полный production render/click/render regression для начального состояния, трёх кликов, всех дочерних routes и повторного render.
- [x] T044 [US1] Централизовать navigation state/reducer/resolver в `app.js`, сохранить active route при ручном collapse и добавить нативный `hidden`.
- [x] T045 [US1] Зафиксировать одинаковое базовое начертание всех `.nav-button` без отдельного bold для родителя.
- [x] T046 Выполнить syntax, regression, runtime/server/reference, secret scan и `git diff --check`; не выполнять commit/push/deploy.
