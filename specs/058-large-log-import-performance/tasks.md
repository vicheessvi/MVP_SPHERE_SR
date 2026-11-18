# Tasks: Массовый импорт и постоянная рабочая база

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/workspace.md](contracts/workspace.md), [contracts/log-worker.md](contracts/log-worker.md)

## Phase 1 — Setup

- [x] T001 Зафиксировать масштаб, разрешение на рабочую базу и границы безопасности в `specs/058-large-log-import-performance/spec.md`, `plan.md`, `research.md`, `contracts/`.
- [x] T002 Проверить `.gitignore`, Constitution 5.0.0 и текущие пути импорта/сохранения в `.gitignore`, `app.js`, `mvp_runtime/server.py`, `docs/context-map.md`.

## Phase 2 — Foundational tests

- [x] T003 Добавить синтетические 5k-file/perf и event-equivalence/atomic-cancel тесты в `tests.js` до изменения импортера.
- [x] T004 Добавить security/crash/concurrency/restore тесты SQLite workspace в `python_tests/test_workspace.py` и `python_tests/test_server.py` до backend-кода.

## Phase 3 — User Story 1: отзывчивый массовый импорт (P1)

**Independent Test**: 5 000 файлов и большой виртуальный XML не блокируют навигацию; данные событий совпадают с прежними правилами.

- [x] T005 [US1] Добавить progress/abort hooks без изменения семантики в `runtime/huawei-te-log-events.js`, `runtime/huawei-310-log-events.js`, `runtime/huawei-300-log-events.js`.
- [x] T006 [US1] Реализовать один фоновый scanner и совместимый `file://` fallback в `runtime/log-scan-worker.js`, `mvp_runtime/server.py`, `app.js`.
- [x] T007 [US1] Убрать полный render на каждом шаге, добавить progress по файлам/байтам и отмену в `app.js`, `styles.css`.

## Phase 4 — User Story 2: не терять прежний индекс (P1)

**Independent Test**: отмена/ошибка нового импорта оставляет предыдущие события и сводки; успешный импорт заменяет все индексы одновременно.

- [x] T008 [US2] Реализовать локальный staging и атомарную публикацию лог-индексов в `app.js`; сократить удержание промежуточных scan-объектов.
- [x] T009 [US2] Ограничить примеры дублирующихся доказательств с сохранением `sourceCount` во всех трёх индексах `app.js`, подтвердив эквивалентность событий в `tests.js`.

## Phase 5 — User Story 3: быстро открывать аналитику (P1)

**Independent Test**: 10k shutdown/start не дают квадратичного времени, неизменённые фильтры используют прежнюю сводку.

- [x] T010 [US3] Заменить поиск следующего запуска бинарным индексом в `app.js`, добавить стресс-тест в `tests.js`.
- [x] T011 [US3] Кешировать сводки модуля по ревизии источников/фильтрам и сбрасывать cache только при изменениях в `app.js`, проверить в `tests.js`.

## Phase 6 — User Story 4: восстановление и дозагрузка (P1)

**Independent Test**: после перезапуска локального runtime восстановлены SR/JSON/логи; новые файлы добавляются, старые не перечитываются полностью.

- [x] T012 [US4] Реализовать выбранную SQLite-базу, проверку пути/целостности, транзакционные ревизии и safe projection без `rawText`/секретов в `mvp_runtime/workspace.py`.
- [x] T013 [US4] Добавить admin-gated Origin/CSRF `/api/workspace/*` с bounded payload и ошибками без утечки в `mvp_runtime/server.py`.
- [x] T014 [US4] Добавить UI выбора рабочей папки, состояние восстановления после входа и отображение ошибок в `app.js`, `styles.css`.
- [x] T015 [US4] Сохранять завершённые SR/JSON/лог-импорты и безопасные действия автоматически, без полного сырого текста, через `app.js`.
- [x] T016 [US4] Реализовать общий file registry и инкрементальный пропуск неизменённых логов/опросов с возможностью полной перепроверки в `app.js`, `mvp_runtime/workspace.py`.
- [x] T017 [US4] Проверить конкурентные вкладки, повреждённую/недоступную папку, перезапуск и Polycom TGZ metadata в `python_tests/test_workspace.py`, `python_tests/test_server.py`, `tests.js`.

## Phase 7 — Polish

- [x] T018 Обновить `AGENTS.md`, `docs/context-map.md`, `docs/implementation-log.md`, `docs/decisions/ADR-0061-large-log-workspace.md`, `product-catalog.js` и пользовательские подсказки.
- [x] T019 Выполнить полный Python/JS/reference/syntax/security suite, synthetic 5k stress, `git diff --check` и loopback API-проверку без реальных логов; фактическую папку 200–400 ГБ оставить для эксплуатационной проверки администратора.

## Dependencies

T001–T004 → T005–T009 → T010–T011 → T012–T017 → T018–T019. Каждый тест добавлять до соответствующего кода. Workspace persistence не должна публиковать частичный импорт.

## Parallel Opportunities

Исследование существующих парсеров и SQLite API возможно параллельно; правки `app.js` и общих тестов выполнять последовательно. Долгие синтетические стресс-проверки независимы от Python unit tests.

## MVP

US1+US2 устраняют зависания/потери в текущей вкладке; US3 делает модуль аналитики открываемым; US4 добавляет согласованную постоянную базу и дозагрузку после перезапуска.
