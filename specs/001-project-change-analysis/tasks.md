# Tasks: Browser-only анализ изменений проектов и оборудования

**Input**: Design documents from `specs/001-project-change-analysis/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, ADR-0003

**Tests**: Обязательны через dependency-free `tests.html`/`tests.js` и synthetic fixtures. Package manager и external test framework не добавляются.

**Organization**: Задачи сгруппированы по user stories; тесты каждой истории создаются до соответствующей реализации.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: можно выполнять параллельно после завершения явных зависимостей
- **[Story]**: пользовательская история из `spec.md`
- Все пути указаны относительно корня репозитория

---

## Phase 1: Setup (Static Application Shell)

**Purpose**: Создать direct-open static shell без product behavior.

- [X] T001 Создать единственную точку входа с root container, local assets и demo-mode banner в `index.html`
- [X] T002 [P] Создать desktop-first responsive visual system, accessibility states и severity/confidence styles в `styles.css`
- [X] T003 Создать strict-mode IIFE, startup sequence и именованные внутренние секции без network calls в `app.js`
- [X] T004 [P] Создать direct-open dependency-free test runner и result UI в `tests.html` и `tests.js`
- [X] T005 [P] Создать sanitized fixture tree и expectations loader в `tests/fixtures/expectations.js`

**Checkpoint**: `index.html` и `tests.html` открываются двойным кликом без backend/dependencies.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Реализовать versioned state, storage safety, demo roles, shared rendering и backup.

**⚠️ CRITICAL**: Эта фаза блокирует все user stories.

### Tests for foundational behavior

- [X] T006 [P] Создать падающие tests state initialization, validation, migration, atomic save и quota rollback в `tests.js`
- [X] T007 [P] Создать падающие tests JSON backup round-trip, malformed import rejection и referential integrity в `tests.js`

### Foundational implementation

- [X] T008 Реализовать `mvpSphereSrState.v1`, schema version, demo state и validated load/save whole-state в `app.js`
- [X] T009 Реализовать storage usage estimate, quota preflight, `QuotaExceededError` rollback и non-destructive corrupt-state recovery в `app.js`
- [X] T010 Реализовать local Administrator/AV Engineer demo accounts, login/logout и explicit non-security warning в `app.js`
- [X] T011 Реализовать transient UI route, shared layout, navigation, message/error region и event delegation в `app.js`
- [X] T012 Реализовать safe HTML escaping, ID/date/size helpers, UTC handling и stable local history entries в `app.js`
- [X] T013 Реализовать full JSON export/import envelope с validation-before-replace и Blob download в `app.js`
- [X] T014 Подключить foundational login/dashboard/settings shell states и controls в `index.html`, `app.js` и `styles.css`
- [X] T015 Довести foundational state/backup tests до PASS и отразить список проверок в `tests.html`

**Checkpoint**: State переживает reload и backup round-trip; ошибка import/quota не повреждает current state; UI явно не заявляет настоящую авторизацию.

---

## Phase 3: User Story 1 — Обнаружить изменения нового снимка (Priority: P1) 🎯 MVP

**Goal**: Импортировать Extron v1/legacy snapshots, безопасно связать identity и показать explainable previous diff.

**Independent Test**: Импортировать baseline и snapshots с IP/MAC/name/add/remove/formatting changes и получить только ожидаемые events с confidence/provenance.

### Tests for User Story 1

- [X] T016 [P] [US1] Создать sanitized Extron v1 pair fixtures в `tests/fixtures/extron-v1/baseline.json`, `tests/fixtures/extron-v1/ip-changed.json`, `tests/fixtures/extron-v1/mac-changed.json`, `tests/fixtures/extron-v1/name-changed.json` и `tests/fixtures/extron-v1/formatting-only.json`
- [X] T017 [P] [US1] Создать lifecycle/completeness fixtures в `tests/fixtures/extron-v1/device-added.json`, `tests/fixtures/extron-v1/device-removed-complete.json` и `tests/fixtures/extron-v1/device-missing-unknown.json`
- [X] T018 [P] [US1] Создать legacy/unsupported/secret fixtures в `tests/fixtures/legacy/sample-a.json`, `tests/fixtures/legacy/sample-a-reordered.json`, `tests/fixtures/extron-v1/unsupported-version.json` и `tests/fixtures/extron-v1/secret-present.json`
- [X] T019 [US1] Создать падающие contract tests Extron v1 required fields/enums и deterministic legacy detection в `tests.js`
- [X] T020 [US1] Создать падающие normalization/matching/diff tests для identity, formatting noise, duplicate и completeness-safe removal в `tests.js`
- [X] T021 [US1] Создать падающий end-to-end browser test file intake → persist → previous comparison в `tests.js`

### Implementation for User Story 1

- [X] T022 [US1] Реализовать multiple JSON file selection, text reading, size guard и per-file result isolation в `app.js`
- [X] T023 [US1] Реализовать deterministic SHA-256 helper with browser crypto capability check и duplicate detection в `app.js`
- [X] T024 [US1] Реализовать Extron v1 required-contract validator и unsupported schema outcome в `app.js`
- [X] T025 [US1] Реализовать legacy recognition, capturedAt derivation и legacy completeness defaults в `app.js`
- [X] T026 [US1] Реализовать pure MAC/IP/boolean/date/whitespace/unordered-list normalizers с ruleset version в `app.js`
- [X] T027 [US1] Реализовать Project/Asset observations, raw/normalized values и JSON-path provenance в `app.js`
- [X] T028 [US1] Реализовать Connected Devices/systemdevs reconciliation, duplicate conflicts и secret detection/redaction в `app.js`
- [X] T029 [US1] Реализовать stable project identity, manual project mapping и conflict-safe Project references в `app.js`
- [X] T030 [US1] Реализовать stable-ID-first Asset matching, explainable confidence и ambiguous blocking в `app.js`
- [X] T031 [US1] Реализовать ChangeSet/ChangeEvent rules, severity, multi-field grouping и confirmed/possible removal semantics в `app.js`
- [X] T032 [US1] Реализовать atomic client pipeline validate → normalize → match → compare → quota preflight → save в `app.js`
- [X] T033 [US1] Реализовать upload, per-file outcomes, snapshot detail/completeness/issues и mapping screens в `app.js` и `styles.css`
- [X] T034 [US1] Реализовать previous comparison screen с entity, old/new, category, severity, confidence и safe evidence paths в `app.js` и `styles.css`

**Checkpoint**: US1 проходит synthetic tests; duplicate не меняет history, formatting-only не создаёт event, ambiguous identity не становится definitive change.

---

## Phase 4: User Story 2 — Исследовать историю проекта (Priority: P2)

**Goal**: Просматривать capturedAt timeline, сравнивать выбранные даты и корректно включать late snapshot.

**Independent Test**: Импортировать даты 1 и 3, затем 2; получить timeline 1→2→3, superseded 1→3 и выбранное сравнение 1→3.

### Tests for User Story 2

- [X] T035 [P] [US2] Создать late snapshot fixture и expected ChangeSet graph в `tests/fixtures/extron-v1/late-snapshot.json` и `tests/fixtures/timeline-expectations.js`
- [X] T036 [US2] Создать падающие tests capturedAt ordering, deterministic ties, selected comparison и late reflow в `tests.js`

### Implementation for User Story 2

- [X] T037 [US2] Реализовать Project selectors, current state и capturedAt timeline с отдельным uploadedAt в `app.js`
- [X] T038 [US2] Реализовать idempotent selected-date comparison для snapshots одного Project в `app.js`
- [X] T039 [US2] Реализовать late-snapshot adjacent reflow и superseded links без удаления прежних ChangeSets в `app.js`
- [X] T040 [US2] Реализовать project list/detail, asset inventory и timeline screens в `app.js` и `styles.css`
- [X] T041 [US2] Реализовать date-pair selector, active/superseded markers и selected comparison view в `app.js` и `styles.css`

**Checkpoint**: US2 работает без baseline/review и всегда строит active previous history по capturedAt.

---

## Phase 5: User Story 3 — Контролировать отклонение от baseline (Priority: P3)

**Goal**: Назначать/заменять baseline и видеть сохраняющийся drift.

**Independent Test**: Назначить snapshot 1 baseline, импортировать snapshots 2/3 с тем же drift и сохранить историю replacement.

### Tests for User Story 3

- [X] T042 [P] [US3] Создать baseline drift expectations и expiration-pending cases в `tests/fixtures/baseline-expectations.js`
- [X] T043 [US3] Создать падающие tests single active baseline, append-only replacement и persistent drift в `tests.js`

### Implementation for User Story 3

- [X] T044 [US3] Реализовать append-only BaselineAssignment state и single-active invariant в `app.js`
- [X] T045 [US3] Реализовать baseline ChangeSet calculation и current drift selectors в `app.js`
- [X] T046 [US3] Реализовать assign/replace/end confirmation, history и expiration-pending guard в `app.js`
- [X] T047 [US3] Реализовать baseline summary, drift events и assignment history screen в `app.js` и `styles.css`

**Checkpoint**: US3 сохраняет baseline history и не удаляет active baseline молча.

---

## Phase 6: User Story 4 — Проверить и классифицировать изменение (Priority: P4)

**Goal**: Фильтровать events, изучать evidence, разрешать ambiguous matches и сохранять append-only local decisions.

**Independent Test**: Найти event фильтрами, проверить evidence, добавить два review decisions и разрешить ambiguous match без потери истории.

### Tests for User Story 4

- [X] T048 [US4] Создать падающие tests Change Event contract, filters, safe evidence и append-only decisions в `tests.js`
- [X] T049 [US4] Создать падающие tests UI role filtering, match recalculation и explicit non-security warning в `tests.js`

### Implementation for User Story 4

- [X] T050 [US4] Реализовать event filters по project/period/entity/category/type/severity/confidence/review status в `app.js`
- [X] T051 [US4] Реализовать append-only ReviewDecision и latest review projection в `app.js`
- [X] T052 [US4] Реализовать MatchDecision choose/create/replace/unmatched и controlled dependent recalculation в `app.js`
- [X] T053 [US4] Реализовать change list/detail, safe evidence и review history screens в `app.js` и `styles.css`
- [X] T054 [US4] Реализовать unresolved match candidate screen с matched/conflicting signals в `app.js` и `styles.css`
- [X] T055 [US4] Реализовать demo-role navigation/action filtering и persistent local-security notice в `app.js`, `index.html` и `styles.css`

**Checkpoint**: US4 decisions append-only в ordinary UI; ни один экран не описывает local login как настоящую безопасность.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Закрыть retention, quota, accessibility, performance и documentation acceptance.

- [X] T056 Реализовать startup/manual retention, RetentionAudit, active-baseline guard и no-ChangeEvent deletion в `app.js`
- [X] T057 [P] Добавить retention/quota/backup/corrupt-state regression cases в `tests.js`
- [X] T058 [P] Добавить keyboard focus, text status, empty/error states, storage usage и responsive tables в `styles.css` и `app.js`
- [X] T059 Выполнить direct-open automated/manual scenarios и записать результаты в `specs/001-project-change-analysis/quickstart.md`
- [X] T060 Обновить фактические paths, ограничения, checks и constitution exceptions в `README.md`, `docs/architecture.md`, `docs/context-map.md` и `docs/implementation-log.md`

---

## Requirements Traceability

| Requirement group | Primary tasks |
|---|---|
| FR-001–FR-005: import/raw/duplicate/validation/status | T016–T025, T032–T034 |
| FR-006–FR-008: canonical state/normalization/reconciliation | T020, T026–T028 |
| FR-009–FR-012: project/device identity and ambiguity | T020, T029–T030, T049, T052, T054 |
| FR-013–FR-018: previous/selected/baseline diff and completeness | T020, T031, T035–T047 |
| FR-019–FR-027: events/history/filters/reviews/late snapshot | T031, T035–T54 |
| FR-028–FR-029, FR-032: demo limitations/secret handling/roles | T010, T028, T049, T055 |
| FR-033–FR-035: local retention and baseline guard | T042, T046, T056–T057 |
| FR-036–FR-038: direct launch/localStorage/backup | T001–T015, T059 |
| SC-001–SC-013 | T015–T021, T035–T049, T057–T059 |

---

## Dependencies & Execution Order

- **Phase 1** starts immediately.
- **Phase 2** depends on Phase 1 and blocks all user stories.
- **US1** depends on Foundation and creates snapshot/identity/diff primitives.
- **US2**, **US3** and **US4** depend on US1, then can proceed independently.
- **Polish** follows selected stories; retention baseline guard requires US3.

```text
Setup → Foundation → US1
                       ├→ US2
                       ├→ US3
                       └→ US4
US2 + US3 + US4 → Polish / full acceptance
```

## Parallel Opportunities

- T002, T004 and T005 use separate files after T001/T003 shell decisions.
- T016–T018 create separate fixtures in parallel.
- After US1, US2/US3/US4 can be assigned independently.
- T057 and T058 touch separate test/style concerns after core behavior.
- Most `app.js` implementation tasks remain sequential to avoid conflicting edits in the single-file reference architecture.

## Implementation Strategy

### First demonstrable MVP slice

1. Complete Setup and Foundation.
2. Complete US1.
3. Open `tests.html`, then manually validate import/diff by double-clicking `index.html`.
4. Do not use real sensitive data; this slice remains demo-only.

### Incremental delivery

1. Direct-open shell + safe local state/backup.
2. US1 import and explainable previous diff.
3. US2 timeline and arbitrary dates.
4. US3 baseline drift.
5. US4 filters/evidence/review.
6. Retention/quota/performance/full documentation acceptance.

## Stop Conditions

- Do not add backend, database, package manager, framework, CDN or network call without a new ADR.
- Do not claim UI roles/local history/local raw state are production security or tamper-resistant audit.
- Do not commit real infrastructure snapshots.
- Stop and require architecture review if control state exceeds 3 MiB raw input, quota errors occur in the acceptance browser or real multi-user use is requested.
