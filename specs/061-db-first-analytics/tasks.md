# Tasks

## Setup
- [x] T001 Зафиксировать DB-first требования и research в `specs/061-db-first-analytics/`.

## US1
- [x] T002 [US1] Добавить нормализованный read model и миграцию в `mvp_runtime/read_model.py`.
- [x] T003 [US1] Проверить миллион событий, фильтры и страницы в `python_tests/test_read_model.py`, `scripts/benchmark-db-views.py`.

## US2
- [x] T004 [US2] Подключить защищённые API и оградить старый replacement-save в `workspace.py/server.py`.
- [x] T005 [US2] Перевести restore и импорты на DB-first в `app.js`.

## US3
- [x] T006 [US3] Добавить bounded асинхронные экраны и интерактивные сводки в `runtime/db-views.js`, `styles.css`.
- [x] T007 [US3] Проверить навигацию, stale responses, ошибки и экспорт в `tests.js`, `scripts/check-db-workspace-ui.js`.

## Polish
- [x] T008 Обновить документацию, справочник и выполнить полные регрессии.
