# Карта контекста

## Текущая feature 012

- Спецификация и план: `specs/012-automatic-polling-plan/`.
- Каскад, план v2, XLSX UI validation и ручной импорт: `app.js`, `runtime/credential-pool.js`.
- Последовательный Extron polling, интервал и per-result save: `runtime/extron-web-poller.js`, `runtime/polling.js`, `scripts/poll-devices.js`, `poll-extron.ps1`.
- Термины и Справочник: `product-catalog.js`.
- Архитектурное решение: `docs/decisions/ADR-0012-automatic-polling-plan.md`.

## Постоянные инструкции

- `AGENTS.md`
- `.specify/memory/constitution.md`

## Актуальная архитектура и продукт

- `docs/project-vision.md`
- `docs/architecture.md`
- `docs/decisions/ADR-0005-secure-local-runtime.md`
- `docs/decisions/ADR-0007-direct-index-session-mode.md`
- `docs/decisions/ADR-0008-batch-folder-file-only.md`
- `docs/decisions/ADR-0011-extron-web-polling.md`
- `specs/003-secure-local-polling/`
- `specs/004-analytics-dashboard/`
- `specs/005-russian-ui-reference/`
- `specs/006-portable-reference-sync/`
- `specs/007-direct-index-launch/`
- `specs/008-batch-polling-folder-import/`

## Код по зонам

- UI/state/analytics/Dashboard projection, единственный direct-file memory mode, индексированный пакетный импорт папок, progress/cancel и Справочник: `index.html`, `runtime-config.js`, `styles.css`, `app.js`.
- Performance regression и synthetic scale matrix: `tests.js`, `benchmarks/import-performance.js`, `specs/009-scalable-polling-import/benchmark-results.md`.
- Product catalog/reference source: `product-catalog.js`, `scripts/validate-reference.js`.
- Catalog/polling: `runtime/model-catalog.js`, `runtime/polling.js`, `runtime/extron-web-poller.js`, `scripts/poll-devices.js`, `poll-extron.ps1`.
- XLSX runtime: `vendor/xlsx.full.min.js`, `vendor/LICENSE.sheetjs.txt`.
- Regression: `tests.js`, `tests.html`, `tests/fixtures/`.
- Исторические runtime regression suites: `runtime-tests.js`, `server-tests.js`; они не определяют поддерживаемый способ запуска интерфейса.

## История и workflow

- `docs/development-workflow.md`
- `docs/implementation-log.md`
- `docs/decisions/`
- `specs/001-project-change-analysis/` и `specs/002-sr-inventory-analytics/` — исторические features; их legacy UI-модули не входят в текущую навигацию.
- `specs/003-secure-local-polling/`–`specs/007-direct-index-launch/` — исторические security/polling, Dashboard, русская терминология, переносимый runtime/каталог и переход к прямому запуску.
- `specs/008-batch-polling-folder-import/` — текущий контракт общей папки, нескольких сеансов и единственного запуска через HTML.

Внешнего API, package manager, CDN или telemetry нет. Подтверждён только локальный динамический web contract Extron controller/panel; остальные vendor adapters остаются `protocol_required`.
