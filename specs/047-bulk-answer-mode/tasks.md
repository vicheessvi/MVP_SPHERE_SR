# Tasks: массовый Answer mode

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/bulk-plan.md](contracts/bulk-plan.md)

## Phase 1: Setup

- [x] T001 Зафиксировать текущий single-IP предел и требуемую групповую семантику в specs/047-bulk-answer-mode/research.md

## Phase 2: Foundation

- [x] T002 Добавить общий bulk answer plan gate для TE20/TE-family/Huawei310 в mvp_runtime/polling.py

## Phase 3: User Story 1 — группа по фильтрам

**Independent Test**: 2+ совместимых устройства формируют один план, смешанный набор блокируется.

- [x] T003 [US1] Разрешить filters/single_ip для Answer mode и проверять все цели в app.js
- [x] T004 [US1] Показать количество целей и отдельное подтверждение массовой записи в app.js
- [x] T005 [US1] Добавить фильтровые и конфликтные сценарии TE20/TE-family/Huawei310 в tests.js

## Phase 4: User Story 2 — безопасное исполнение

**Independent Test**: backend отклоняет чужие модели и сохраняет отдельные результаты при частичном отказе.

- [x] T006 [US2] Проверить backend gate и последовательное исполнение в python_tests/test_polling.py и python_tests/test_server.py
- [x] T007 [US2] Убедиться в неизменности per-device write-контрактов и recovery существующей Python-регрессией и tests.js

## Phase 5: Polish

- [x] T008 Обновить AGENTS.md, README.md, product-catalog.js, docs/context-map.md, docs/decisions/ADR-0049-bulk-answer-mode.md и docs/implementation-log.md
- [x] T009 Выполнить Python/JavaScript регрессии, справочник, syntax и scan

## Dependencies

T001 → T002 → T003/T004/T005 → T006/T007 → T008/T009.
