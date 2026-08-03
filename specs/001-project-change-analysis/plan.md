# Implementation Plan: Анализ изменений проектов и оборудования

**Branch**: не создавалась; SpecKit feature `001-project-change-analysis` | **Date**: 2026-08-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-project-change-analysis/spec.md`

## Summary

Создать автономный browser-only MVP по runtime-паттерну `drthalas/MVP_DEMO`: пользователь открывает `index.html` двойным кликом, импортирует Extron JSON snapshots, связывает их с проектами, анализирует изменения, timeline, baseline и review, а versioned state хранится в `localStorage` и переносится полным JSON backup.

Технический подход: три product-файла `index.html` + `styles.css` + `app.js`, отсутствие backend/dependencies/build step, детерминированный client-side pipeline `read → validate → normalize → match → compare → persist → render` и dependency-free browser test harness.

## Technical Context

**Language/Version**: HTML5, CSS3, Vanilla JavaScript уровня современных evergreen desktop browsers

**Primary Dependencies**: отсутствуют

**Storage**: versioned browser `localStorage` key `mvpSphereSrState.v1`; полный JSON backup/restore; raw snapshot сохраняется в локальном state на уровне приложения без последующего редактирования

**Testing**: `tests.html` + `tests.js`, synthetic JSON pair fixtures, ручные сценарии `quickstart.md`; optional `node --check app.js` только если Node.js доступен

**Target Platform**: локальный desktop browser; запуск `file://.../index.html`

**Project Type**: автономное статическое browser application

**Performance Goals**: сравнение нового snapshot не более 10 секунд; обычный rerender не более 2 секунд на наборе до 10 проектов, 100 устройств и 10 snapshots общим raw-размером не более 3 MiB

**Constraints**: no backend, database, network requests, package manager, build step, framework или external runtime libraries; local UI roles не являются security boundary; sanitized/demo data only

**Scale/Scope**: один browser profile, один локальный пользователь за раз, demo-scale state в пределах фактической `localStorage` quota

## Constitution Check

### Updated architecture gate

| Principle | Plan evidence | Status |
|---|---|---|
| I. Неизменяемые исходные доказательства | Raw text/hash не меняются через UI, входят в backup и имеют provenance | TEMPORARY EXCEPTION: `localStorage` не tamper-resistant |
| II. Идентичность предшествует сравнению | Stable IDs, confidence и explicit manual decisions сохраняются | PASS |
| III. Детерминированная нормализация | Versioned pure functions и pair fixtures | PASS |
| IV. Безопасная работа с неполными данными | Completeness отделена от отсутствия; possible removal не равно confirmed | PASS |
| V. Разделение событий и объяснимость | Event contract сохраняет category, severity, confidence и evidence | PASS |
| VI. Защита инфраструктурных данных | Нет сети, есть redaction и sanitized-only warning | TEMPORARY EXCEPTION: нет настоящей auth/storage isolation |
| Workflow и контроль качества | Full SpecKit artifacts и dependency-free tests обновляются вместе | PASS |

Gate result: **PASS WITH DOCUMENTED TEMPORARY EXCEPTIONS**. Владелец, компенсации и условие устранения зафиксированы в `docs/decisions/ADR-0003-browser-only-demo-stack.md`. Исключения допустимы только для локального демонстрационного MVP и блокируют использование production-sensitive data.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-change-analysis/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/
│   └── requirements.md
└── contracts/
    ├── change-event.md
    ├── extron-snapshot-v1.schema.json
    ├── html-interface.md
    └── legacy-extron-snapshot.md
```

### Source Code (repository root, planned)

```text
index.html
styles.css
app.js
tests.html
tests.js
tests/
└── fixtures/
    ├── expectations.js
    ├── extron-v1/
    └── legacy/
```

**Structure Decision**: повторить минимальный runtime boundary эталона: один HTML entry point, один stylesheet и один dependency-free script. `app.js` организуется внутренними именованными секциями/функциями: constants, state/storage, validation, normalization, identity, comparison, retention, selectors, renderers и event handlers. Plain scripts используются вместо ES modules, чтобы direct `file://` launch не зависел от module-origin behavior.

## Runtime Flow

```text
open index.html
  → load/validate localStorage state
  → show demo-mode warning and local login
  → user selects JSON file(s)
  → FileReader reads text
  → hash + format validation + quota preflight
  → normalize + match + compare
  → atomically replace local state
  → render timeline/events/baseline/reviews
  → optional JSON backup download
```

## Browser Storage Rules

- Не изменять active state до полной валидации import/upload и quota preflight.
- При `QuotaExceededError` сохранить прежний state и показать recovery guidance.
- Не полагаться на storage как на единственную копию: UI предлагает JSON backup после значимой загрузки.
- Retention запускается при старте и вручную; закрытая страница не выполняет background work.
- Изменение state через DevTools находится вне security guarantees browser-only MVP.

## Complexity Tracking

| Exception | Why needed | Compensation | Exit condition |
|---|---|---|---|
| Raw evidence не tamper-resistant | Direct-open `index.html` и `localStorage` заданы пользователем | Hash, no-edit UI, full backup, demo warning | До production принять secure storage ADR |
| UI roles не являются auth boundary | Backend/runtime запрещены выбранным стеком | Sanitized-only data, no network, persistent warning | До multi-user/real-data use добавить real auth |
| Retention не гарантирует долговечность | Browser может очищать storage независимо от приложения | Startup/manual retention, backup/restore, deletion audit | Перенести retention на controlled storage |

Дополнительные runtime-компоненты не добавляются. Любой framework, backend, database или package manager требует нового ADR.
