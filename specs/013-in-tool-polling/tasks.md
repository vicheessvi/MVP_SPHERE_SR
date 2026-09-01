# Tasks: автоматический опрос внутри инструмента

## Phase 1: Setup

- [x] T001 Зафиксировать новую loopback-архитектуру и границы TLS в docs/decisions/ADR-0013-in-tool-polling.md
- [x] T002 Обновить активный контекст feature в docs/context-map.md и AGENTS.md

## Phase 2: Foundational

- [x] T003 Добавить безопасные job/result helpers и secret validation в server.js
- [x] T004 Расширить локальную session модель ephemeral credential pool и одним active job в server.js
- [x] T005 [P] Добавить browser runtime API helpers и чистые folder/result helpers в app.js
- [x] T006 [P] Подготовить UI состояния и стили прогресса автоматического запуска в app.js и styles.css

## Phase 3: User Story 1 — запуск из плана

**Independent Test**: локальный endpoint принимает XLSX и plan, запускает synthetic adapter; file-mode блокирует сеть.

- [x] T007 [US1] Реализовать binary XLSX import endpoint с SHA-256 и safe summary в server.js
- [x] T008 [US1] Реализовать create/status/cancel polling job endpoints в server.js
- [x] T009 [US1] Разрешить local launch mode и загрузку runtime browser assets в app.js и server.js
- [x] T010 [US1] Связать формирование плана и кнопку запуска с loopback runtime в app.js

## Phase 4: User Story 2 — сохранение готовых результатов

**Independent Test**: два synthetic результата создают одну timestamp-папку и подтверждаются до интервала.

- [x] T011 [US2] Реализовать pending result GET и save ACK backpressure в server.js
- [x] T012 [US2] Реализовать выбор общей папки, создание уникальной timestamp-папки и атомарную browser запись JSON в app.js
- [x] T013 [US2] Сохранить совместимость созданной структуры с ручным импортом в app.js и tests.js

## Phase 5: User Story 3 — защищённая локальная авторизация

**Independent Test**: synthetic secret отсутствует во всех API responses, state, logs и result files; self-signed flag остаётся per-job.

- [x] T014 [US3] Очищать credential pool во всех terminal paths и ограничить request sizes/session access в server.js
- [x] T015 [US3] Добавить явный per-run self-signed HTTPS control без HTTP fallback в app.js и server.js
- [x] T016 [US3] Обновить constitution security rule и runtime documentation в .specify/memory/constitution.md и docs/architecture.md

## Phase 6: User Story 4 — прогресс и отмена

**Independent Test**: UI получает точные counters, отмена во время schedule/interval предотвращает следующий poll.

- [x] T017 [US4] Добавить безопасный progress monitor, состояния и отмену в app.js
- [x] T018 [US4] Добавить server/browser regression для progress, ACK, cancellation, CSRF и secret cleanup в server-tests.js и tests.js

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T019 Обновить Справочник, README и implementation log в product-catalog.js, README.md и docs/implementation-log.md
- [x] T020 Запустить tests.js, runtime-tests.js, server-tests.js, validate-reference, syntax, diff и secret scans

## Dependencies

- Phase 2 зависит от Phase 1.
- US1 зависит от foundational session/job helpers.
- US2 зависит от US1 job lifecycle.
- US3 может усиливать US1/US2 после готовности endpoints.
- US4 зависит от US1 job status и US2 ACK.
- Polish выполняется после всех user stories.

## Parallel Opportunities

- T005 и T006 можно выполнять параллельно после согласования UI state names.
- Документационные части T016 и T019 не пересекаются с runtime tests до финальной синхронизации.

## Implementation Strategy

MVP: T001–T012 — защищённый запуск одного плана и подтверждённая запись каждого JSON. Затем hardening secrets/TLS, progress/cancel, документация и полный regression.
