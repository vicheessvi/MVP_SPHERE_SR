# Tasks: TE family settings read

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md)

## Phase 1: Setup

- [x] T001 Зафиксировать модельные границы в specs/041-te-family-settings-read/spec.md и research.md

## Phase 2: Foundational

- [x] T002 Подтвердить read-only контракты и отсутствие секретов в specs/041-te-family-settings-read/contracts/read-settings.md

## Phase 3: User Story 1 — фактические поля

- [x] T003 [US1] Проверить TE40 read-only и источники полей в mvp_runtime/adapters/huawei_te40.py
- [x] T004 [US1] Добавить независимое чтение семи групп в mvp_runtime/adapters/huawei_te40.py
- [x] T005 [US1] Разрешить только точные TE-family поля и факт Wi-Fi в app.js

## Phase 4: User Story 2 — безопасная неполнота

- [x] T006 [US2] Добавить проверки отказа, неполной схемы и секретов в python_tests/test_huawei_te40.py и tests.js
- [ ] T007 [US2] Подтвердить TE30/50/60 на реальных устройствах по quickstart.md
- [x] T010 [US2] Зафиксировать подтверждённое администратором разделение на плановое включение и отключение в mvp_runtime/adapters/huawei_te40.py, app.js и contracts/read-settings.md

## Phase 5: Polish

- [x] T008 Обновить Справочник и решения в product-catalog.js, AGENTS.md и docs/
- [x] T009 Запустить полную регрессию и проверить рабочее дерево

## Dependencies

T001 → T002 → T003–T006 → T008–T009; T007 ждёт внешней эксплуатационной проверки и не блокирует предварительный контракт.
