# Tasks: настройки Huawei Box 310/610

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/box-settings-read.md](contracts/box-settings-read.md)

## Phase 1: Setup

- [x] T001 Зафиксировать provisional evidence и общие границы Box в specs/044-box310-610-settings-read/research.md

## Phase 2: Foundation

- [x] T002 Добавить отдельные read-settings flags и provisional статус в mvp_runtime/adapters/huawei_box310.py и mvp_runtime/adapters/huawei_box610.py

## Phase 3: User Story 1 — Box 310

**Independent Test**: exact Box 310 получает только gated read, drift не даёт ложных значений.

- [x] T003 [US1] Подключить общий read-only settings profile после identity gate в mvp_runtime/adapters/huawei_bar310.py
- [x] T004 [US1] Добавить синтетические success/drift/secret-тесты Box 310 в python_tests/test_huawei_bar310.py

## Phase 4: User Story 2 — Box 610

**Independent Test**: exact Box 610 проверяется отдельно, не наследуя идентичность Box 310.

- [x] T005 [US2] Добавить независимые synthetic model/schema тесты Box 610 в python_tests/test_huawei_bar310.py
- [x] T006 [US2] Разрешить импорт Box-полей только при exact model/provenance и сохранить provisional в app.js и tests.js

## Phase 5: Polish

- [x] T007 Обновить AGENTS.md, docs/context-map.md, docs/implementation-log.md, решение docs/decisions/ADR-0046-box-settings-read.md и product-catalog.js
- [x] T008 Выполнить полный Python/JavaScript прогон и проверку Справочника
- [x] T009 Администратор отдельно сверил наименования и значения реальных JSON Box 310 и Box 610 с web-меню; новые read-only результаты подтверждены, исторические provisional сохраняются

## Dependencies

T001 → T002 → T003/T004 → T005/T006 → T007/T008. T009 выполняется после передачи изменений администратору и независимо для каждой модели.

## Implementation Strategy

Сначала общий gated read profile, затем независимые модельные тесты и безопасная проекция импорта. Write-контракты не изменяются; реальные Box проверяет администратор.
