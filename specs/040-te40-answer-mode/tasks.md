# Tasks: Huawei TE Answer Mode

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md)

## Phase 1: Setup

- [x] T001 Зафиксировать требования и evidence в specs/040-te40-answer-mode/spec.md и research.md

## Phase 2: Foundational

- [x] T002 Зафиксировать exact single-IP и fail-closed контракт в specs/040-te40-answer-mode/contracts/answer-mode.md

## Phase 3: User Story 1 — выбор режима

- [x] T003 [US1] Добавить exact действия в runtime/device-catalog.json и app.js
- [x] T004 [US1] Добавить pre-read/one-write/post-read в mvp_runtime/adapters/huawei_te40.py
- [x] T005 [US1] Проверить single-IP план в mvp_runtime/polling.py

## Phase 4: User Story 2 — безопасный отказ

- [x] T006 [US2] Добавить синтетические проверки в python_tests/test_huawei_te40.py, python_tests/test_polling.py и tests.js
- [ ] T007 [US2] Проверить реальный TE30, TE50 и TE60 по одному; результаты предоставит администратор

## Phase 5: Polish

- [x] T008 Обновить product-catalog.js, AGENTS.md, docs/context-map.md и docs/implementation-log.md
- [x] T009 Выполнить полный набор проверок и security scan перед коммитом

## Dependencies

T001 → T002 → T003–T006 → T008–T009; T007 ожидает внешней проверки и не блокирует предварительную реализацию.
