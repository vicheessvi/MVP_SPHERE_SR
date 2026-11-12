# Tasks: Раздельная аналитика питания

## Setup

- [x] T001 Зафиксировать интервалы, denominator и достоверность в specs/050-power-outage-analytics/spec.md.

## US1 — внутренние подмодули

- [x] T002 [US1] Разделить виды событий во вкладках страницы в app.js и styles.css.

## US2 — Bar и TE паузы

- [x] T003 [US2] Добавить bootGaps Bar в runtime/huawei-310-log-events.js и безопасную привязку в app.js.
- [x] T004 [US2] Сохранить низкую достоверность длинных пауз TE в runtime/huawei-te-log-events.js.

## US3 — диаграмма 100%

- [x] T005 [US3] Добавить непересекающиеся интервалы и выбор максимума на устройство в app.js.
- [x] T006 [US3] Создать интерактивную диаграмму и легенду в app.js и styles.css.
- [x] T007 [US3] Проверить границы интервалов, изменение фильтра и безопасность через tests.js.

## Polish

- [x] T008 Обновить product-catalog.js, README.md, AGENTS.md и docs/decisions/ADR-0052-power-duration-analytics.md.
- [ ] T009 Выполнить node/python/reference/syntax/security проверки и визуальный осмотр (автопроверки пройдены; визуальный осмотр локального file:// заблокирован политикой браузера).
