# Карта контекста

## Текущая feature 016

- Спецификация, план, контракт и задачи: `specs/016-huawei-te40-polling/`.
- Подтверждённый адаптер Huawei TE40: `mvp_runtime/adapters/huawei_te40.py`.
- Exact-model-first routing: `mvp_runtime/catalog.py`, `runtime/model-catalog.js`, `runtime/device-catalog.json`.
- Архитектурное решение: `docs/decisions/ADR-0016-huawei-te40-polling.md`.

## Feature 015

- Спецификация, правило, модель, контракт и задачи: `specs/015-reboot-analytics/`.
- Производный индекс, фильтры, KPI и renderer: `app.js`.
- Маршрут и пользовательская справка: `product-catalog.js`.
- Архитектурное решение: `docs/decisions/ADR-0015-reboot-analytics.md`.

## Production runtime feature 014

- Спецификация, план, задачи и контракты: `specs/014-python-runtime-migration/`.
- Пользовательский запуск: `START_MVP_SPHERE_SR.py`, `mvp_runtime/launcher.py`.
- Loopback session и browser API: `mvp_runtime/server.py`.
- XLSX credentials и redaction: `mvp_runtime/credentials.py`, `mvp_runtime/redaction.py`, `runtime/credential-pool.js`.
- План, exact-IP allowlist, job и ACK: `mvp_runtime/polling.py`, `mvp_runtime/polling_job.py`.
- Подтверждённый Extron adapter: `mvp_runtime/adapters/extron.py`.
- Подтверждённый Huawei TE40 adapter: `mvp_runtime/adapters/huawei_te40.py`.
- Общий каталог устройств: `runtime/device-catalog.json`; CommonJS migration/reference loader: `runtime/model-catalog.js`.
- Архитектурное решение runtime: `docs/decisions/ADR-0014-python-runtime-migration.md`.

## Постоянные инструкции

- `AGENTS.md`
- `.specify/memory/constitution.md`
- `docs/development-workflow.md`

## Интерфейс и продукт

- UI/state/analytics/Dashboard, direct-file manual mode и Python automatic mode: `index.html`, `runtime-config.js`, `styles.css`, `app.js`.
- Product catalog/reference: `product-catalog.js`, `scripts/validate-reference.js`.
- XLSX browser runtime: `vendor/xlsx.full.min.js`, `vendor/LICENSE.sheetjs.txt`.
- Frontend regression/performance: `tests.js`, `tests.html`, `tests/fixtures/`, `benchmarks/import-performance.js`.
- Python contract/security/integration: `python_tests/`.
- Видение и архитектура: `docs/project-vision.md`, `docs/architecture.md`.

## Актуальные правила

- Production automatic runtime — Python 3.11+ standard library; Node.js только development/CI.
- `START_MVP_SPHERE_SR.py` — полный режим; прямой `index.html` — ручной режим.
- State, secrets, sessions и jobs — только память. Готовые JSON — только выбранная папка.
- Внешних API, package manager, CDN и telemetry нет.
- Подтверждены локальный динамический HTTPS web contract Extron controller/panel и отдельный HTTPS web-CGI contract Huawei TE40; остальные vendor/model adapters — `protocol_required`.
- Модули/Справочник меняются через `product-catalog.js`; device manifests — через `runtime/device-catalog.json`.

## История

- Feature 013 и ADR-0013 документируют заменённый Node/PowerShell loopback runtime.
- Feature 011–012 документируют происхождение Extron contract и plan v2.
- Feature 008–010 описывают ручную общую папку, производительность импорта и единое оборудование.
- Исторические runtime-файлы Node/PowerShell удалены после Python parity; ссылки на них в старых ADR/specs являются историческими, не рабочими инструкциями.
