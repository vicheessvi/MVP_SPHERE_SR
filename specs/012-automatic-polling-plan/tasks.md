# Tasks: Загрузка и план автоматического опроса

**Input**: Design documents from `/specs/012-automatic-polling-plan/`

## Phase 1: Setup

- [X] T001 Зафиксировать feature 012 и активный путь в `.specify/feature.json`
- [X] T002 Проверить актуальные ignore-паттерны для credentials и результатов в `.gitignore`

## Phase 2: Foundational

- [X] T003 Добавить чистую модель credential pool в `runtime/credential-pool.js`
- [X] T004 Добавить чистую каскадную проекцию плана в `app.js`
- [X] T005 Добавить regression tests foundational contracts в `tests.js` и `runtime-tests.js`

## Phase 3: User Story 1 - Точный план из актуальной SR (P1)

**Independent Test**: 13 сценариев каскада и точный счётчик.

- [X] T006 [US1] Исправить SR outcome при нуле отклонений в `app.js`
- [X] T007 [US1] Реализовать multi-select «Все» и каскад в `app.js`
- [X] T008 [US1] Обновить представление multi-select/chips в `styles.css`
- [X] T009 [US1] Экспортировать plan schema v2 и поддержку устройств в `app.js`
- [X] T010 [US1] Добавить фильтры/count/SR status tests в `tests.js`

## Phase 4: User Story 2 - Безопасный пул credentials (P1)

**Independent Test**: XLSX validation и ноль утечек synthetic secret.

- [X] T011 [US2] Добавить UI-загрузку XLSX только в память страницы в `app.js`
- [X] T012 [US2] Перевести CLI на обязательный текущий XLSX pool в `scripts/poll-devices.js`
- [X] T013 [US2] Добавить последовательные credential attempts без идентификаторов в result в `runtime/extron-web-poller.js`
- [X] T014 [US2] Добавить credential validation/redaction tests в `runtime-tests.js`

## Phase 5: User Story 3 - Последовательный опрос (P1)

**Independent Test**: `poll → save → wait → poll`, cancel и save failure.

- [X] T015 [US3] Добавить unsupported pre-skip, interval, callback и abort в `runtime/polling.js`
- [X] T016 [US3] Сохранять каждый result из callback и показывать progress в `scripts/poll-devices.js`
- [X] T017 [US3] Сделать credentials и output обязательными в `poll-extron.ps1`
- [X] T018 [US3] Добавить interval/cancel/save-order tests в `runtime-tests.js`

## Phase 6: User Story 4 - Операционный экран и Справочник (P2)

**Independent Test**: четыре короткие секции и полная локальная справка.

- [X] T019 [US4] Перестроить «Загрузку» и русские подписи в `app.js`
- [X] T020 [US4] Обновить справочные записи и терминологию в `product-catalog.js`
- [X] T021 [US4] Обновить UX regression tests в `tests.js`

## Phase 7: Polish

- [X] T022 Обновить архитектуру, ADR, README, context map и implementation log в `docs/` и `README.md`
- [X] T023 Выполнить полный набор тестов, syntax checks, reference validation и secret/artifact scan

## Dependencies

T001–T005 блокируют истории; US1 и US2 затем выполняются до US3; US4 использует готовые контракты; T022–T023 завершают feature.

## Implementation Strategy

Сначала чистые контракты и тесты, затем UI и безопасный runner, после чего документация и полный regression. Все задачи выполняются в текущей ветке без commit/push/deploy.
