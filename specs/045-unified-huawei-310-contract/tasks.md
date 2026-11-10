# Tasks: единый контракт Huawei 310

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/family-transport.md](contracts/family-transport.md)

## Phase 1: Setup

- [x] T001 Зафиксировать общий ID, exact модели и границы совместимости в specs/045-unified-huawei-310-contract/research.md

## Phase 2: Foundation

- [x] T002 Создать единый dispatcher по exact planned model в mvp_runtime/adapters/huawei_bar310.py

## Phase 3: User Story 1 — один контракт

**Independent Test**: все три точные модели возвращают один contract ID, сохраняя свою фактическую модель.

- [x] T003 [US1] Перевести model descriptors и тонкие wrappers на единый contract ID в mvp_runtime/adapters/huawei_bar310.py, mvp_runtime/adapters/huawei_box310.py, mvp_runtime/adapters/huawei_box610.py
- [x] T004 [US1] Зарегистрировать один transport и обновить три модельных маршрута в mvp_runtime/polling.py, runtime/device-catalog.json, app.js
- [x] T005 [US1] Проверить три exact модели, settings validation и отсутствие лишних запросов в python_tests/test_huawei_bar310.py, python_tests/test_huawei_box.py, tests.js

## Phase 4: User Story 2 — безопасность и история

**Independent Test**: wrong model не получает credentials; старый JSON остаётся сопоставленным по своему model-key.

- [x] T006 [US2] Обновить transport/contract проверки в python_tests/test_polling.py, python_tests/test_catalog.py и tests.js
- [x] T007 [US2] Проверить импорт старых model-key/contract ID и сохранение provisional Box в app.js и tests.js
- [x] T008 [US2] Убедиться, что HTTP write не расширился, а suffix/unknown модели заблокированы в python_tests/test_huawei_bar310.py и tests.js

## Phase 5: Polish

- [x] T009 Обновить AGENTS.md, README.md, product-catalog.js, docs/context-map.md, docs/decisions/ADR-0047-unified-huawei-310.md, docs/implementation-log.md
- [x] T010 Выполнить полный Python/JavaScript прогон, справочник и syntax; проверить чистоту diff
- [x] T011 Администратор отдельно подтвердил наименования и фактические значения обоих Box; read-only статус повышен только для новых JSON, исторические provisional не изменяются

## Dependencies

T001 → T002 → T003/T004/T005 → T006/T007/T008 → T009/T010. T011 выполняется после пользовательских опросов на другом ПК.
