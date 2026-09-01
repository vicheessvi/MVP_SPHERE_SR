# Архитектура

## Feature 013: автоматический опрос внутри инструмента

- `START_MVP_SPHERE_SR.cmd` является пользовательской точкой входа двойным щелчком и переносимо вызывает `start.ps1` из каталога проекта; `start.ps1` запускает `server.js` на случайном loopback-порту и открывает одноразовую HttpOnly/CSRF session.
- `app.js` передаёт выбранный XLSX только same-origin runtime, автоматически отправляет plan v2 после формирования и показывает progress/cancel.
- `runtime/polling-job.js` ограничивает session одним job, выполняет schedule и runner, выдаёт один redacted JSON и ждёт ACK browser-записи до interval.
- Browser File System Access handle живёт только в памяти вкладки. В выбранном корне создаётся уникальная `YYYY-MM-DD_HH-mm-ss`; ручной importer читает те же JSON без преобразования.
- Extron остаётся HTTPS-only. Self-signed bypass задаётся явно для job и передаётся adapter как `rejectUnauthorized: false` только этим запросам; HTTP и глобальная TLS-настройка не используются.
- Terminal job всегда очищает credential pool. Plan/status/result/logs/persistent storage не содержат credentials, cookie или Authorization.
- Direct `file://index.html` остаётся ручным сеансовым режимом и блокирует автоматический сетевой запуск.

## Feature 012: Загрузка и План автоматического опроса

- `app.js` строит каскад `Тип оборудования → Производитель → Модель` только из актуальной SR, показывает точные total/supported/unsupported и экспортирует plan schema v2 со стабильным порядком.
- Полный успех SR зависит от `rejectedCount = 0`; диагностические inventory issues больше не превращают успешный импорт в «частичный».
- `runtime/credential-pool.js` проверяет первую таблицу XLSX `Логин | Пароль`, изолирует неполные строки и точные дубли. UI держит пары только в замкнутой памяти вкладки и выводит безопасные счётчики.
- Новый CLI-run требует этот же XLSX и явный output root, сверяет SHA-256 файла из plan до сети, создаёт общий in-memory pool и не использует historical DPAPI vault как fallback.
- `runtime/polling.js` не выполняет сеть для unsupported, сохраняет детерминированный последовательный порядок, ждёт интервал только после callback успешной записи и поддерживает AbortSignal.
- `scripts/poll-devices.js` атомарно сохраняет каждый JSON немедленно; save failure пытается создать локальную recovery-копию и останавливает batch до следующего устройства.
- Ручной CLI сохранён для диагностики и совместимости; основной автоматический workflow заменён Feature 013.

## Feature 011: локальный web-опрос Extron (историческая основа)

Правила credentials и последовательного выполнения ниже частично заменены ADR-0012; актуальный workflow описан в разделе Feature 012.

- `runtime/extron-web-poller.js` реализует один contract-based adapter для контроллеров и панелей управления Extron: login, in-memory `NortxeSession`, чтение `/www/main.js`, динамическое обнаружение resource URI и exact `/api/swis/resource<uri>` без query.
- Поддержка не ограничена названиями моделей. Любая модель с подтверждённым bundle/resource contract использует adapter; неизвестный контракт завершается fail-closed без vendor-команд по догадке.
- `runtime/polling.js` сохраняет explicit IPv4 allowlist и dispatch только для `controller/extron` и `panel/extron` после ping.
- `CredentialVault` принимает exact IP или scope `category+manufacturer(+model)`. Resolver использует приоритет IP → модель → тип/производитель; duplicate scope блокируется.
- `scripts/poll-devices.js` читает первую таблицу XLSX/XLS через локальный vendored SheetJS без выполнения формул и импортирует записи непосредственно в Windows DPAPI vault. Browser credential import не добавлен.
- Default results: `%LOCALAPPDATA%\MVP_SPHERE_SR\poll-results\YYYY-MM-DD_HH-mm-ss\<IP>.json`; каждый файл пишется атомарно и проходит redaction.
- `poll-extron.ps1` использует существующий проверенный Node bootstrap. UI формирует и скачивает безопасный plan JSON из актуальной SR, но не запускает Node и не выполняет сеть.
- Ручной выбор общей папки опросов в `index.html` сохранён. Автоматизированный опрос лишь создаёт файлы для того же importer.

## Feature 010: единое оборудование и масштабируемый SR

- `product-catalog.js` хранит семь category descriptors, вложенные routes, русские presentation terms и allowlist значимых analyzed parameters.
- Все дочерние категории используют один inventory renderer и общие selectors; Dashboard агрегирует category IDs одним проходом.
- Время run берётся из имени папки, а время результата — только из `File.lastModified`; при отсутствии evidence хранится `null/unavailable`.
- SR import строит неперсистентные location/identity indexes, обрабатывает строки batches и yield-ит browser event loop.
- Polling raw history сохраняется полностью, но DeviceChange строится только по утверждённым rules.
- Все SR-строки участвуют в inventory: при отсутствии inventory/serial/MAC/IP применяется локальная fallback identity, а не отбрасывание строки. Внутри одной актуальной SR совпавший identity-кандидат переиспользуется только для точного повтора нормализованной строки; конфликт сохраняет отдельное устройство и `identity_collision`. Эфемерный fingerprint-index сохраняет O(1) lookup без возврата к O(N²).
- Controller-rule имеет явный приоритет и использует только точное `Тип оборудования = controller`; остальные категории используют точные значения `Тип модели`. Карточки и таблицы по умолчанию ограничены актуальной SR.
- Polling matching строит `currentInventoryByIp` только из актуальных `ipNormalized` и отдельный `historicalInventoryByIp` только для диагностики. `ipHistory` никогда не назначает `deviceId` новому результату.
- После current-IP lookup подтверждённые `$.ip` и `$.webBlocks['LAN Settings']['IP Address']` проверяются на согласованность с именем файла; надёжный конфликт категории также блокирует привязку. Raw result и issue сохраняются без влияния на device history, latest state и Dashboard equipment metrics.
- Статус Extron authorization подтверждается exact `error = No credentials were accepted` для однозначно связанного устройства Extron любой категории.

## Текущий статус

Поддерживаются два локальных режима с одним интерфейсом: `START_MVP_SPHERE_SR.cmd` для автоматического опроса и direct `index.html` для ручного анализа. Launcher вызывает внутренний `start.ps1`; пользователю не требуется вводить PowerShell-команду. Оба режима используют непостоянный memory state без `localStorage`/`IndexedDB`; только loopback-mode получает сетевые полномочия. Решение описано в ADR-0013.

## Компоненты

- `runtime-config.js` подтверждает статический `file://` manual-mode; `server.js` выдаёт динамический marker/CSRF для loopback-mode.
- `app.js` всегда использует непостоянный memory adapter, содержит state v3, импорт SR/дерева результатов, чистую Dashboard-проекцию, аналитику и UI единственной роли.
- `groupPollingFilesByRunFolder` рекурсивно группирует выбранные JSON по ближайшей папке `YYYY-MM-DD_HH-MM-SS`; legacy `ingestPollingFolderTree` сохранён как эталон семантики.
- UI использует `processPollingImportBatches`: пакеты по 32 файла, bounded reading 2–6, cooperative yield, throttled progress и cancellation token. `createPollingImportContext` индексирует SR IP, дубликаты, запуски, историю и соседние change-пары; поздняя запись пересчитывает не более двух пар.
- `app.js` содержит безопасные форматтеры внутренних кодов, объединяет генерируемые и явные разделы Справочника и выполняет чистый локальный поиск.
- `product-catalog.js` является единым browser/CommonJS-источником модулей, presentation dictionary и генерируемых карточек модулей/статусов; `app.js` потребляет его проекции.
- `runtime/model-catalog.js` маршрутизирует переданные производители/модели.
- `runtime/polling.js` проверяет explicit allowlist, выполняет bounded ping, dispatch-ит подтверждённый Extron adapter и fail-closed останавливается для остальных протоколов.
- `runtime/credential-pool.js` — общий browser/CommonJS parser XLSX-пула без сериализации секретов.
- `runtime/polling-job.js` — ephemeral job lifecycle, progress, cancellation и pending-result ACK/backpressure.
- `server.js` — authenticated same-origin loopback API credentials/jobs/status/result/ACK/cancel.
- `scripts/poll-devices.js` — CLI, использующий только текущий XLSX-пул в памяти и формирующий безопасные per-IP результаты.
- `runtime/extron-web-poller.js` — изолированный HTTPS adapter с injectable transport для synthetic contract/security tests.
- `vendor/xlsx.full.min.js` — локально vendored SheetJS без CDN.

## Security boundary

```text
START_MVP_SPHERE_SR.cmd -> start.ps1 -> server.js (127.0.0.1, random port)
                     |
                     +-- one-time launch token -> HttpOnly session + CSRF
                     +-- XLSX -> in-memory credential pool -> cleared terminally
                     +-- immutable plan IP allowlist -> ping -> Extron HTTPS/443
                     +-- redacted result -> browser pending result
                                              |
                                              +-- selected folder/YYYY-MM-DD_HH-mm-ss/IP.json
                                              +-- ACK write -> interval -> next device

index.html (file://) -> in-memory manual import/analytics only; no polling API
```

Loopback UI и direct-file UI загружают только локальные assets. Browser state, folder handle и поисковые значения уничтожаются при reload/close. Runtime принимает только exact Host `127.0.0.1|localhost` текущего порта; mutation дополнительно требует same-origin и CSRF.

## Данные

State schema v3 мигрирует v1/v2 и оставляет единственного пользователя `administrator`. Новый state создаётся в памяти каждой страницы. Искусственного лимита приложения нет; фактическая граница — доступная память браузера.

## UI

Пользовательский слой русифицирован отдельно от форматов данных: raw SR/JSON, внутренние enum-коды и API-контракты не переписываются. Перед выводом категории, статусы запуска, опроса, ping и поддерживаемости проходят через централизованные форматтеры. Неизвестный код отображается безопасной русской подписью без выдачи технического значения.

Маршрут «Справочник» объединяет каталоговые проекции с явными смысловыми материалами, не сохраняет поисковые запросы и не обращается к сети. Контекстные кнопки «О модуле» используют стабильные идентификаторы `HELP_TOPIC_BY_ROUTE`; подсказки показателей используют общий источник `UI_TERMS.tooltips`.

Во время массового импорта Dashboard и тяжёлые аналитические selectors не вызываются. Progress snapshot не содержит raw JSON и отрисовывается не чаще одного раза в 100 мс. В обоих режимах канонический state изменяется атомарно в памяти страницы; полная сериализация всего growing state не находится в import hot path.

Модульная часть `HELP_SECTIONS`, навигация, `HELP_TOPIC_BY_ROUTE` и конфигурация трёх inventory-маршрутов теперь вычисляются из `MODULE_CATALOG`. Статусные карточки вычисляются из `STATUS_DESCRIPTORS` и `UI_TERMS`. Явные смысловые определения остаются ручными: автоматическая проверка требует метаданные, но не выдумывает смысл нового кода.

Рабочие маршруты: «Главный экран», «Терминалы ВКС», «Контроллеры», «Панели управления», «Загрузка», «Локальное хранилище», «Справочник». Legacy-модули аудита остались только как совместимая внутренняя предметная логика и fixtures; маршруты и навигация «Проекты аудита», «События», «Сопоставления», «Снимки» отсутствуют.

### Dashboard projection

`getDashboardSummary(state, filters, options)` — чистый селектор между persisted state и представлением. Он:

- выбирает детерминированный последний результат каждого устройства по `capturedAt` и `id`;
- вычисляет взаимоисключающий текущий polling-статус и не смешивает его с метриками выбранного периода;
- применяет единый scope категории, производителя, модели, локации, VIP и статуса;
- возвращает инвентарь, coverage, health, проблемы, VIP/локации, события, распределения и drill-down параметры;
- оставляет недоказанные authorization/reboot/GCPlus/freshness метрики равными `null`.

UI только форматирует эту проекцию. Переход из KPI передаёт фильтры в существующие списки VCS/Controllers/Panels; данные повторно не агрегируются в обработчиках представления. Презентационные списки ограничены, тогда как числовые итоги считаются по полному scope.

## Polling boundary

Любой target должен быть валидным unicast IPv4 и присутствовать в явном плане. Для Extron controller/panel подтверждён HTTPS web contract с динамическими resource URI; cookie и credentials живут только в памяти polling-процесса, а результат не содержит Authorization/cookie/password. Self-signed TLS допускается только явным флагом для plan targets. Другие vendor transports остаются `protocol_required` и не получают credentials.

## Ограничения защиты

Сеансовая модель не защищает от компрометации текущего Windows-профиля, администратора ОС, malware в пользовательской сессии или чтения памяти процесса. Исходные файлы остаются под контролем пользователя и не изменяются приложением.
