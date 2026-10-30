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
- Constitution: версия 4.0.0 в `.specify/memory/constitution.md`.
- Текущая feature: `specs/033-device-settings-audit/`.

## Правила работы агента

- Сначала прочитать этот файл и использовать `docs/context-map.md`.
- Не загружать весь репозиторий без необходимости и не менять несвязанные файлы.
- Не выдумывать vendor API, команды, transport или схемы ответов; неизвестное отмечать `TBD`/`protocol_required`.
- Для Extron controller/panel разрешён только подтверждённый контракт `mvp_runtime/adapters/extron.py`: HTTPS/443, dynamic URI из текущего bundle и exact resource URL.
- Для exact Huawei TE20 разрешён отдельный transport `huawei_te20_web_cgi_v1` в `mvp_runtime/adapters/huawei_te40.py`: HTTPS/443, точный TLS 1.1 только для этой модели, подтверждённая legacy pre-auth схема, проверка exact TE20 сразу после входа и фиксированный action allowlist. Для точных Huawei TE30/TE40/TE50/TE60 разрешён общий guarded transport `huawei_te_web_cgi_v1` с проверкой модели до credentials и после входа. Все пять моделей подтверждены контролируемыми опросами реальных устройств. Дополнительное read-only чтение Site Name выполняется только после post-auth проверки модели/идентичности: при двух mailbox action-маркерах принимается только `state.sitename`; для exact TE20, когда mailbox-подписка отсутствует, контролируемым опросом подтверждён fallback `WEB_GetCfgParamAPI` с единственным `CfgIDString=["sitename"]` и строгой строковой схемой. Отсутствие подтверждённого метода или ответа сохраняет `protocol_required`/`unavailable`. Для иных моделей fallback не переносится.
- Для exact Huawei Bar 310, Box 310 и Box 610 разрешены три отдельных подтверждённых transport: `huawei_bar310_rest_v1`, `huawei_box310_rest_v1`, `huawei_box610_rest_v1`. Все три используют общий guarded core в `mvp_runtime/adapters/huawei_bar310.py`: HTTPS/443, exact pre-auth model и bundle markers, session/account с `X-Access-Token`, фиксированные GET-only version/specification/time/license/status ресурсы и post-auth модель плюс SN/ESN либо MAC. Обычный опрос всех трёх подтверждён пользовательской эксплуатацией и остаётся read-only; дополнительный Site Name использует только документированные POST mailbox read-actions, если оба action-маркера есть в текущем bundle, после exact post-auth identity, без настройки устройства или иных ресурсов. Live-проверка Site Name для 310-моделей ожидается. Явная задача для точных Bar 310, Box 310 и Box 610 меняет только HTTP: текущие management bundle markers, чтение `enable_http` в `{0,1}`, максимум один `enable_http=0` PUT и post-read `0`; значение Box подтверждено администратором, реальная write-проверка Box 310/610 ещё ожидается и `validationStatus` остаётся `provisional_user_validation`. К настройке Telnet запросов нет; `not_exposed` означает отсутствие web-управления, а не доказанно закрытый TCP/23. Любой marker/schema/model/identity drift блокирует запись; варианты Box с суффиксами и другие Bar/Box остаются `protocol_required`.
- Для exact Huawei CloudLink Bar 300, Box 300 и Box 600 разрешены три отдельных read-only transport через `mvp_runtime/adapters/huawei_300.py`: HTTPS/443, текущий legacy CGI bundle и exact numeric pre-auth model до credentials, post-auth exact модель плюс serial/MAC, шесть фиксированных ресурсов и точный `WEB_GetCfgParamAPI` read только `CfgIDString=["sitename"]`. Bar 300 проверен контролируемым опросом; администратор подтвердил успешные отчёты Box 300 и Box 600 и совпадение их `siteName.value` с меню устройства. Для каждой Box-модели сохраняются отдельные gates и статус `confirmed_user_validation`. Никакой management write, HTTP fallback или перенос REST-контракта 310 не разрешены; суффиксные варианты остаются `protocol_required`.
- Для exact Polycom RealPresence Group 310/300/500/700 разрешены четыре отдельных read-only transport через `mvp_runtime/adapters/polycom_group.py`: HTTPS/443, проверка текущих Polycom login/main bundle markers, сеансовый `/rest/session`, exact post-auth модель плюс serial либо MAC, фиксированные чтения `/rest/system`, `/rest/system/status`, `/rest/system/time`, `/rest/system/uptime` и только один MAC-параметр через read-form `/rest/config`. Group 310 проверен контролируемым и эксплуатационным опросом; администратор отдельно подтвердил успешные опросы Group 500 и 700. Group 310/500/700 имеют `confirmed_user_validation`; Group 300 сохраняет `provisional_user_validation` до отдельной реальной проверки. Причина более раннего `target_model_mismatch` на одном запуске Group 500 не установлена; exact model gate сохраняется. Pre-auth exact модель на проверенной прошивке недоступна (неавторизованный `/rest/system` даёт 403), поэтому credentials отправляются только по явно выбранному IP после Polycom bundle gate и с TLS-проверкой по умолчанию; самоподписанный сертификат требует явного разрешения текущего запуска. Никакого HTTP/Telnet/SSH fallback и изменения настроек; HDX и суффиксные Group-варианты остаются `protocol_required`.
- Для Group 300 версия 4.1.5-180072 дала `validation/transport_error` при HTTPS-опросе, хотя администратор открыл web-интерфейс по HTTP. По документации Poly TLS 1.2 для web-сервера появился в 5.0. Версия 5.0+ зафиксирована только как нижняя граница кандидатов для контролируемой проверки текущего HTTPS-контракта, а не как подтверждённая совместимость опроса; Group 300 остаётся `provisional_user_validation`. HTTP fallback с учётными данными запрещён.
- Таблица Site name в категории Терминалы ВКС использует текущие фильтры инвентаря и только самый новый результат опроса каждого устройства. Значение принимается из подтверждённого `siteName.value` либо `webBlocks.Device Info.Site Name`; если новый результат неуспешен или поле недоступно, старое значение не подставляется. XLSX создаётся локально через vendored SheetJS, семь текстовых столбцов совпадают с экраном, формулы из данных не исполняются. Не использовать внешние сервисы для экспорта.
- Администратор подтвердил семантическое правило только для exact Polycom RealPresence Group 300/310/500/700: `System Name` приравнивается к `Site name`. После post-auth exact model/identity gate текущий опрос добавляет `siteName.value` с `source=polycom_system_name` без нового сетевого чтения; при отсутствии System Name сохраняет `unavailable`. Таблица может извлекать System Name из ранее импортированного успешного JSON только при совпадении точной модели SR и модели в файле. Для HDX, иных Polycom и других производителей это правило запрещено; raw JSON не менять.
- Write-задача `disable_insecure_management_services` ограничена exact Huawei TE20/TE30/TE40/TE50/TE60/Bar 310/Box 310/Box 610, plan schema v3 и явным opt-in. Для TE20 безопасны только `enabletelnet=0` и `enable_http=0`, для TE30/TE40/TE50/TE60 — `enabletelnet=0` и `enable_http=1`; для точных 310-моделей — только `enable_http=0`, без чтения/записи Telnet. Успех определяется повторным чтением модельного значения; TCP listener не входит в критерий. Реальная write-проверка подтверждена для TE20 и TE40; TE30/TE50/TE60 и Box 310/610 сохраняют provisional-статус до контролируемой проверки пользователя, а model/identity/firmware/schema drift блокирует запись.
- Отдельные write-задачи `set_te20_auto_answer_automatic` и `set_te20_auto_answer_manual` допускаются только для одного exact Huawei TE20, выбранного по IP из подтверждённой SR, и не совмещаются с другими write-задачами. После post-auth model/identity и bundle gates читается `autoreply` в `{0,1}`, при необходимости отправляется ровно один `autoreply=0` или `autoreply=1` и подтверждается точный post-read. Оба направления проверены контролируемой записью на реальном TE20, автоматический режим дополнительно подтверждён администратором в web-меню. Обычный опрос не меняет Answer mode; другие коды и модели остаются `protocol_required` для записи.
- Новый adapter регистрировать через `mvp_runtime/polling.py` и `runtime/device-catalog.json` только после evidence review, описанного в `docs/development-workflow.md`.
- Не изменять raw SR/JSON и внутренние enum-коды ради локализации; русские подписи брать из централизованного presentation dictionary в `app.js`.
- Термины SR, GCPlus и перезагрузок не трактовать без подтверждения; использовать «Требует уточнения» и «В разработке».
- Доступные модули, их названия, справочные описания, пользовательские статусы и подсказки изменять через `product-catalog.js`; после правки обязательно запускать `node scripts/validate-reference.js`.
- Не добавлять новый доступный маршрут в обход `MODULE_CATALOG` и не дублировать модульные карточки вручную в `app.js`.
- Никогда не помещать реальные логины, пароли, токены, ключи, IP-выгрузки или runtime data в Git, fixtures, логи, state, аналитику и ответы API.
- Учётные данные вводятся пользователем в форме текущей вкладки и передаются только в same-origin loopback runtime. После передачи поля очищаются; пары нельзя помещать в state, plan, browser storage или постоянное хранилище.
- Runtime сверяет SHA-256 переданных пар, очищает пул во всех terminal paths и выдаёт redacted JSON по одному до ACK записи. Vault и fallback credentials запрещены.
- Доступ к плану на каждом ПК настраивается при первом запуске: локальный scrypt-verifier хранится только в профиле текущего пользователя Windows вне Git, открытый пароль не сохраняется. Python runtime проверяет вход до любого `/api/polling/*`; браузерное скрытие формы не считается границей защиты. Пароли оборудования по-прежнему только в памяти задания.
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
