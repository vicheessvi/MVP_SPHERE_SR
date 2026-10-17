# AGENTS.md

## Статус проекта

Проект подготовлен к дальнейшему редактированию через ИИ-агента и GitHub SpecKit.

- Видение: `docs/project-vision.md`.
- Интерфейс: Windows, HTML5, CSS3, Vanilla JavaScript, browser File/System Access API, vendored SheetJS CE 0.20.3.
- Production runtime автоматического опроса: установленный Python 3.11+ и только стандартная библиотека; `START_MVP_SPHERE_SR.py` открывает авторизованную loopback-сессию.
- Node.js используется только при разработке для JavaScript regression/reference checks и не требуется пользователю.
- Прямой `file://index.html` — ручной импорт и аналитика без сетевого опроса.
- Хранение: только память вкладки/runtime; выбранные готовые JSON пишутся только в указанную пользователем папку; `localStorage`/`IndexedDB` не используются.
- Роль: только «Администратор МЦТП».
- Constitution: версия 3.2.0 в `.specify/memory/constitution.md`.
- Текущая feature: `specs/028-huawei-310-http-only/`.

## Правила работы агента

- Сначала прочитать этот файл и использовать `docs/context-map.md`.
- Не загружать весь репозиторий без необходимости и не менять несвязанные файлы.
- Не выдумывать vendor API, команды, transport или схемы ответов; неизвестное отмечать `TBD`/`protocol_required`.
- Для Extron controller/panel разрешён только подтверждённый контракт `mvp_runtime/adapters/extron.py`: HTTPS/443, dynamic URI из текущего bundle и exact resource URL.
- Для exact Huawei TE20 разрешён отдельный transport `huawei_te20_web_cgi_v1` в `mvp_runtime/adapters/huawei_te40.py`: HTTPS/443, точный TLS 1.1 только для этой модели, подтверждённая legacy pre-auth схема, проверка exact TE20 сразу после входа и фиксированный action allowlist. Для точных Huawei TE30/TE40/TE50/TE60 разрешён общий guarded transport `huawei_te_web_cgi_v1` с проверкой модели до credentials и после входа. Все пять моделей подтверждены контролируемыми опросами реальных устройств. Другие Huawei модели остаются `protocol_required`.
- Для exact Huawei Bar 310, Box 310 и Box 610 разрешены три отдельных подтверждённых transport: `huawei_bar310_rest_v1`, `huawei_box310_rest_v1`, `huawei_box610_rest_v1`. Все три используют общий guarded core в `mvp_runtime/adapters/huawei_bar310.py`: HTTPS/443, exact pre-auth model и bundle markers, session/account с `X-Access-Token`, фиксированные GET-only version/specification/time/license/status ресурсы и post-auth модель плюс SN/ESN либо MAC. Обычный опрос всех трёх подтверждён пользовательской эксплуатацией и остаётся read-only. Явная задача для точных Bar 310, Box 310 и Box 610 меняет только HTTP: текущие management bundle markers, чтение `enable_http` в `{0,1}`, максимум один `enable_http=0` PUT и post-read `0`; значение Box подтверждено администратором, реальная write-проверка Box 310/610 ещё ожидается и `validationStatus` остаётся `provisional_user_validation`. К настройке Telnet запросов нет; `not_exposed` означает отсутствие web-управления, а не доказанно закрытый TCP/23. Любой marker/schema/model/identity drift блокирует запись; варианты Box с суффиксами и другие Bar/Box остаются `protocol_required`.
- Write-задача `disable_insecure_management_services` ограничена exact Huawei TE20/TE30/TE40/TE50/TE60/Bar 310/Box 310/Box 610, plan schema v3 и явным opt-in. Для TE20 безопасны только `enabletelnet=0` и `enable_http=0`, для TE30/TE40/TE50/TE60 — `enabletelnet=0` и `enable_http=1`; для точных 310-моделей — только `enable_http=0`, без чтения/записи Telnet. Успех определяется повторным чтением модельного значения; TCP listener не входит в критерий. Реальная write-проверка подтверждена для TE20 и TE40; TE30/TE50/TE60 и Box 310/610 сохраняют provisional-статус до контролируемой проверки пользователя, а model/identity/firmware/schema drift блокирует запись.
- Новый adapter регистрировать через `mvp_runtime/polling.py` и `runtime/device-catalog.json` только после evidence review, описанного в `docs/development-workflow.md`.
- Не изменять raw SR/JSON и внутренние enum-коды ради локализации; русские подписи брать из централизованного presentation dictionary в `app.js`.
- Термины SR, GCPlus и перезагрузок не трактовать без подтверждения; использовать «Требует уточнения» и «В разработке».
- Доступные модули, их названия, справочные описания, пользовательские статусы и подсказки изменять через `product-catalog.js`; после правки обязательно запускать `node scripts/validate-reference.js`.
- Не добавлять новый доступный маршрут в обход `MODULE_CATALOG` и не дублировать модульные карточки вручную в `app.js`.
- Никогда не помещать реальные логины, пароли, токены, ключи, IP-выгрузки или runtime data в Git, fixtures, логи, state, аналитику и ответы API.
- Учётные данные вводятся пользователем в форме текущей вкладки и передаются только в same-origin loopback runtime. После передачи поля очищаются; пары нельзя помещать в state, plan, browser storage или постоянное хранилище.
- Runtime сверяет SHA-256 переданных пар, очищает пул во всех terminal paths и выдаёт redacted JSON по одному до ACK записи. Vault и fallback credentials запрещены.
- Не добавлять внешнюю передачу, CDN, телеметрию, third-party Python dependency или non-loopback bind без явного решения пользователя и security review.
- Не делать commit/push без явного указания пользователя.
- Значимые решения фиксировать в `docs/decisions`, этапы — в `docs/implementation-log.md`.
- При изменении архитектуры, workflow или поведения обновлять документацию и тесты.

## Workflow

Подробности находятся в `docs/development-workflow.md`.

- Full SpecKit — крупные, рискованные или неоднозначные задачи.
- SpecKit-lite — средние задачи.
- Короткий prompt — небольшие локальные правки.

## Проверки

- Python runtime/API/security: `python -m unittest discover -s python_tests -v`.
- Python syntax/import: `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`.
- Интерфейс и регрессия: `node tests.js`.
- Справочник: `node scripts/validate-reference.js`.
- Синтаксис изменённых `.js`: `node --check`.
- Secret/artifact/IP scan обязателен перед commit.
- Acceptance: `START_MVP_SPHERE_SR.py` проверяет полный автоматический workflow; прямой `index.html` — ручной пакетный импорт, сеансовую аналитику и блокировку сети.
