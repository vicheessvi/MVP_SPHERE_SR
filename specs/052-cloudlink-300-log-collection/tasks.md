# Tasks: Сбор логов Huawei CloudLink 300

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/log-export.md](contracts/log-export.md)

## Phase 1: Setup

**Goal**: Закрепить live evidence без сырых данных.

- [x] T001 Зафиксировать Bar 300 bundle-маркеры, HTTP/MIME/XML-префикс и ограничения в `specs/052-cloudlink-300-log-collection/research.md`.

## Phase 2: Foundational

**Goal**: Сохранить существующий поток и безопасность.

- [x] T002 Проверить независимые режимы логов, ACK и импорт в `mvp_runtime/polling.py`, `mvp_runtime/polling_job.py`, `mvp_runtime/server.py` и `app.js`; UI/сервер не переписывать без необходимости.

## Phase 3: User Story 1 — Лог Bar 300 (P1)

**Independent Test**: Exact Bar 300 после model/identity и bundle gates передаёт один XML-поток в существующий callback; логи-only не пишет JSON, ошибка не раскрывает содержимое.

- [x] T003 [US1] Написать синтетические success/contract-drift/MIME/prefix/ACK/redaction тесты в `python_tests/test_huawei_300.py` до реализации.
- [x] T004 [US1] Добавить узкий потоковый GET `/log?rmd=<nonce>` после identity в `mvp_runtime/adapters/huawei_300.py`, не используя TE/310 endpoint и не буферизуя полный лог.
- [x] T005 [US1] Подключить `huawei_bar300_web_cgi_v1` к существующему `collectLogs` в `mvp_runtime/polling.py` и проверить маршрутизацию в `python_tests/test_polling.py`.
- [x] T006 [US1] Контрольно прочитать полный Bar 300 поток без сохранения сырых данных и проверить закрывающий XML-тег в `specs/052-cloudlink-300-log-collection/research.md`.

## Phase 4: User Story 2 — Box 300/600 (P2)

**Independent Test**: Обе exact Box синтетически проходят только собственные модельные gates и маркеры экспорта, а результат до live проверки помечен предварительным.

- [x] T007 [US2] Добавить тесты обеих Box, pre/post-auth mismatch и отсутствующего маркера в `python_tests/test_huawei_300.py`.
- [x] T008 [US2] Подключить `huawei_box300_web_cgi_v1` и `huawei_box600_web_cgi_v1` к существующему log callback в `mvp_runtime/adapters/huawei_300.py` и `mvp_runtime/polling.py`, сохранив `provisional_user_validation`.
- [x] T009 [US2] Описать эксплуатационную проверку каждой Box и не переносить событийную аналитику в `specs/052-cloudlink-300-log-collection/quickstart.md`.

## Phase 5: Polish

- [x] T010 Обновить `AGENTS.md`, `docs/context-map.md`, `docs/implementation-log.md`, `docs/decisions/ADR-0055-cloudlink-300-log-export.md` и `product-catalog.js`.
- [x] T011 Выполнить полные Python/JS/reference/syntax/security проверки для `mvp_runtime/adapters/huawei_300.py`, `mvp_runtime/polling.py`, `python_tests/test_huawei_300.py`, `python_tests/test_polling.py` и `product-catalog.js`.

## Dependencies

T001–T002 → T003 → T004–T006 → T007–T009 → T010–T011. Реальные проверки Box выполняются позднее по [quickstart.md](quickstart.md), не блокируют предварительный guarded контракт.

## Parallel opportunities

Исследование пользовательского UI и локального stream pipeline возможно параллельно с поиском официальной документации; изменения общего адаптера и `polling.py` выполнять последовательно.

## MVP

US1 (Bar 300) — минимальный полезный результат; US2 добавляет только предварительную совместимость точных Box.
