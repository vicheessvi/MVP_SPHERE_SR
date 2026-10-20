# Архитектура

## Актуальная среда выполнения

MVP_SPHERE_SR имеет один интерфейс и два явно разделённых локальных режима:

- `START_MVP_SPHERE_SR.py` — полный режим автоматического опроса на установленном Python 3.11+;
- `index.html` через `file://` — ручной импорт SR/JSON и аналитика без сетевых полномочий.

Python-runtime использует только стандартную библиотеку. Node.js не входит в production path и остаётся инструментом проверки JavaScript при разработке.

```text
START_MVP_SPHERE_SR.py
        |
        +-- Python ThreadingHTTPServer (127.0.0.1, random port)
        |       +-- one-time token -> HttpOnly session + CSRF
        |       +-- ручной ввод пар -> bounded validator -> in-memory credential pool
        |       +-- plan v3 -> immutable exact-IP allowlist + explicit management tasks
        |       +-- ping -> confirmed Python adapter -> redacted result
        |       +-- pending result <-> browser save ACK
        |
        +-- browser UI -> selected folder/YYYY-MM-DD_HH-mm-ss/IP.json

index.html (file://) -> volatile browser state -> manual import/analytics only
```

## Python-компоненты

- `mvp_runtime/launcher.py` проверяет Python 3.11+ и обязательные ресурсы, создаёт случайный loopback-порт и открывает одноразовый URL.
- `mvp_runtime/server.py` обслуживает только точный allowlist локальных файлов и API credentials/jobs/status/result/ACK/cancel. Generic directory serving и `/api/storage/*` отсутствуют.
- `mvp_runtime/credentials.py` ограниченно читает первую таблицу XLSX через ZIP/XML, отвергает macros/external links/unsafe XML и не вычисляет формулы.
- `mvp_runtime/catalog.py` читает общий `runtime/device-catalog.json` и fail-closed определяет manifest.
- `mvp_runtime/polling.py` нормализует unicast IPv4, создаёт allowlist ровно из плана, выполняет последовательный ping/dispatch/interval и содержит additive adapter registry.
- `mvp_runtime/polling_job.py` управляет schedule, отменой, counters и одним pending result; следующий шаг невозможен до ACK.
- `mvp_runtime/adapters/extron.py` реализует только подтверждённый Extron HTTPS dynamic-resource contract.
- `mvp_runtime/adapters/huawei_te40.py` реализует отдельный Huawei TE20 contract с exact TLS 1.1 и legacy pre-auth fingerprint, а также общий guarded Huawei TE30/TE40/TE50/TE60 HTTPS web-CGI contract. После входа каждый transport требует exact-модель и serial либо MAC перед успешным результатом. Opt-in write-задача доступна всем пяти exact-моделям, но TE20 сохраняет собственный transport.
- `mvp_runtime/adapters/huawei_300.py` использует отдельный HTTPS/443 legacy web-CGI contract для точных Bar 300, Box 300 и Box 600. Общий core требует актуальные bundle markers и модельный pre-auth код до credentials, затем exact post-auth модель плюс serial/MAC. Разрешены только шесть фиксированных read-only ресурсов и точный запрос `sitename`; никакие задачи управления устройством не подключены. Bar 300 проверен на устройстве, Box 300/600 пока provisional и отказывают при дрейфе схемы.
- `mvp_runtime/adapters/huawei_bar310.py` содержит общий guarded HTTPS core нового web API и подтверждённый public contract exact Bar 310; `huawei_box310.py` и `huawei_box610.py` предоставляют два отдельных подтверждённых контракта обычного read-only опроса exact Box 310 и Box 610. Каждый wrapper задаёт собственные aliases, contract ID и ожидаемую модель, а core проверяет модель и bundle markers до credentials, использует ephemeral cookie/`X-Access-Token`, читает фиксированные version/specification/time/license/status ресурсы и требует post-auth модель плюс устойчивую identity. При явном management opt-in три точные 310-модели дополнительно проверяют текущие HTTP config markers, читают `enable_http` в `{0,1}`, при необходимости отправляют один минимальный `enable_http=0` PUT и подтверждают post-read `0`; к настройке Telnet запросов нет. Box action использует подтверждённое администратором целевое значение, но остаётся `provisional_user_validation` до реальной проверки каждой Box-модели.
- `mvp_runtime/adapters/huawei_site_name.py` изолирует дополнительное чтение Site Name для точных Huawei TE20/30/40/50/60 и Bar/Box 310/610: только после post-auth проверки модели и identity, при наличии двух точных mailbox action-маркеров текущего bundle, через сеансовые POST подписки/чтения без записи настройки. Из ответа принимается только строковое `state.sitename`; иначе поле имеет явный неизвестный статус. Основные ресурсы и write-контракты не изменяются, live-проверка TE20/310 ещё ожидается.
- `mvp_runtime/redaction.py` рекурсивно запрещает secrets в plan и удаляет Authorization/cookie/credential material из результата.

## Browser-компоненты

- `runtime-config.js` подтверждает статический ручной режим; Python-server динамически отдаёт marker/CSRF для полного режима.
- `app.js` использует непостоянный memory adapter, загружает SR/дерево JSON, строит Dashboard/таблицы и сохраняет pending JSON через File System Access API.
- Форма ввода передаёт пары через same-origin JSON в Python-runtime; поля очищаются сразу после передачи, пары не попадают в UI state.
- `runtime/sphere.js` рисует локальный Canvas-элемент SR SPHERE в заголовке каждого доступного модуля; при системном уменьшении движения выводит статичный кадр. Никаких внешних ресурсов не требуется.
- `product-catalog.js` — единый browser/CommonJS-источник модулей, Справочника и русских presentation labels.
- `runtime/device-catalog.json` — единый межъязыковой источник производителей, моделей и protocol status.

## Security boundary

- Bind только `127.0.0.1`, случайный порт, exact Host `127.0.0.1|localhost`.
- Начальный token используется один раз; cookie — `HttpOnly; SameSite=Strict`; mutation требует exact Origin и CSRF.
- Статические пути и API заданы точным allowlist; traversal и неизвестные маршруты возвращают 404.
- Browser state, folder handle, credential pool, session и jobs не сериализуются. Единственное исключение для восстановления опроса — видимый несекретный `polling-recovery.json` в явно выбранной пользователем папке результатов; browser handle и учётные данные в нём отсутствуют. После перезапуска папка выбирается и пары вводятся заново.
- Ручной ввод ограничен 10 000 пар и размерами полей; legacy XLSX ограничен 10 MiB. Secret-bearing планы отвергаются рекурсивно.
- Network target должен быть точным допустимым IPv4 из текущего плана. Похожий, исторический или отличающийся последним октетом IP не разрешается.
- Extron, Huawei TE20/TE30/TE40/TE50/TE60, Bar 310, Box 310 и Box 610 используют HTTPS/443. Unverified TLS context создаётся только для текущего задания при явном согласии; HTTP fallback и глобальное отключение проверки отсутствуют. TE20 получает exact TLS 1.1 min/max и legacy cipher profile только внутри соединения этой модели; остальные Huawei используют системный TLS-профиль с локальным legacy-cipher разрешением только в unverified-сессии.
- Каждый результат проходит redaction до browser API. Runtime ожидает ACK записи, но отдельный отказ сохранения JSON фиксирует как событие и продолжает следующий опрос; при потере вкладки ограниченный таймаут останавливает задание и очищает секреты. Результаты и видимый recovery manifest сверяются по точному IP перед ручным продолжением, а неясный исход write-задачи не повторяется автоматически. Между устройствами выбирается новое целое число секунд из заданного включительного диапазона с исключением предыдущего значения в пределах одного запуска; после восстановления это новая последовательность. Диапазон 0–0 означает режим без пауз и допустим при любом числе устройств. Для трёх и более поддерживаемых устройств одно ненулевое значение отвергается до сети. Старые планы с фиксированным нулём работают без пауз, с фиксированным ненулевым интервалом — только при одном переходе.
- Terminal status очищает session credentials и внутреннюю копию задания.

## Данные и сопоставление

State schema v3 остаётся в памяти каждой страницы. Актуальный SR-контракт содержит 42 канонических столбца от `SmartRoom ID локации` до `802.1x`; прежние переименованные заголовки принимаются как входные псевдонимы. Нормализация читает каноническое имя первым, сохраняет исходную строку без изменения и проецирует новые поля только в локальное сеансовое состояние. `SmartRoom ID локации` и `SmartRoom ID оборудования` имеют приоритет как устойчивые идентификаторы, затем применяются прежние доказательные идентификаторы и безопасный fallback.

Все строки актуальной SR участвуют в inventory. Новый результат связывается только с текущим `IP адрес` актуальной SR; `ipHistory`, похожие имена и соседние адреса не назначают `deviceId`. Подтверждённый внутренний IP и категория проверяются до привязки. Конфликт сохраняется как отдельная диагностируемая запись.

План автоматического опроса имеет два взаимоисключающих способа выбора. В обычном read-only режиме адресный поиск и каскад `Домен → Класс оборудования → Производитель → Модель` используют актуальную SR. Для write-задачи закрытия HTTP/Telnet применяется отдельный XLSX структуры SR: он атомарно проверяется, существует только в памяти и не изменяет inventory/analytics; фильтры и точный IP в этом режиме работают только по отдельному списку. Строка поиска IP и raw XLSX rows не сохраняются. Plan v3 передаёт runtime только разрешённые `deviceIds` либо безопасную проекцию `devices[]`, тип/hash источника и явный список `managementTasks`; пустой список задач сохраняет read-only поведение, а старый schema v2 отклоняется.

Массовый импорт использует bounded parallel reading, cooperative yield, progress throttling и временные indexes. Dashboard и таблицы считают один актуальный inventory scope; отсутствие polling JSON не удаляет устройство. Модуль перезагрузок строит непостоянный индекс: правило `extron-reboot-v2` вычисляет boot timestamp каждого пригодного Extron-файла как `Device Status.Date − Device Status.Uptime`, объединяет одинаковые запуски с допуском пять секунд и не включает конфликтные данные.

## Расширение адаптеров

Новый transport добавляется только после evidence review: производитель/категория/модель в общем каталоге, подтверждённые endpoint и auth flow, TLS/port, bounded response schema, safe errors, synthetic tests и redaction tests. Подтверждённый Extron flow воспроизводит browser-compatible последовательность `/www/index.html` → `/api/login` → `/www/main.js` → exact dynamic resources. Huawei TE20 и семейство TE30/TE40/TE50/TE60 используют browser-compatible `WEB_GetLoginInfo` → `Web_RequestSessionID` → `Web_RequestCertificate` → `WEB_ChangeSessionID` и один allowlist из шести read-only actions. TE20 не сообщает текстовую модель до входа, поэтому до credentials проверяются exact target из плана, TLS 1.1, login bundle и числовая legacy pre-auth схема; сразу после входа обязательны exact TE20 и serial либо MAC. TE30–TE60 продолжают проверять модель до и после входа. Bar 310, Box 310 и Box 610 имеют три отдельных подтверждённых public contract обычного опроса поверх guarded `/v1` core: exact pre-auth model, полный marker set, session/account, `X-Access-Token`, session-change и пять GET-only ресурсов; после входа обязательны exact ожидаемая модель и SN/ESN либо MAC. Все три модели подтверждены эксплуатационными опросами и не получают fallback при несовпадении. Browser headers, cookie, токены и credentials остаются внутри adapter. Write-capability использует отдельный список целей и exact TE20/TE30/TE40/TE50/TE60/Bar 310/Box 310/Box 610. TE отправляют свои модельные HTTP/Telnet payloads; точные 310-модели отправляют только `enable_http=0`, подтверждают post-read и не запрашивают управление Telnet. Box write-path provisional до контролируемых реальных проверок.

## Ограничения

Приложение не защищает память от администратора ОС, malware или компрометации текущего Windows-профиля. Доступность автоматического режима зависит от установленного Python 3.11+ и разрешённого запуска `python.exe`. File System Access API требует совместимый Chromium-браузер.
