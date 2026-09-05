# Tasks: Адресный опрос и фильтр домена

**Input**: Design documents from `specs/017-polling-target-domain/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Обязательны требованиями SC-001–SC-007 и правилами проекта для изменения selection/matching.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Зафиксировать границы поведения и безопасности до изменения selector.

- [x] T001 Создать Full SpecKit design и ADR для адресного выбора и домена в `specs/017-polling-target-domain/` и `docs/decisions/ADR-0017-polling-target-domain.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Подтвердить существующий plan/runtime boundary и общие правила UI-state.

- [x] T002 Проверить неизменность plan v2, exact-IP allowlist и текущего SR domain mapping в `app.js`, `mvp_runtime/server.py` и `mvp_runtime/polling.py`
- [x] T003 [P] Проверить достаточность `.gitignore` и отсутствие extension hooks в `.gitignore` и `.specify/extensions.yml`

**Checkpoint**: Новая feature ограничена frontend selection; Python network/runtime contract не требует изменения.

---

## Phase 3: User Story 1 - Опрос одного устройства по IP (Priority: P1) 🎯 MVP

**Goal**: Точно выбрать одно current-SR устройство по IPv4, показать карточку и сформировать план из одного device ID.

**Independent Test**: Уникальный documentation IP показывает правильное устройство и создаёт план с одним ID; empty/invalid/not-found/ambiguous дают ноль целей.

### Tests for User Story 1

- [x] T004 [US1] Добавить failing pure tests пяти статусов IP, exact current-only выбора и single-device plan без raw IP selection в `tests.js`
- [x] T005 [US1] Добавить failing UI-source assertions режима «По IP-адресу», поля и карточки устройства в `tests.js`

### Implementation for User Story 1

- [x] T006 [US1] Реализовать `resolvePollingIpTarget` и режим `single_ip` в чистой проекции/создании плана в `app.js`
- [x] T007 [US1] Реализовать переключатель режима, live IP input и безопасную карточку current-SR устройства в `app.js`
- [x] T008 [US1] Добавить responsive стили переключателя и карточки адресной цели в `styles.css`

**Checkpoint**: Адресный сценарий полностью работает без доменного фильтра и не делает сеть до запуска плана.

---

## Phase 4: User Story 2 - Фильтрация плана по домену (Priority: P2)

**Goal**: Дополнить массовый каскад первым уровнем Домен с one/many/all/missing semantics.

**Independent Test**: Выбор домена ограничивает следующие options и устройства; несколько доменов объединяются, «Все» воспроизводит прежний набор, смена родителя очищает дочерние значения.

### Tests for User Story 2

- [x] T009 [US2] Добавить failing domain normalization, one/many/all/missing и cascade-reset tests в `tests.js`

### Implementation for User Story 2

- [x] T010 [US2] Добавить доменное измерение перед категориями в `deriveAutomaticPollingPlan` и plan selection в `app.js`
- [x] T011 [US2] Отобразить группу «Домен» в существующем массовом каскаде и адаптировать сетку в `app.js` и `styles.css`

**Checkpoint**: Четырёхуровневый массовый каскад сохраняет прежнее пересечение и порядок устройств.

---

## Phase 5: User Story 3 - Сохранение прежней логики и безопасности (Priority: P3)

**Goal**: Сохранить Extron/Huawei, credentials, schedule/interval/TLS, direct-file и SR re-import semantics.

**Independent Test**: Equivalent filter/IP plans экспортируют прежний plan v2 без секретов; re-import пересчитывает цель; unsupported устройство остаётся network-silent.

### Tests for User Story 3

- [x] T012 [US3] Добавить regression tests plan v2/redaction, unsupported IP target, SR re-import reset и прежнего all-filter результата в `tests.js`
- [x] T013 [US3] Добавить 25 000-device performance regression для IP lookup и четырёхуровневого каскада в `tests.js`

### Implementation for User Story 3

- [x] T014 [US3] Синхронизировать UI-state/reset/change/submit flow обоих режимов в `app.js`
- [x] T015 [US3] Обновить описание модуля и «Справочник» для двух режимов и доменного каскада в `product-catalog.js`

**Checkpoint**: Оба режима интегрированы в прежний workflow без runtime schema change.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Документация, полная регрессия и проверка отсутствия чувствительных данных.

- [x] T016 [P] Обновить архитектуру, карту контекста и журнал реализации в `docs/architecture.md`, `docs/context-map.md`, `docs/implementation-log.md` и `AGENTS.md`
- [x] T017 Выполнить frontend/reference/syntax и полный Python regression из `specs/017-polling-target-domain/quickstart.md`
- [x] T018 Выполнить `git diff --check` и scan реальных IP/MAC/credentials/runtime artifacts во всех candidate changes

---

## Dependencies & Execution Order

- Phase 2 зависит от T001 и блокирует изменение selector.
- US1 выполняется первой как самостоятельный MVP.
- US2 использует общий selector после US1, но проверяется независимо в режиме `filters`.
- US3 выполняется после US1/US2 и подтверждает совместимость общего workflow.
- Polish выполняется после всех user stories.

## Parallel Opportunities

- T003 не меняет файлы реализации и может проверяться отдельно от T002.
- Документация T016 может готовиться после стабилизации поведения параллельно финальным regression repairs, но её итоговая формулировка зависит от T014–T015.

## Implementation Strategy

### MVP First

1. Завершить T002–T003.
2. Написать и увидеть падение T004–T005.
3. Реализовать T006–T008 и проверить адресный сценарий отдельно.

### Incremental Delivery

1. Exact current-SR IP selection и карточка.
2. Domain-first mass cascade.
3. Совместимость plan v2, re-import, unsupported и performance.
4. Справочник, документация и полная матрица проверок.

## Notes

- Все synthetic IP используют только documentation ranges.
- Реальные SR/IP/MAC/serial/credentials и poll results не входят в tests, docs или Git.
- Commit/push выполняются только по отдельному явному указанию пользователя.
