# Tasks: Answer mode Huawei 310

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/answer-mode.md](contracts/answer-mode.md)

## Phase 1: Setup

- [x] T001 Зафиксировать Bar-кодировку и текущие bundle markers в specs/046-huawei-310-answer-mode/research.md

## Phase 2: Foundation

- [x] T002 Добавить два exact action ID в runtime/device-catalog.json и action allowlist mvp_runtime/polling.py

## Phase 3: User Story 1 — выбор Answer mode

**Independent Test**: три режима на каждом exact устройстве формируют ноль либо одну write-задачу; pre/read/write/post-read ограничены.

- [x] T003 [US1] Добавить трёхпозиционный UI, single-IP gate и подтверждение в app.js
- [x] T004 [US1] Реализовать guarded one-write/post-read в mvp_runtime/adapters/huawei_bar310.py
- [x] T005 [US1] Добавить positive/idempotent/write-failure тесты в python_tests/test_huawei_bar310.py и tests.js

## Phase 4: User Story 2 — безопасная модельная граница

**Independent Test**: чужая модель, конфликт задач и drift не доходят до записи.

- [x] T006 [US2] Проверить standalone single-IP план в mvp_runtime/polling.py, mvp_runtime/server.py и python_tests/test_polling.py, python_tests/test_server.py
- [x] T007 [US2] Добавить negative bundle/model/schema и no-extra-write тесты в python_tests/test_huawei_bar310.py, tests.js

## Phase 5: Polish

- [x] T008 Обновить AGENTS.md, README.md, product-catalog.js, docs/context-map.md, docs/decisions/ADR-0048-huawei-310-answer-mode.md и docs/implementation-log.md
- [x] T009 Выполнить полный Python/JavaScript прогон, справочник, syntax и scan
- [x] T010 После отдельного согласия провести оба контрольных перехода на Bar 310, восстановить исходный режим и сохранить независимый provisional-статус Box

## Dependencies

T001 → T002 → T003/T004/T005 → T006/T007 → T008/T009. T010 после явного разрешения реального изменения.
