# Tasks: Аналитические таблицы опросов

**Input**: [plan.md](plan.md), [spec.md](spec.md), [data-model.md](data-model.md), [UI contract](contracts/ui.md)

## Phase 1: Setup

- [X] T001 Зафиксировать источники и принятую семантику показателей в specs/027-analytics-drilldowns/research.md

## Phase 2: Foundation

- [X] T002 Добавить безопасные производные поля события и группировки по ID в app.js

## Phase 3: User Story 1 — перезагрузки (P1)

- [X] T003 [US1] Добавить детальные группировки TOP 5 и единый отфильтрованный selector в app.js
- [X] T004 [US1] Реализовать открытие карточек и таблиц без таблицы событий на обзоре в app.js
- [X] T005 [US1] Обновить адаптивное оформление карточек и таблиц в styles.css
- [X] T006 [US1] Добавить синтетические проверки двух устройств и одной локации в tests.js

## Phase 4: User Story 2 — версии (P2)

- [X] T007 [US2] Реализовать хронологический selector версий и два табличных маршрута в app.js
- [X] T008 [US2] Обновить описания двух модулей в product-catalog.js
- [X] T009 [US2] Проверить изоляцию устройств и пропуск отсутствующих версий в tests.js

## Phase 5: User Story 3 — ошибки (P3)

- [X] T010 [US3] Реализовать два подтверждённых списка ошибок в app.js
- [X] T011 [US3] Обновить Справочник в product-catalog.js и тесты статусов в tests.js

## Phase 6: Polish

- [X] T012 Проверить tests.js, validate-reference.js и синтаксис изменённых JS
- [X] T013 Обновить docs/implementation-log.md и docs/context-map.md

## Dependencies & Execution Order

T001 → T002 → T003–T006 → T007–T009 → T010–T011 → T012–T013. Все истории независимо проверяются после Foundation. Разные файлы могут редактироваться параллельно, но работа в app.js выполняется последовательно.

## Implementation Strategy

Сначала раскрываемая аналитика перезагрузок, затем версии, затем ошибки; завершается полным регрессионным прогоном.
