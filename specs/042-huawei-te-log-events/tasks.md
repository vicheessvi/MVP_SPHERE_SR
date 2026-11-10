# Tasks: Huawei TE log event analytics

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md)

## Phase 1: Setup

- [x] T001 Зафиксировать подтверждённые маркеры и ограничения в specs/042-huawei-te-log-events/research.md

## Phase 2: Foundation

- [x] T002 Определить безопасный контракт событий в specs/042-huawei-te-log-events/contracts/te-log-events.md и проверить отрицательные сценарии

## Phase 3: User Story 1 — импорт доказательств

- [x] T003 [US1] Добавить потоковый разбор и строгое сопоставление модели/IP в app.js
- [x] T004 [US1] Сохранить только производные события в сеансе и показать покрытие импорта в app.js

## Phase 4: User Story 2 — раздельная аналитика

- [x] T005 [US2] Добавить дедупликацию и независимые агрегаты Huawei в app.js
- [x] T006 [US2] Добавить отдельные карточки/таблицы/графики в модуль перезагрузок в app.js
- [x] T007 [US2] Покрыть синтетическими файлами и фильтрами в tests.js

## Phase 5: Polish

- [x] T008 Обновить product-catalog.js, AGENTS.md и docs/
- [x] T009 Выполнить синтаксис, регрессию, Справочник и scan
- [ ] T010 Проверить реальные логи TE30/50/60 на рабочем ПК после передачи изменений

## Dependencies

T001 → T002 → T003/T004 → T005/T006/T007 → T008/T009; T010 — отдельная пользовательская проверка.
