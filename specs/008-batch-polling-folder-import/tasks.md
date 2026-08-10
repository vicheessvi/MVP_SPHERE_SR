# Tasks: Пакетный импорт папок опросов

**Input**: Design documents from `specs/008-batch-polling-folder-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Автоматические тесты обязательны по FR-014.

## Phase 1: Setup

- [x] T001 Активировать feature 008 в `.specify/feature.json`
- [x] T002 [P] Зафиксировать спецификацию и checklist в `specs/008-batch-polling-folder-import/spec.md` и `specs/008-batch-polling-folder-import/checklists/requirements.md`
- [x] T003 [P] Создать design artifacts в `specs/008-batch-polling-folder-import/plan.md`, `research.md`, `data-model.md`, `contracts/` и `quickstart.md`

## Phase 2: Foundational

- [x] T004 Добавить тесты группировки путей и календарной валидации в `tests.js`
- [x] T005 Добавить тесты пакетного импорта и единственного режима запуска в `tests.js`
- [x] T006 Реализовать чистую группировку JSON по ближайшей папке сеанса в `app.js`
- [x] T007 Расширить provenance запуска и результата относительными путями в `app.js`

## Phase 3: User Story 1 - Импорт всех сеансов одной папкой (P1)

**Goal**: Одна выбранная общая папка создаёт отдельный запуск для каждой датированной подпапки.

**Independent Test**: Две датированные папки, включая вложенный JSON, дают два хронологически обработанных запуска.

- [x] T008 [US1] Реализовать оркестрацию нескольких групп и хронологический импорт в `app.js`
- [x] T009 [US1] Передавать относительный путь каждого JSON в результат опроса в `app.js`
- [x] T010 [US1] Подключить пакетный обработчик к форме выбора общей папки в `app.js`

## Phase 4: User Story 2 - Понятный частичный импорт (P2)

**Goal**: Корректные данные сохраняются, а ошибки пути, чтения и JSON видны отдельно.

**Independent Test**: Смешанный набор показывает групповой итог, ошибки и число проигнорированных файлов.

- [x] T011 [US2] Добавить изоляцию ошибок чтения отдельных файлов в `app.js`
- [x] T012 [US2] Обновить форму и итоговые сообщения пакетного импорта в `app.js`
- [x] T013 [US2] Проверить отсутствие чтения не-JSON и отклонение путей без валидной папки в `tests.js`

## Phase 5: User Story 3 - Единственный запуск через HTML (P3)

**Goal**: Интерфейс имеет один поддерживаемый файловый режим.

**Independent Test**: `file://index.html` инициализируется с volatile storage; HTTP/secure marker не создаёт второй режим.

- [x] T014 [US3] Ограничить инициализацию приложения файловым launch contract в `app.js` и `runtime-config.js`
- [x] T015 [US3] Удалить из пользовательского интерфейса предложения второго режима и credential import в `app.js`

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T016 [P] Синхронизировать Справочник в `product-catalog.js` и проверить `scripts/validate-reference.js`
- [x] T017 [P] Обновить запуск и структуру импорта в `README.md`, `docs/architecture.md`, `docs/context-map.md`, `docs/implementation-log.md` и `AGENTS.md`
- [x] T018 Выполнить синтаксические, функциональные, справочные и secret/artifact проверки по `specs/008-batch-polling-folder-import/quickstart.md`

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → Polish.
- T004–T005 должны зафиксировать ожидаемое поведение до завершения T006–T015.
- US2 использует группировку US1, но проверяется отдельным смешанным набором.
- Документация T016–T017 выполняется после стабилизации контракта.

## Parallel Opportunities

- T002 и T003 затрагивают разные документы.
- T016 и T017 можно выполнять независимо после реализации.

## Implementation Strategy

Сначала реализуется MVP US1: чистая группировка и два запуска из одной папки. Затем добавляются частичные ошибки и единый файловый режим. Все задачи завершаются общей регрессией и синхронизацией Справочника.
