# Implementation Plan: Русский интерфейс и Справочник

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-russian-ui-reference/spec.md`

## Summary

Создать единый презентационный словарь русских категорий, статусов, действий и технических пояснений; перевести доступные маршруты без изменения внутренних кодов; добавить локальный поисковый модуль «Справочник» и контекстные переходы. Реализация остаётся dependency-free и не меняет state/API/import contracts.

## Technical Context

**Language/Version**: Vanilla JavaScript ES2022, HTML5, CSS3

**Primary Dependencies**: отсутствуют; локально vendored SheetJS остаётся только для XLSX

**Storage**: существующий encrypted state v3; справочные данные не сохраняются

**Testing**: dependency-free `tests.js`, `runtime-tests.js`, `server-tests.js`, локальная browser acceptance

**Target Platform**: Windows, Node.js 20+, loopback browser runtime

**Project Type**: однопользовательское локальное web-приложение

**Performance Goals**: поиск по Справочнику и смена маршрута менее 1 секунды; существующий Dashboard budget менее 2 секунд на 5 000/25 000

**Constraints**: полная локальность, без новых CDN/npm/i18n dependencies; не менять raw SR/JSON, state schema и API; только роль «Администратор МЦТП»; no commit/push/deploy

**Scale/Scope**: 7 доступных маршрутов, 10 справочных разделов, не менее 35 терминов/карточек, весь текущий пользовательский слой

## Constitution Check

*Pre-design gate: PASS. Post-design gate: PASS.*

- I Raw evidence: PASS — исходные значения SR/JSON не изменяются; словарь применяется только при выводе.
- II Identity: PASS — сопоставление устройств не меняется.
- III Determinism: PASS — один внутренний код всегда имеет одну русскую подпись; поиск нормализован детерминированно.
- IV Incomplete data: PASS — unknown/unsupported не маскируются успехом или нулём.
- V Explainability: PASS — Справочник объясняет источники, периоды и правила KPI.
- VI Local security: PASS — справочник статический, внешних запросов и сохранения поисковых запросов нет.
- Workflow: PASS — отдельные spec/plan/tasks/tests/docs; совместимость существующих suites обязательна.

## Project Structure

### Documentation (this feature)

```text
specs/005-russian-ui-reference/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── terminology.md
│   └── reference-module.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
app.js                 # UI_TERMS, HELP_SECTIONS, formatters, routes, rendering, handlers
styles.css             # help page, search results, contextual help controls
index.html             # static secure-mode notice terminology
tests.js               # dictionary/search/render/compatibility regression
README.md
docs/
├── architecture.md
├── project-vision.md
├── context-map.md
└── implementation-log.md
```

**Structure Decision**: Сохранить текущую однофайловую UI-архитектуру. Небольшой неизменяемый словарь и справочник располагаются рядом с существующими чистыми селекторами в `app.js`, чтобы не добавлять загрузчик модулей или новый runtime dependency.

## Complexity Tracking

Нарушений constitution и дополнительных архитектурных слоёв нет.
