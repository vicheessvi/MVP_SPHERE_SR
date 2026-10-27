# Карта контекста

## Feature 032 — таблица Site name терминалов ВКС

- Требования и критерии: `specs/032-vcs-site-name-report/spec.md`.
- Фильтруемый selector, переключатель и локальный XLSX: `app.js`; тесты: `tests.js`; оформление: `styles.css`.
- Справочник: `product-catalog.js`; решение: `docs/decisions/ADR-0033-vcs-site-name-report.md`.

## Feature 031 — Polycom RealPresence Group 300/310/500/700

- Спецификация, evidence review, контракт и проверки: `specs/031-polycom-group-polling/`.
- Общий read-only HTTPS core с четырьмя exact-model wrappers: `mvp_runtime/adapters/polycom_group.py`.
- Маршрутизация: `mvp_runtime/polling.py`, `runtime/device-catalog.json`, `app.js`; Справочник: `product-catalog.js`.
- Group 310 подтверждён контролируемым и пользовательским опросом; Group 500 и 700 отдельно подтверждены пользователем. Group 300 остаётся provisional. Причина прежнего единичного model mismatch на Group 500 неизвестна.
- Group 300 с 4.1.5-180072 доступен по HTTP, но HTTPS-опрос остановился до credentials; 5.0+ — только кандидат для испытания, не подтверждённая гарантия. Решение: `docs/decisions/ADR-0032-polycom-group-polling.md`.
- Решение и ограничение pre-auth model check: `docs/decisions/ADR-0032-polycom-group-polling.md`.

## Feature 030 — Huawei CloudLink Bar 300 / Box 300 / Box 600

- Спецификация, доказательства Bar 300 и отдельные Box-gates: `specs/030-huawei-cloudlink-300-polling/`.
- Общий guarded CGI core и точные wrappers: `mvp_runtime/adapters/huawei_300.py`; регистрация: `mvp_runtime/polling.py`, `runtime/device-catalog.json`, `app.js`.
- Bar 300 проверен контролируемым read-only запросом; администратор подтвердил успешные отчёты и Site name на Box 300 и Box 600.
- Решение: `docs/decisions/ADR-0031-huawei-cloudlink-300-polling.md`.

## История требований Huawei CloudLink Bar 300 / Box 300 / Box 600

- Подтверждённый администратором путь к Site name и переход от требования к guarded-контракту: `docs/future-huawei-cloudlink-300-600.md`.
- Актуальная реализация и подтверждённый пользователем статус Box описаны в feature 030 выше.

## Feature 029 — продолжение опроса и Site Name

- Требования и контракты: `specs/029-resumable-polling-site-name/`.
- Отказ записи отдельного JSON, счётчики и ACK timeout: `mvp_runtime/polling_job.py`.
- Выбранная папка, видимый несекретный журнал и кнопка продолжения: `app.js`, `runtime/polling-recovery.js`.
- Опциональный Site Name Huawei: `mvp_runtime/adapters/huawei_site_name.py`, `huawei_te40.py`, `huawei_bar310.py`.
- Решение: `docs/decisions/ADR-0030-resumable-polling-site-name.md`.

## Текущая feature 028 — HTTP-only Huawei 310

- Спецификация, user-confirmed safe value, отдельные Box-контракты и задачи: `specs/028-huawei-310-http-only/`.
- Общий guarded HTTP read/minimal-write/post-read: `mvp_runtime/adapters/huawei_bar310.py`; точные Box wrappers: `mvp_runtime/adapters/huawei_box310.py`, `mvp_runtime/adapters/huawei_box610.py`.
- Opt-in action и UI: `runtime/device-catalog.json`, `app.js`, `product-catalog.js`.
- Архитектурное решение: `docs/decisions/ADR-0029-huawei-310-http-only.md`.
- Для Box 310/610 action provisional до отдельных контролируемых эксплуатационных проверок; `not_exposed` для Telnet означает отсутствие web-управления, не состояние TCP/23.

## Случайный интервал автоматического опроса

- Парные поля диапазона и экспорт плана: `app.js`, `styles.css`.
- Проверка границ и независимый выбор перед следующим устройством: `mvp_runtime/server.py`, `mvp_runtime/polling.py`.
- Решение: `docs/decisions/ADR-0028-random-polling-interval.md`.

## Feature 027 — раскрываемая аналитика

- Правила таблиц перезагрузок, истории версий и ошибок: `specs/027-analytics-drilldowns/`.
- Производные selectors и renderers: `app.js`; названия и Справочник: `product-catalog.js`; оформление: `styles.css`.
- Архитектурное решение: `docs/decisions/ADR-0027-analytics-drilldowns.md`.

## Текущая feature 026

- Спецификация и exact Bar 310 management contract: `specs/026-huawei-bar310-port-closure/`.
- Guarded HTTP read/minimal-write/post-read и безопасный Telnet `not_exposed`: `mvp_runtime/adapters/huawei_bar310.py`.
- Capability routing: `runtime/device-catalog.json`, `mvp_runtime/polling.py`, `app.js`.
- Архитектурное решение: `docs/decisions/ADR-0026-huawei-bar310-port-closure.md`.

## Feature 025

- Спецификация, отдельные подтверждённые контракты Box 310/610 и задачи: `specs/025-huawei-box-polling/`.
- Общий guarded core и подтверждённый Bar 310 contract: `mvp_runtime/adapters/huawei_bar310.py`.
- Отдельные Box wrappers: `mvp_runtime/adapters/huawei_box310.py`, `mvp_runtime/adapters/huawei_box610.py`.
- Catalog/routing: `runtime/device-catalog.json`, `mvp_runtime/polling.py`, `app.js`.
- Архитектурное решение: `docs/decisions/ADR-0025-huawei-box-polling.md`.

## Feature 024

- Спецификация, Bar 310 HTTPS-контракт и задачи: `specs/024-huawei-bar310-polling/`.
- Отдельный read-only adapter: `mvp_runtime/adapters/huawei_bar310.py`.
- Catalog/routing: `runtime/device-catalog.json`, `mvp_runtime/polling.py`, `app.js`.
- Архитектурное решение: `docs/decisions/ADR-0024-huawei-bar310-polling.md`.

## Feature 023

- Спецификация, TE20 write-contract и задачи: `specs/023-huawei-te20-port-closure/`.
- Guarded read/minimal-write/re-read: `mvp_runtime/adapters/huawei_te40.py`.
- Exact action eligibility и per-model transport: `runtime/device-catalog.json`, `mvp_runtime/catalog.py`, `runtime/model-catalog.js`, `app.js`.
- Архитектурное решение: `docs/decisions/ADR-0023-huawei-te20-port-closure.md`.

## Feature 022

- Спецификация, TE20 transport contract и задачи: `specs/022-huawei-te20-polling/`.
- Exact TLS 1.1, legacy pre-auth gate, post-auth model/identity и read-only resources: `mvp_runtime/adapters/huawei_te40.py`.
- Catalog/routing: `runtime/device-catalog.json`, `mvp_runtime/polling.py`, `app.js`.
- Архитектурное решение: `docs/decisions/ADR-0022-huawei-te20-polling.md`.

## Feature 021

- Спецификация, полный 42-колоночный контракт и задачи: `specs/021-sr-export-schema/`.
- Канонические заголовки, совместимые псевдонимы, нормализация и identity: `app.js`.
- Пользовательская терминология и справка: `product-catalog.js`, `README.md`.
- Архитектурное решение: `docs/decisions/ADR-0021-sr-export-schema.md`.

## Feature 020

- Спецификация, общий guarded write-contract и задачи: `specs/020-huawei-te-family-port-closure/`.
- Exact-model capability TE30/TE40/TE50/TE60: `runtime/device-catalog.json`, `runtime/model-catalog.js`, `app.js`.
- Общая read/write/re-read реализация с firmware/schema gates: `mvp_runtime/adapters/huawei_te40.py`, `mvp_runtime/polling.py`.
- Архитектурное решение и provisional live-validation boundary: `docs/decisions/ADR-0020-huawei-te-family-port-closure.md`.

## Feature 019

- Спецификация, plan v3, management-action contract и задачи: `specs/019-close-insecure-ports/`.
- Opt-in checkbox и capability projection: `app.js`, `product-catalog.js`, `runtime/device-catalog.json`.
- Guarded TE40 read/write/re-read verification по значениям меню кодека: `mvp_runtime/adapters/huawei_te40.py`, `mvp_runtime/polling.py`, `mvp_runtime/server.py`.
- Архитектурное решение и критерий успеха по значениям меню кодека: `docs/decisions/ADR-0019-huawei-te40-close-ports.md`.

## Feature 018

- Спецификация, план, общий контракт и задачи: `specs/018-huawei-te-family/`.
- Общий guarded transport Huawei TE30/TE40/TE50/TE60: `mvp_runtime/adapters/huawei_te40.py`, `mvp_runtime/polling.py`.
- Exact-model routing: `runtime/device-catalog.json`, `runtime/model-catalog.js`, `app.js`.
- Архитектурное решение: `docs/decisions/ADR-0018-huawei-te-family.md`.

## Feature 017

- Спецификация, план, контракт и задачи: `specs/017-polling-target-domain/`.
- Exact current-SR IP selector, карточка цели и доменный каскад: `app.js`, `styles.css`.
- Пользовательская справка: `product-catalog.js`.
- Архитектурное решение: `docs/decisions/ADR-0017-polling-target-domain.md`.

## Feature 016

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
- Ручной ввод учётных данных, проверка и redaction: `app.js`, `mvp_runtime/server.py`, `mvp_runtime/credentials.py`, `mvp_runtime/redaction.py`; прежний XLSX parser сохранён для совместимости.
- План, exact-IP allowlist, job и ACK: `mvp_runtime/polling.py`, `mvp_runtime/polling_job.py`.
- Подтверждённый Extron adapter: `mvp_runtime/adapters/extron.py`.
- Общий Huawei TE30/TE40/TE50/TE60 adapter: `mvp_runtime/adapters/huawei_te40.py`.
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
- Подтверждены локальный динамический HTTPS web contract Extron controller/panel, отдельный exact TLS 1.1 web-CGI contract Huawei TE20, общий guarded HTTPS web-CGI contract Huawei TE30/TE40/TE50/TE60, три отдельных HTTPS contract Huawei Bar 310/Box 310/Box 610 и read-only HTTPS web contract Polycom RealPresence Group 310/500/700. Обычный `/v1`-опрос Huawei 310 подтверждён эксплуатацией; отдельная opt-in HTTP-only задача Huawei Box 310/610 пока provisional. Polycom Group 300 маршрутизируется на отдельный exact-model provisional-контракт до пользовательской проверки; HDX и остальные неподтверждённые модели остаются `protocol_required`.
- Opt-in write-задача отключения HTTP/Telnet разрешена для exact TE20/TE30/TE40/TE50/TE60 и Bar 310 и использует отдельный сеансовый XLSX-список целей структуры SR; основная SR для неё не используется. Bar 310 изменяет только `enable_http=0`, а неподдерживаемый firmware-параметр Telnet не записывает и показывает `not_exposed`. Реальная write-проверка выполнена на TE20 и TE40, а TE30/TE50/TE60 ожидают контролируемой проверки пользователя. Достаточно подтверждённо изменить значения в меню кодека; TCP listener не влияет на статус отчёта.
- Модули/Справочник меняются через `product-catalog.js`; device manifests — через `runtime/device-catalog.json`.

## История

- Feature 013 и ADR-0013 документируют заменённый Node/PowerShell loopback runtime.
- Feature 011–012 документируют происхождение Extron contract и plan v2.
- Feature 008–010 описывают ручную общую папку, производительность импорта и единое оборудование.
- Исторические runtime-файлы Node/PowerShell удалены после Python parity; ссылки на них в старых ADR/specs являются историческими, не рабочими инструкциями.
