# Tasks: Общий опрос Huawei TE30, TE40, TE50 и TE60

## Phase 1: Evidence and design

- [x] T001 Зафиксировать official-family evidence, ограничения и ADR в `specs/018-huawei-te-family/` и `docs/decisions/ADR-0018-huawei-te-family.md`

## Phase 2: Foundational safety tests

- [x] T002 [US2] Добавить failing catalog tests общего TE30/TE40/TE50/TE60 transport и закрытых TE20/TX50 в `tests.js` и `python_tests/test_catalog.py`
- [x] T003 [US2] Добавить failing pre-auth и post-auth model mismatch tests в `python_tests/test_huawei_te40.py`

## Phase 3: User Story 1 — shared algorithm

- [x] T004 [US1] Добавить synthetic TE30/TE40/TE50/TE60 success и mixed routing tests в `python_tests/test_huawei_te40.py` и `python_tests/test_polling.py`
- [x] T005 [US1] Объединить exact TE30/TE40/TE50/TE60 manifest в `runtime/device-catalog.json` и frontend capability в `app.js`
- [x] T006 [US1] Сделать один generic Huawei TE-family transport и projection evidence в `mvp_runtime/adapters/huawei_te40.py` и `mvp_runtime/polling.py`

## Phase 4: User Story 2 — fail-closed identity

- [x] T007 [US2] Проверять planned model до credentials и после version response в `mvp_runtime/adapters/huawei_te40.py`
- [x] T008 [US2] Подтвердить no-network для остальных Huawei и redaction общего результата в Python tests

## Phase 5: Product and documentation

- [x] T009 [US3] Обновить правила аналитики и пользовательский Справочник в `product-catalog.js`
- [x] T010 [US3] Обновить `AGENTS.md`, `docs/architecture.md`, `docs/context-map.md` и `docs/implementation-log.md`
- [ ] T011 [US3] Выполнить controlled live TE30/TE50/TE60 validation по `quickstart.md` при наличии устройств

## Phase 6: Validation

- [x] T012 Выполнить Python/frontend/reference/syntax regressions и `git diff --check`
- [x] T013 Выполнить scan секретов, реальных IP/MAC и runtime artifacts

## Dependencies

- T002–T003 предшествуют изменениям transport.
- T004 фиксирует ожидаемый общий успех до T005–T007.
- T011 зависит от доступных реальных TE30/TE50/TE60 и не блокирует безопасную подготовку к проверке.
- T012–T013 выполняются после кода и документации.
