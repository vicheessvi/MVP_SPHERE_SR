# Tasks: Answer mode Polycom Group

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/answer-mode.md](contracts/answer-mode.md).

## Phase 1 — Setup

- [x] T001 Зафиксировать контролируемые переходы Group 310 и восстановление исходных значений в `specs/057-polycom-group-answer-mode/research.md`.
- [x] T002 Описать план, данные, контракт и проверку в `specs/057-polycom-group-answer-mode/plan.md`, `data-model.md`, `contracts/answer-mode.md`, `quickstart.md`.

## Phase 2 — Foundational

- [x] T003 Проверить существующие ограничения плана и адаптера в `mvp_runtime/polling.py`, `mvp_runtime/server.py`, `mvp_runtime/adapters/polycom_group.py`, `app.js`.
- [x] T004 Добавить отказные и позитивные тесты нового action/nullable-целей в `python_tests/test_polycom_group.py`, `python_tests/test_polling.py`, `python_tests/test_server.py`, `tests.js` до production-кода.

## Phase 3 — User Story 1: один Group (P1)

**Independent Test**: Точный Group 310 допускает одно или два выбранных поля, но отправляет максимум один POST; неизвестный код, drift и неясный исход не повторяются.

- [x] T005 [US1] Зарегистрировать один action ID для четырёх exact моделей в `runtime/device-catalog.json` и `app.js`.
- [x] T006 [US1] Добавить строгую проверку `polycomAnswerChanges` и маршрутизацию опции в `mvp_runtime/polling.py`, `mvp_runtime/server.py`.
- [x] T007 [US1] Реализовать guarded one-POST write и bounded read-only post-read в `mvp_runtime/adapters/polycom_group.py`.
- [x] T008 [US1] Добавить два переключателя, план/export и согласие для одного IP в `app.js`.

## Phase 4 — User Story 2: совместимая группа (P2)

**Independent Test**: Только exact Group по актуальной SR проходят UI/runtime gates; смешанная группа и повторный IP блокируются до записи.

- [x] T009 [US2] Добавить проверки массового выбора, digest, смешанных целей и отдельных результатов в `tests.js`, `python_tests/test_polling.py`, `python_tests/test_server.py`.
- [x] T010 [US2] Подключить общий action и два nullable-выбора к фильтрам SR и повторной runtime-валидации в `app.js`, `mvp_runtime/polling.py`.

## Phase 5 — Polish

- [x] T011 Обновить `AGENTS.md`, `docs/context-map.md`, `docs/implementation-log.md`, `docs/decisions/ADR-0060-polycom-group-answer-mode.md`, `product-catalog.js`.
- [x] T012 Выполнить полные Python/JS/reference/syntax/secret проверки и удалить временный live-пробник `scripts/_probe_polycom_answer_combined.py`.
- [x] T013 2026-11-24 зафиксировать подтверждение администратором Answer mode Group 300/310/500/700 в обоих направлениях, по IP и массово; новые write-результаты — confirmed_user_validation, без изменения команд/ограничений и исторических JSON.

## Dependencies

T001–T004 → T005–T008 → T009–T010 → T011–T012. Тесты пишутся до соответствующего production-кода. Сетевые write-тесты на других моделях не выполняются без отдельных согласий.

## Parallel Opportunities

Документация и исследование UI могли выполняться отдельно; write-адаптер, план и тесты общего контракта правятся последовательно во избежание конфликтов.

## MVP

US1 — безопасное изменение одного exact Group 310. US2 добавляет совместимую группу; первоначально другие Group были предварительными. Отдельное эксплуатационное подтверждение администратора 2026-11-24 отражено в T013.
