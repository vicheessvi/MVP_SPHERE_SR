# Tasks: Масштабируемый импорт результатов опроса

**Input**: Design documents from `/specs/009-scalable-polling-import/`

**Tests**: Обязательны; тесты пользовательских историй создаются до реализации и должны сначала падать.

## Phase 1: Profiling and setup

- [x] T001 Зафиксировать baseline и stage timings в `benchmarks/import-performance.js` и `research.md`
- [x] T002 Оформить spec, checklist, plan, research, data model, contracts и quickstart в `specs/009-scalable-polling-import/`
- [x] T003 Добавить ADR решения в `docs/decisions/ADR-0009-scalable-import-pipeline.md`

## Phase 2: Foundational tests

- [x] T004 [P] Добавить synthetic fixture helpers и semantic projection в `tests.js`
- [x] T005 [P] Добавить тесты bounded concurrency/cooperative yield/progress contract в `tests.js`
- [x] T006 [P] Добавить operation-count guards для SR lookup, duplicate fast path и incremental diff в `tests.js`
- [x] T007 Добавить parity-тест legacy и нового конвейеров, включая late arrival и malformed JSON, в `tests.js`

## Phase 3: User Story 1 — Отзывчивая массовая загрузка

**Goal**: Пакетный import без O(N²) deep-clone/rebuild.

**Independent Test**: Новый pipeline даёт семантически тот же результат, yield-ит и удерживает не более batch-size текстов.

- [x] T008 [US1] Реализовать bounded map и browser-compatible cooperative yield в `app.js`
- [x] T009 [US1] Реализовать SR/run/duplicate/history/change indexes в `app.js`
- [x] T010 [US1] Реализовать atomic indexed ingest и binary late insertion в `app.js`
- [x] T011 [US1] Реализовать `processPollingImportBatches` с streaming batches в `app.js`
- [x] T012 [US1] Перевести `handlePollingImport` на новый pipeline без массива всех file.text в `app.js`

## Phase 4: User Story 2 — Прогресс и отмена

**Goal**: Живой throttled progress и согласованная отмена.

**Independent Test**: Cancel прекращает старт новых работ, сохраняет принятые результаты и показывает точное сообщение.

- [x] T013 [US2] Добавить ephemeral progress/cancellation state и throttled rendering в `app.js`
- [x] T014 [US2] Добавить progress panel и кнопку отмены в `app.js`
- [x] T015 [US2] Добавить стили progress bar/metrics/responsive layout в `styles.css`
- [x] T016 [US2] Подтвердить отсутствие per-file Dashboard aggregation и excessive renders тестами в `tests.js`

## Phase 5: User Story 3 — Повторные и ежедневные загрузки

**Goal**: Дубликаты пропускаются рано, а стоимость новых запусков не включает полный повторный анализ истории.

- [x] T017 [US3] Кэшировать валидный import context по identity state и инвалидировать при замене state в `app.js`
- [x] T018 [US3] Добавить тест повторного набора и добавления 1k к синтетической истории 50k в `tests.js`

## Phase 6: User Story 4 — Performance evidence

- [x] T019 [US4] Расширить `benchmarks/import-performance.js` режимом optimized и timings/counters по стадиям
- [x] T020 [US4] Выполнить after benchmarks 1k/5k/7 862/10k и manual 25k
- [x] T021 [US4] Зафиксировать результаты и ограничения в `specs/009-scalable-polling-import/benchmark-results.md`

## Phase 7: Documentation and validation

- [x] T022 [P] Обновить материал массовой загрузки в Справочнике (`app.js`)
- [x] T023 [P] Обновить `README.md`, `docs/architecture.md`, `docs/context-map.md`, `docs/implementation-log.md`
- [ ] T024 Запустить `tests.js`, `runtime-tests.js`, `server-tests.js`, browser `tests.html`, secret scan и `file://` smoke test — автоматические проверки PASS; встроенный браузер запрещает `file://`, требуется ручной smoke двойным щелчком
- [x] T025 Проверить `git diff`, отсутствие unrelated changes и отсутствие commit/push/deploy

## Dependencies

T001–T003 → T004–T007 → T008–T012 → T013–T018 → T019–T021 → T022–T025.

## Implementation Strategy

Сначала падающие parity/complexity tests, затем минимальный indexed core, после него UI progress/cancel. Web Worker рассматривается только если after profiling докажет CPU parsing/diff bottleneck после устранения P0/P1.
