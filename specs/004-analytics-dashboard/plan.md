# Implementation Plan: Операционный Dashboard

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Summary

Заменить текущую минимальную сводку единым детерминированным DashboardSummary selector и операционным UI. Selector за один подготовительный проход строит latest result map, scoped device states, period activity, problems, locations, VIP и distributions. UI отображает только реальные/поддерживаемые показатели, применяет глобальные фильтры и переиспользует текущие inventory/upload/polling-plan flows для drill-down и действий.

## Technical Context

**Language/Version**: JavaScript ES2022, HTML5, CSS3; Node.js 20+ для тестов/runtime

**Primary Dependencies**: Vanilla JavaScript; локальный SheetJS остаётся только для XLSX import; новых UI/chart dependencies нет

**Storage**: существующий encrypted state v3 через loopback secure runtime

**Testing**: dependency-free `tests.js` плюс существующие runtime/server suites

**Target Platform**: Windows desktop, современный браузер через `127.0.0.1`

**Project Type**: single local web application with embedded runtime

**Performance Goals**: summary для 5 000 devices и 25 000 results менее 2 секунд в Node regression

**Constraints**: локально, без внешней передачи; не раскрывать raw JSON/secrets; не считать unknown analytics нулём; не добавлять новый framework/backend endpoint per KPI

**Scale/Scope**: один администратор, тысячи устройств, десятки тысяч results; ограниченные presentation lists

## Constitution Check

### Pre-design

- I Raw evidence: PASS — selector читает immutable polling results и не изменяет их.
- II Identity: PASS — current state группируется по `deviceId`; unmatched results остаются data issues.
- III Determinism: PASS — сортировка использует `capturedAt` и стабильный `id` tie-breaker.
- IV Incomplete data: PASS — отсутствие результата означает no data/unsupported, не failure.
- V Explainability: PASS — equipment problems, changes и data issues разнесены.
- VI Local protection: PASS — selector работает с локальным state и возвращает только safe summaries.
- Workflow/quality: PASS — Full SpecKit, tests before UI and documented metric semantics.

### Post-design

PASS. Контракты фиксируют latest/period semantics, safe event projections, drill-down и blocked analytics. Нарушений constitution нет.

## Project Structure

```text
app.js                         # pure DashboardSummary selector + UI + filter/drill-down handlers
styles.css                    # responsive dashboard layout/status components
tests.js                      # selector, semantics, drill-down and performance regression
docs/
├── architecture.md
├── project-vision.md
└── implementation-log.md
specs/004-analytics-dashboard/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dashboard-summary.md
│   └── dashboard-drilldown.md
└── tasks.md
```

**Structure Decision**: Feature расширяет существующий single-file application/service слой. Pure selector экспортируется через текущий `MvpSphereSR` API для тестов; отдельный runtime endpoint не нужен, так как state уже загружается один раз в защищённую сессию.

## Complexity Tracking

Нет нарушений или новых архитектурных компонентов.
