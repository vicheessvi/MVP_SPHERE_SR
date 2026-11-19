(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants and state schema
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = "mvpSphereSrState.v3";
  const LEGACY_STORAGE_KEY = "mvpSphereSrState.v2";
  const SESSION_KEY = "mvpSphereSrSession.v1";
  const BACKUP_SCHEMA = "mvp-sphere-sr-backup";
  const STATE_VERSION = 3;
  const DEFAULT_RETENTION_DAYS = 1095;
  const DEFAULT_MAX_STATE_BYTES = Number.MAX_SAFE_INTEGER;
  const DEFAULT_MAX_RAW_INPUT_BYTES = Number.MAX_SAFE_INTEGER;
  const DASHBOARD_LIST_LIMIT = 8;
  const DEFAULT_INVENTORY_FILTERS = Object.freeze({ current: "yes" });
  const VCS_SITE_NAME_HEADERS = Object.freeze(["Наименование устройства", "Site name", "IP", "MAC", "Адрес", "Наименование локации", "Домен"]);

  const COMMON_ACTIONS = Object.freeze([
    "view",
    "import_snapshot",
    "map_project",
    "resolve_match",
    "assign_baseline",
    "review_event",
    "export_backup",
    "view_settings"
  ]);
  const ADMIN_ACTIONS = Object.freeze(["manage_users", "configure_retention", "reset_state"]);

  const STATE_ARRAY_KEYS = Object.freeze([
    "users",
    "projects",
    "snapshots",
    "assets",
    "matchDecisions",
    "changeSets",
    "baselineAssignments",
    "reviewDecisions",
    "retentionAudits",
    "history",
    "srImports",
    "locations",
    "inventoryDevices",
    "pollingRuns",
    "pollingResults",
    "deviceChanges",
    "inventoryIssues"
  ]);

  const ROLE_NAMES = Object.freeze({ administrator: "Администратор МЦТП" });

  const PRODUCT_CATALOG = global.MVP_PRODUCT_CATALOG || (typeof module === "object" && module.exports ? require("./product-catalog") : null);
  if (!PRODUCT_CATALOG) throw new Error("Каталог продукта не загружен");
  const CREDENTIAL_POOL = global.MVP_CREDENTIAL_POOL || (typeof module === "object" && module.exports ? require("./runtime/credential-pool") : null);
  if (!CREDENTIAL_POOL) throw new Error("Модуль проверки учётных данных не загружен");
  const TE_LOG_EVENTS = global.MVP_HUAWEI_TE_LOG_EVENTS || (typeof module === "object" && module.exports ? require("./runtime/huawei-te-log-events") : null);
  if (!TE_LOG_EVENTS) throw new Error("Модуль анализа логов Huawei TE не загружен");
  const HUAWEI_310_LOG_EVENTS = global.MVP_HUAWEI_310_LOG_EVENTS || (typeof module === "object" && module.exports ? require("./runtime/huawei-310-log-events") : null);
  const HUAWEI_300_LOG_EVENTS = global.MVP_HUAWEI_300_LOG_EVENTS || (typeof module === "object" && module.exports ? require("./runtime/huawei-300-log-events") : null);
  const LOG_SCAN_CLIENT = global.MVP_LOG_SCAN_CLIENT || (typeof module === "object" && module.exports ? require("./runtime/log-scan-client") : null);
  if (!HUAWEI_310_LOG_EVENTS) throw new Error("Модуль анализа логов Huawei 310 не загружен");
  if (!LOG_SCAN_CLIENT) throw new Error("Модуль фонового разбора логов не загружен");
  const { MODULE_CATALOG, UI_TERMS, EQUIPMENT_CATEGORY_CATALOG, ANALYZED_PARAMETER_RULES, POLLING_HELP_ENTRIES } = PRODUCT_CATALOG;
  const EQUIPMENT_CATEGORY_IDS = Object.freeze(EQUIPMENT_CATEGORY_CATALOG.map((item) => item.id));
  const catalogValidation = PRODUCT_CATALOG.validateProductCatalog();
  if (!catalogValidation.ok) throw new Error(`Каталог продукта содержит ошибки: ${catalogValidation.errors.join("; ")}`);
  const HELP_TOPIC_BY_ROUTE = PRODUCT_CATALOG.buildHelpTopicByRoute();

  const HELP_SECTIONS = Object.freeze([
    {
      id: "about", title: "1. Об инструменте", description: "Назначение и границы безопасной работы.", entries: [
        { id: "about-tool", title: "MVP_SPHERE_SR", summary: "Инструмент предназначен для учёта, опроса и анализа состояния оборудования мультимедийной инфраструктуры.", details: "Перечень оборудования формируется по выгрузке SR и включает семь категорий: Терминалы ВКС, Контроллеры, Панели управления, Коммутаторы, Матричные коммутаторы, Скалеры и Аудио процессоры. Состояние появляется только из фактически импортированных результатов опросов.", keywords: ["назначение", "оборудование"] },
        { id: "about-local", title: "Запуск и хранение", summary: "Для автоматического опроса инструмент запускается двойным щелчком по START_MVP_SPHERE_SR.py; прямой index.html остаётся для ручного анализа.", details: "Требуется установленный Python 3.11 или новее; Node.js, PowerShell и установка пакетов не нужны. Импортированные данные находятся только в памяти страницы и удаляются при перезагрузке или закрытии. XLSX передаётся только в память локальной loopback-сессии одного запуска. Секреты не включаются в состояние, план или результаты; готовые JSON остаются в явно выбранной общей папке.", keywords: ["index.html", "START_MVP_SPHERE_SR.py", "python", "сеанс", "безопасность", "локально"] }
      ]
    },
    PRODUCT_CATALOG.buildModuleHelpSection(),
    {
      id: "terms", title: "3. Термины и определения", description: "Основные пользовательские понятия.", entries: [
        { id: "term-sr-export", title: "Выгрузка SR", summary: "Файл XLSX с актуальным перечнем помещений и оборудования — основной источник инвентарных данных.", keywords: ["xlsx", "реестр"] },
        { id: "term-sr", title: "SR", summary: "Используемое в проекте обозначение системы или выгрузки-источника данных.", details: "Точная расшифровка аббревиатуры требует уточнения.", keywords: ["источник", "выгрузка"], status: "needs_clarification" },
        { id: "term-polling", title: "Опрос оборудования", summary: "Автоматическое подключение инструмента к устройству для получения технической информации о его текущем состоянии.", keywords: ["polling", "опрос"] },
        { id: "term-run", title: "Запуск опроса", summary: "Одна операция опроса выбранной группы устройств с датой, временем, результатами и ошибками.", keywords: ["polling run", "запуск"] },
        { id: "term-result", title: "Результат опроса", summary: "Набор данных, полученный от одного устройства в ходе конкретного запуска опроса.", keywords: ["polling result", "json"] },
        { id: "term-history", title: "История опросов", summary: "Сохранённые результаты предыдущих опросов устройства.", keywords: ["polling history", "история"] },
        { id: "term-latest", title: "Последние данные", summary: "Самый новый доступный результат опроса конкретного устройства.", keywords: ["latest snapshot", "последнее состояние"] },
        { id: "term-change", title: "Изменение", summary: "Различие между данными устройства, полученными в двух последовательных опросах.", keywords: ["change", "изменения", "сравнение"] },
        { id: "term-location", title: "Локация", summary: "Помещение или место установки оборудования; основное название берётся из поля SR «Наименование локации».", keywords: ["комната", "помещение"] },
        { id: "term-vip-location", title: "VIP-локация", summary: "Локация, отмеченная в SR как VIP.", keywords: ["vip"] },
        { id: "term-vip-device", title: "VIP-оборудование", summary: "Оборудование, отмеченное в SR как VIP.", keywords: ["vip"] },
        { id: "term-manufacturer", title: "Производитель", summary: "Компания-производитель оборудования.", keywords: ["vendor"] },
        { id: "term-model", title: "Модель", summary: "Официальное обозначение модели конкретного устройства.", keywords: ["model"] },
        { id: "term-ip", title: "IP-адрес", summary: "Сетевой адрес устройства, используемый также для связи результата опроса с SR.", keywords: ["ip"] },
        { id: "term-mac", title: "MAC-адрес", summary: "Уникальный аппаратный адрес сетевого интерфейса устройства.", keywords: ["mac"] },
        { id: "term-sip-uri", title: "SIP URI", summary: "Адрес устройства в системе SIP, используемой для установления сеансов связи.", keywords: ["sip", "uri"] },
        { id: "term-domain", title: "Домен", summary: "Доменное значение устройства или инфраструктуры, если оно присутствует в SR.", keywords: ["domain"] },
        { id: "term-inventory", title: "Инвентарный номер", summary: "Учётный номер оборудования.", keywords: ["инвентаризация"] },
        { id: "term-serial", title: "Серийный номер", summary: "Уникальный заводской номер экземпляра оборудования.", keywords: ["serial"] }
      ]
    },
    {
      id: "abbreviations", title: "4. Сокращения", description: "Расшифровки и понятные пояснения сокращений.", entries: [
        { id: "abbr-vks", title: "ВКС", summary: "Видеоконференцсвязь. Категория оборудования в интерфейсе называется «Терминалы ВКС».", keywords: ["терминалы вкс"] },
        { id: "abbr-ip", title: "IP", summary: "Internet Protocol. IP-адрес — сетевой адрес устройства.", keywords: ["сетевой адрес"] },
        { id: "abbr-mac", title: "MAC", summary: "Media Access Control. MAC-адрес — аппаратный адрес сетевого интерфейса.", keywords: ["аппаратный адрес"] },
        { id: "abbr-sip", title: "SIP", summary: "Session Initiation Protocol — протокол установления сеансов связи.", keywords: ["сеанс связи"] },
        { id: "abbr-uri", title: "URI", summary: "Uniform Resource Identifier. В интерфейсе используется понятие «SIP URI — адрес устройства в системе SIP».", keywords: ["адрес"] },
        { id: "abbr-api", title: "API", summary: "Application Programming Interface — программный интерфейс получения данных от оборудования.", keywords: ["программный интерфейс"] },
        { id: "abbr-json", title: "JSON", summary: "JavaScript Object Notation — формат файлов результатов опроса оборудования.", keywords: ["файл", "результат опроса"] },
        { id: "abbr-xlsx", title: "XLSX", summary: "Формат файла электронной таблицы Microsoft Excel.", keywords: ["excel", "sr"] },
        { id: "abbr-gcplus", title: "GCPlus", summary: "Используемое в инфраструктуре обозначение типа или платформы проекта.", details: "Точное техническое определение требует уточнения.", keywords: ["gc plus"], status: "needs_clarification" },
        { id: "abbr-tlp", title: "TLP", summary: "В текущих данных — обозначение Панелей управления Extron.", details: "В пользовательских категориях всегда используется название «Панели управления».", keywords: ["extron", "панель"] }
      ]
    },
    PRODUCT_CATALOG.buildStatusHelpSection(),
    {
      id: "metrics", title: "6. Показатели и аналитика", description: "Что считается и к какому контексту относится показатель.", entries: [
        { id: "metric-total", title: "Всего оборудования", summary: "Количество устройств выбранных категорий в актуальной выгрузке SR.", keywords: ["инвентарь"] },
        { id: "metric-polled", title: "Опрошено", summary: "Количество устройств, для которых есть результаты опроса в соответствующем контексте.", keywords: ["опрос"] },
        { id: "metric-no-network", title: "Нет ответа по сети", summary: UI_TERMS.tooltips.noNetwork, keywords: ["ping"] },
        { id: "metric-changed-devices", title: "Устройства с изменениями", summary: "Количество уникальных устройств, у которых в выбранном периоде обнаружены изменения.", keywords: ["изменения"] },
        { id: "metric-changes", title: "Обнаруженные изменения", summary: "Общее количество отдельных изменений параметров; у одного устройства может быть несколько изменений.", keywords: ["записи изменений"] },
        { id: "metric-latest", title: "Последнее состояние", summary: "Показатель рассчитывается по одному самому новому результату каждого устройства.", keywords: ["latest state"] },
        { id: "metric-period", title: "Выбранный период", summary: "Показатель учитывает события и результаты внутри выбранного диапазона времени и не заменяет последнее состояние.", keywords: ["selected period"] }
      ]
    },
    {
      id: "sources", title: "7. Источники данных", description: "Происхождение сведений в интерфейсе.", entries: [
        { id: "source-sr", title: "Инвентарные данные", summary: "Названия помещений, категории и реквизиты оборудования поступают из актуальной выгрузки SR.", keywords: ["xlsx"] },
        { id: "source-polling", title: "Техническое состояние", summary: "Состояние и история формируются из локально импортированных результатов опроса.", details: "Можно выбрать одну общую папку: каждая вложенная папка YYYY-MM-DD_HH-MM-SS становится отдельным запуском.", keywords: ["json", "опрос", "общая папка"] }
      ]
    },
    {
      id: "polling", title: "8. Опрос оборудования", description: "Как формируется и выполняется опрос.", entries: [
        ...POLLING_HELP_ENTRIES,
        { id: "logic-folders", title: "Папки запусков опроса", summary: "Общая папка может содержать несколько сеансов; имя каждого сеанса имеет формат YYYY-MM-DD_HH-MM-SS.", details: "Инструмент рекурсивно находит JSON, создаёт отдельный запуск на каждую датированную папку и обрабатывает запуски по времени.", keywords: ["папка", "пакетный импорт", "дата"] },
        { id: "logic-result-time", title: "Дата и время опроса", summary: "Для отдельного JSON используется доступное браузеру время последнего изменения файла.", details: "Это не время создания файла. Если File API не предоставляет валидное значение, время результата остаётся неизвестным; дата папки используется только для группировки запуска.", keywords: ["lastModified", "время файла", "время опроса"] },
        { id: "logic-batch-progress", title: "Массовая загрузка результатов", summary: "Результаты опросов обрабатываются пакетно. Во время загрузки отображается количество найденных и обработанных файлов, ошибки, скорость обработки и примерное оставшееся время.", details: "Повторно уже загруженные результаты пропускаются, если инструмент может надёжно определить, что они уже были импортированы. Активную загрузку можно остановить без удаления уже обработанных результатов.", keywords: ["прогресс", "скорость", "оставшееся время", "дубликат", "отмена"] },
        { id: "logic-matching", title: "Сопоставление с SR", summary: "IP-адрес из имени файла результата сравнивается с IP-адресами выгрузки SR.", details: "При единственном совпадении результат связывается с оборудованием и локацией; иначе сохраняется как требующий проверки.", keywords: ["matching", "unmatched"] },
        { id: "logic-current-ip-matching", title: "Актуальный IP при сопоставлении", summary: "Результат опроса связывается только с текущим IP устройства из актуальной выгрузки SR.", details: "Исторические адреса из ipHistory сохраняются для справки, но не используются для автоматической привязки новых JSON. Если надёжный IP внутри JSON или тип оборудования противоречит имени файла и SR, результат сохраняется отдельно как конфликт данных и не меняет состояние устройства.", keywords: ["актуальный ip", "iphistory", "конфликт ip", "конфликт типа оборудования"] },
        { id: "logic-passive-sr", title: "Оборудование без идентификаторов", summary: "Строка SR без inventory, serial, MAC и IP всё равно отображается в соответствующей категории.", details: "Инструмент показывает предупреждение и использует локальную составную идентичность из помещения и описания оборудования. Такое устройство нельзя автоматически связать с JSON по IP, пока IP отсутствует в SR.", keywords: ["пассивное оборудование", "без ip", "missing identity"] },
        { id: "logic-no-network", title: "Как определяется отсутствие ответа", summary: "Перед получением данных инструмент может проверить сетевую доступность; отсутствие ответа отмечается статусом «Нет ответа по сети».", keywords: ["failedStage", "Ping.ok", "ping"] },
        { id: "logic-auth", title: "Как определяется ошибка авторизации", summary: "Для любого устройства Extron подтверждённым признаком является точное значение error = No credentials were accepted.", details: "Категория устройства Extron не ограничивает это правило. Другие значения error, ошибки чтения, обработки и сетевой доступности не называются ошибкой авторизации. Статус применяется после однозначной связи файла с устройством Extron из SR.", keywords: ["authorization", "no credentials were accepted", "extron"] },
        { id: "logic-support", title: "Поддержка автоматического опроса", summary: "Наличие устройства в SR не означает наличие подтверждённого механизма его автоматического опроса.", keywords: ["adapter", "supported", "unsupported"] },
        { id: "logic-reboots", title: "Правило выявления перезагрузки Extron", summary: "В каждом файле время перезагрузки рассчитывается как Device Status.Date минус Device Status.Uptime.", details: "Правило extron-reboot-v2 строго разбирает локальные дату и время устройства и uptime. Одинаковые расчётные времена запуска в нескольких опросах объединяются с допуском пять секунд; новое время запуска считается следующей перезагрузкой. При неизвестном часовом поясе время явно показывается как локальное время устройства. Неоднозначные данные не увеличивают счётчик.", keywords: ["reboot", "перезагрузка", "uptime", "extron", "date"] }
      ]
    },
    {
      id: "history", title: "9. История и изменения", description: "Как сохраняются результаты и обнаруживаются различия.", entries: [
        { id: "logic-history", title: "Сохранение истории", summary: "Каждый новый результат добавляется к истории устройства и не заменяет предыдущие результаты.", keywords: ["история опросов"] },
        { id: "logic-changes", title: "Определение значимых изменений", summary: "Инструмент сравнивает только централизованно утверждённые параметры для категории, производителя и модели.", details: "Служебные timestamps и остальные поля raw JSON историю не теряют, но событий не создают. Если утверждённого перечня нет, изменения не выдумываются.", keywords: ["было", "стало", "selective change detection", "значимые параметры"] },
        { id: "logic-data-errors", title: "Ошибки данных", summary: "Необработанный файл или результат без однозначного устройства сохраняется отдельно и не превращается в ошибку оборудования.", keywords: ["malformed", "unmatched", "качество данных"] }
      ]
    },
    {
      id: "technical", title: "10. Часто используемые технические понятия", description: "Технические детали простым эксплуатационным языком.", entries: [
        { id: "tech-raw", title: "Исходные и отображаемые значения", summary: "SR и JSON сохраняются без перевода; пользовательские подписи формируются отдельно.", details: "Например, исходное Video Conference отображается как категория «Терминалы ВКС».", keywords: ["raw", "video conference"] },
        { id: "tech-encryption", title: "Сеансовое хранение", summary: "Рабочие данные находятся только в памяти открытой страницы и не записываются приложением в постоянное хранилище браузера.", keywords: ["память", "сеанс", "index.html"] },
        { id: "tech-loopback", title: "Локальный запуск", summary: "Интерфейс открывается из локального index.html и не требует публикации в сеть или запуска сервера.", keywords: ["file", "локально", "index.html"] },
        { id: "tech-json-original", title: "Просмотр исходного JSON", summary: "При необходимости технические поля могут изучаться в исходном файле, но не используются как пользовательские статусы без преобразования.", keywords: ["json", "технические поля"] }
      ]
    }
  ]);

  function userLabel(dictionary, value, fallback) {
    return dictionary[String(value ?? "")] || fallback || "Данные отсутствуют";
  }

  function formatCategoryLabel(value) { return userLabel(UI_TERMS.categories, value); }
  function formatPollStatus(value) { return userLabel(UI_TERMS.pollStatuses, value); }
  function formatPingStatus(value) { return userLabel(UI_TERMS.pingStatuses, value); }
  function formatCapabilityStatus(value) { return userLabel(UI_TERMS.capabilities, value); }
  function formatRunStatus(value) { return userLabel(UI_TERMS.runStatuses, value); }
  function formatImportOutcome(value) { return userLabel(UI_TERMS.importOutcomes, value); }

  function formatInventoryIssue(issue, linkedResult) {
    const filename = linkedResult?.filename || "файл импорта";
    const ip = linkedResult?.filenameIp || "неизвестный IP-адрес";
    return {
      malformed_json: `Не удалось обработать файл ${filename}. Проверьте корректность структуры JSON.`,
      invalid_filename_ip: `Не удалось определить IP-адрес по имени файла ${filename}. Переименуйте файл по IP-адресу устройства.`,
      unmatched_ip: `Устройство с IP-адресом ${ip} не найдено в текущей выгрузке SR.`,
      ambiguous_ip: `IP-адрес ${ip} соответствует нескольким устройствам. Проверьте актуальную выгрузку SR.`,
      polling_ip_conflict: `IP-адрес в имени файла ${filename} не совпадает с подтверждённым IP внутри JSON. Результат не привязан к оборудованию.`,
      classification_conflict: "Конфликт типа оборудования: категория результата опроса не совпадает с актуальной SR. Результат не привязан к оборудованию.",
      invalid_ip: "В выгрузке SR указан некорректный IP-адрес. Проверьте исходную строку.",
      missing_identity: "Устройство сохранено в перечне, но в строке SR нет SmartRoom ID оборудования, ID устройства, инвентарного/серийного номера, MAC или IP. Для повторного импорта используется локальная составная идентичность по локации и описанию.",
      ambiguous_identity: "Строка SR может относиться к нескольким устройствам. Требуется проверка идентификаторов.",
      identity_collision: "Совпавший идентификатор уже используется другой строкой текущей SR. Обе строки сохранены отдельными устройствами и требуют проверки исходных идентификаторов.",
      duplicate_sr_row: "Строка является точным повтором уже обработанной строки SR с теми же идентификаторами и техническим описанием.",
      unknown_category: "Не удалось определить категорию оборудования по данным SR. Проверьте тип оборудования и тип модели."
    }[issue?.kind] || "Обнаружена ошибка данных. Проверьте исходный файл и повторите импорт.";
  }

  function formatChangePath(path) {
    const normalized = String(path || "").toLocaleLowerCase("ru-RU");
    if (/ip(address)?$/.test(normalized)) return "IP-адрес";
    if (/mac(address)?$/.test(normalized)) return "MAC-адрес";
    if (/host(name)?$/.test(normalized)) return "Имя устройства";
    if (/firmware|version/.test(normalized)) return "Версия программного обеспечения";
    if (/model|partnum/.test(normalized)) return "Модель оборудования";
    if (/name/.test(normalized)) return "Название";
    return "Параметр устройства";
  }

  function normalizeReferenceSearch(value) {
    return String(value || "").trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
  }

  function searchReferenceEntries(query) {
    const normalized = normalizeReferenceSearch(query);
    const entries = HELP_SECTIONS.flatMap((section) => section.entries.map((entry) => ({ ...entry, sectionId: section.id, sectionTitle: section.title })));
    if (!normalized) return entries;
    return entries.filter((entry) => normalizeReferenceSearch([entry.title, entry.summary, entry.details, ...(entry.keywords || [])].filter(Boolean).join(" ")).includes(normalized));
  }

  const POLLING_ADAPTERS = Object.freeze([
    Object.freeze({
      key: "controller/extron",
      category: "controller",
      manufacturerNormalized: "extron",
      support: "implemented",
      transport: "extron_web_dynamic_resources_v1",
      normalizerKey: "extron-json-v1",
      credentialMode: "memory_xlsx_pool"
    }),
    Object.freeze({
      key: "panel/extron",
      category: "panel",
      manufacturerNormalized: "extron",
      support: "implemented",
      transport: "extron_web_dynamic_resources_v1",
      normalizerKey: "extron-json-v1",
      credentialMode: "memory_xlsx_pool"
    }),
    Object.freeze({
      key: "vcs/huawei/te20-legacy",
      category: "vcs",
      manufacturerNormalized: "huawei",
      modelNormalized: "te20",
      support: "implemented",
      transport: "huawei_te20_web_cgi_v1",
      normalizerKey: "huawei-te-json-v1",
      credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["disable_insecure_management_services", "set_te20_auto_answer_automatic", "set_te20_auto_answer_manual", "set_te20_http_open", "set_te20_http_closed", "set_te20_telnet_open", "set_te20_telnet_closed", "disable_te20_auto_update", "set_te20_ssh_enabled", "set_te20_ssh_disabled", "set_te20_ntp_settings", "set_te20_power_settings"])
    }),
    ...["te30", "te40", "te50", "te60"].map((modelNormalized) => Object.freeze({
      key: "vcs/huawei/te-family",
      category: "vcs",
      manufacturerNormalized: "huawei",
      modelNormalized,
      support: "implemented",
      transport: "huawei_te_web_cgi_v1",
      normalizerKey: "huawei-te-json-v1",
      credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["disable_insecure_management_services", "set_te_family_auto_answer_automatic", "set_te_family_auto_answer_manual"])
    })),
    ...["bar 300", "cloudlink bar 300", "cloudlinc bar 300", "huawei bar 300", "huawei cloudlink bar 300"].map((modelNormalized) => Object.freeze({
      key: "vcs/huawei/bar300", category: "vcs", manufacturerNormalized: "huawei", modelNormalized,
      support: "implemented", transport: "huawei_bar300_web_cgi_v1", normalizerKey: "huawei-bar300-json-v1", credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["set_huawei_300_auto_answer_automatic", "set_huawei_300_auto_answer_manual"])
    })),
    ...["box 300", "cloudlink box 300", "cloudlinc box 300", "huawei box 300", "huawei cloudlink box 300"].map((modelNormalized) => Object.freeze({
      key: "vcs/huawei/box300", category: "vcs", manufacturerNormalized: "huawei", modelNormalized,
      support: "implemented", transport: "huawei_box300_web_cgi_v1", normalizerKey: "huawei-box300-json-v1", credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["set_huawei_300_auto_answer_automatic", "set_huawei_300_auto_answer_manual"])
    })),
    ...["box 600", "cloudlink box 600", "cloudlinc box 600", "huawei box 600", "huawei cloudlink box 600"].map((modelNormalized) => Object.freeze({
      key: "vcs/huawei/box600", category: "vcs", manufacturerNormalized: "huawei", modelNormalized,
      support: "implemented", transport: "huawei_box600_web_cgi_v1", normalizerKey: "huawei-box600-json-v1", credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["set_huawei_300_auto_answer_automatic", "set_huawei_300_auto_answer_manual"])
    })),
    ...["bar 310", "cloudlink bar 310", "cloudlinc bar 310"].map((modelNormalized) => Object.freeze({
      key: "vcs/huawei/bar310",
      category: "vcs",
      manufacturerNormalized: "huawei",
      modelNormalized,
      support: "implemented",
      transport: "huawei_310_rest_v1",
      normalizerKey: "huawei-bar310-json-v1",
      credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["disable_insecure_management_services", "set_huawei_310_auto_answer_automatic", "set_huawei_310_auto_answer_manual"])
    })),
    ...["box 310", "cloudlink box 310", "cloudlinc box 310"].map((modelNormalized) => Object.freeze({
      key: "vcs/huawei/box310",
      category: "vcs",
      manufacturerNormalized: "huawei",
      modelNormalized,
      support: "implemented",
      transport: "huawei_310_rest_v1",
      normalizerKey: "huawei-box310-json-v1",
      credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["disable_insecure_management_services", "set_huawei_310_auto_answer_automatic", "set_huawei_310_auto_answer_manual"])
    })),
    ...["box 610", "cloudlink box 610", "cloudlinc box 610"].map((modelNormalized) => Object.freeze({
      key: "vcs/huawei/box610",
      category: "vcs",
      manufacturerNormalized: "huawei",
      modelNormalized,
      support: "implemented",
      transport: "huawei_310_rest_v1",
      normalizerKey: "huawei-box610-json-v1",
      credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["disable_insecure_management_services", "set_huawei_310_auto_answer_automatic", "set_huawei_310_auto_answer_manual"])
    })),
    ...[300, 310, 500, 700].flatMap((number) => [
      `realpresence group ${number}`, `polycom realpresence group ${number}`
    ].map((modelNormalized) => Object.freeze({
      key: `vcs/polycom/group${number}`,
      category: "vcs",
      manufacturerNormalized: "polycom",
      modelNormalized,
      support: "implemented",
      transport: `polycom_group${number}_web_v1`,
      normalizerKey: `polycom-group${number}-json-v1`,
      credentialMode: "memory_xlsx_pool",
      managementTasks: Object.freeze(["set_polycom_group_auto_answer"])
    })))
  ]);

  const SR_CANONICAL_HEADERS = Object.freeze([
    "SmartRoom ID локации", "Наименование локации", "Общий статус локации", "Описание локации",
    "Комментарий при переводе в учёт локации", "Адрес локации", "Сервисный статус", "Признак VIP",
    "Избранная локация", "Открытые заявки", "Закрытые заявки", "Кол-во оборудования",
    "Табельный номер", "Контактное лицо", "Подрядчик", "Описание подрядчика",
    "Срок гарантийных обязательств", "SmartRoom ID оборудования", "Класс оборудования",
    "Наименование оборудования", "Общий статус оборудования", "Статус UDP", "Статус ICMP",
    "Статус TCP", "Статус авторизации", "SmartRoomID контроллера", "Описание",
    "Комментарий при переводе в учёт оборудования", "ID устройства", "Тип", "Производитель",
    "Модель", "IP адрес", "MAC адрес", "Домен", "SIP URI", "Инвентарный номер",
    "Серийный номер", "Статус питания", "Тип интерфейса", "Протокол IP", "802.1x"
  ]);

  const SR_FIELD_ALIASES = Object.freeze({
    locationId: Object.freeze(["SmartRoom ID локации", "ID комнаты"]),
    locationName: Object.freeze(["Наименование локации", "Название комнаты"]),
    locationOverallStatus: Object.freeze(["Общий статус локации", "Состояние комнаты"]),
    locationDescription: Object.freeze(["Описание локации"]),
    locationAccountingComment: Object.freeze(["Комментарий при переводе в учёт локации"]),
    locationAddress: Object.freeze(["Адрес локации", "Адрес комнаты"]),
    serviceStatus: Object.freeze(["Сервисный статус"]),
    locationVip: Object.freeze(["Признак VIP", "VIP комната"]),
    favoriteLocation: Object.freeze(["Избранная локация", "Избранное"]),
    openTickets: Object.freeze(["Открытые заявки"]),
    closedTickets: Object.freeze(["Закрытые заявки"]),
    equipmentCount: Object.freeze(["Кол-во оборудования"]),
    employeeNumber: Object.freeze(["Табельный номер"]),
    contactPerson: Object.freeze(["Контактное лицо"]),
    contractor: Object.freeze(["Подрядчик"]),
    contractorDescription: Object.freeze(["Описание подрядчика"]),
    warrantyTerm: Object.freeze(["Срок гарантийных обязательств"]),
    equipmentId: Object.freeze(["SmartRoom ID оборудования", "SmartRoomID"]),
    equipmentClass: Object.freeze(["Класс оборудования", "Тип оборудования"]),
    equipmentName: Object.freeze(["Наименование оборудования", "Наименование"]),
    equipmentOverallStatus: Object.freeze(["Общий статус оборудования", "Общий статус"]),
    udpStatus: Object.freeze(["Статус UDP"]),
    icmpStatus: Object.freeze(["Статус ICMP"]),
    tcpStatus: Object.freeze(["Статус TCP"]),
    authorizationStatus: Object.freeze(["Статус авторизации", "Статус аутентификации"]),
    controllerSmartRoomId: Object.freeze(["SmartRoomID контроллера"]),
    equipmentDescription: Object.freeze(["Описание"]),
    equipmentAccountingComment: Object.freeze(["Комментарий при переводе в учёт оборудования"]),
    deviceId: Object.freeze(["ID устройства"]),
    modelType: Object.freeze(["Тип", "Тип модели"]),
    manufacturer: Object.freeze(["Производитель"]),
    model: Object.freeze(["Модель"]),
    ip: Object.freeze(["IP адрес", "IP"]),
    mac: Object.freeze(["MAC адрес", "MAC"]),
    domain: Object.freeze(["Домен"]),
    sipUri: Object.freeze(["SIP URI"]),
    inventoryNumber: Object.freeze(["Инвентарный номер"]),
    serialNumber: Object.freeze(["Серийный номер"]),
    powerStatus: Object.freeze(["Статус питания"]),
    interfaceType: Object.freeze(["Тип интерфейса"]),
    ipProtocol: Object.freeze(["Протокол IP"]),
    dot1x: Object.freeze(["802.1x"]),
    legacyDeviceVip: Object.freeze(["VIP оборудование"])
  });

  const SR_REQUIRED_FIELDS = Object.freeze([
    "locationName", "locationAddress", "locationVip", "equipmentClass", "equipmentName",
    "model", "modelType", "manufacturer", "ip", "mac", "sipUri", "inventoryNumber", "serialNumber"
  ]);

  const SR_REQUIRED_HEADERS = Object.freeze(SR_REQUIRED_FIELDS.map((field) => SR_FIELD_ALIASES[field][0]));

  // ---------------------------------------------------------------------------
  // Pure helpers
  // ---------------------------------------------------------------------------

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function unique(values) {
    return new Set(values).size === values.length;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function createId(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return `${prefix}-${global.crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function formatBytes(value) {
    const bytes = Number(value) || 0;
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КиБ`;
    if (bytes >= 1024 ** 4) return `${(bytes / (1024 ** 4)).toFixed(2)} ТиБ`;
    if (bytes >= 1024 ** 3) return `${(bytes / (1024 ** 3)).toFixed(2)} ГиБ`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} МиБ`;
  }

  function serializeState(state) {
    return JSON.stringify(state);
  }

  function safeWorkspaceField(key, value) {
    const secretKey = /rawtext|password|passwd|secret|credential|cookie|token|api.?key|private.?key|authenticationinputsha256|sessionid|username|successfulcredential/i;
    const inlineSecret = /\bBasic\s+[A-Za-z0-9+/=]+|NortxeSession=/i;
    if (secretKey.test(key)) return undefined;
    return typeof value === "string" && inlineSecret.test(value) ? "[REDACTED]" : value;
  }

  function workspaceProjection(candidateState, logData) {
    const safeState = { ...(candidateState || {}), currentUserId: null };
    const source = logData || {};
    return { schemaVersion: 1, state: safeState, log: {
      rows: Array.isArray(source.rows) ? source.rows : [],
      summary: source.summary || { files: 0, bytes: 0, matched: 0, issues: 0, formats: {} },
      indexes: source.indexes || {},
      registry: Array.isArray(source.registry) ? source.registry : []
    } };
  }

  function buildWorkspaceProjection(candidateState, logData) {
    return JSON.parse(JSON.stringify(workspaceProjection(candidateState, logData), safeWorkspaceField));
  }

  function* workspaceParts(candidateState, logData, targetBytes = 1024 * 1024) {
    const meta = workspaceProjection(candidateState, logData);
    const groups = [];
    function detach(parent, key, path) {
      if (!Array.isArray(parent[key])) return;
      groups.push([path, parent[key]]);
      parent[key] = [];
    }
    for (const key of Object.keys(meta.state)) detach(meta.state, key, `state/${key}`);
    detach(meta.log, "rows", "log/rows");
    detach(meta.log, "registry", "log/registry");
    meta.log.indexes = { ...meta.log.indexes };
    for (const key of Object.keys(meta.log.indexes)) {
      const index = meta.log.indexes[key];
      if (!Array.isArray(index?.events)) continue;
      meta.log.indexes[key] = { ...index };
      detach(meta.log.indexes[key], "events", `log/indexes/${key}/events`);
    }
    yield JSON.stringify({ meta }, safeWorkspaceField);
    for (const [key, group] of groups) {
      let batch = [], bytes = 0, offset = 0;
      const body = () => `{"key":${JSON.stringify(key)},"offset":${offset},"rows":[${batch.join(",")}]}`;
      for (const row of group) {
        const encoded = JSON.stringify(row, safeWorkspaceField) ?? "null";
        const size = measureTextBytes(encoded) + 1;
        if (batch.length && (bytes + size > targetBytes || batch.length >= 1024)) {
          yield body();
          offset += batch.length;
          batch = []; bytes = 0;
        }
        batch.push(encoded);
        bytes += size;
      }
      if (batch.length) yield body();
    }
  }

  function restoreWorkspacePart(current, part) {
    if (current === null) {
      if (part?.meta?.schemaVersion !== 1 || !isPlainObject(part.meta.state) || !isPlainObject(part.meta.log)) throw new Error("workspace_snapshot_invalid");
      return part.meta;
    }
    if (!Array.isArray(part?.rows) || !part.rows.length || typeof part.key !== "string") throw new Error("workspace_snapshot_invalid");
    const names = part.key.split("/");
    let parent = current;
    for (const name of names) {
      if (!isPlainObject(parent) || !Object.prototype.hasOwnProperty.call(parent, name)) throw new Error("workspace_snapshot_invalid");
      parent = parent[name];
    }
    if (!Array.isArray(parent) || part.offset !== parent.length) throw new Error("workspace_snapshot_invalid");
    for (const row of part.rows) parent.push(row);
    return current;
  }

  function measureTextBytes(text) {
    if (typeof TextEncoder !== "undefined") {
      return new TextEncoder().encode(text).byteLength;
    }
    return unescape(encodeURIComponent(text)).length;
  }

  function measureStateBytes(state) {
    return measureTextBytes(serializeState(state));
  }

  function makeHistoryEntry(input) {
    return {
      id: input.id || createId("history"),
      timestamp: input.timestamp || nowIso(),
      actorId: input.actorId || "system",
      actorName: input.actorName || "System",
      action: String(input.action || "Неизвестное действие"),
      entityType: String(input.entityType || "system"),
      entityId: input.entityId || "",
      projectId: input.projectId || "",
      details: String(input.details || "")
    };
  }

  function appendHistory(state, input) {
    const next = deepClone(state);
    next.history.push(makeHistoryEntry(input));
    return next;
  }

  // ---------------------------------------------------------------------------
  // State creation, migration and validation
  // ---------------------------------------------------------------------------

  function createDemoState() {
    const createdAt = nowIso();
    const administrator = {
      id: "user-administrator",
      name: "Администратор МЦТП",
      login: "administrator",
      password: null,
      role: "administrator",
      active: true,
      createdAt,
      updatedAt: createdAt
    };
    return {
      version: STATE_VERSION,
      users: [administrator],
      projects: [],
      snapshots: [],
      assets: [],
      matchDecisions: [],
      changeSets: [],
      baselineAssignments: [],
      reviewDecisions: [],
      retentionAudits: [],
      srImports: [],
      locations: [],
      inventoryDevices: [],
      pollingRuns: [],
      pollingResults: [],
      deviceChanges: [],
      inventoryIssues: [],
      history: [
        makeHistoryEntry({
          id: "history-demo-initialized",
          timestamp: createdAt,
          actorId: administrator.id,
          actorName: administrator.name,
          action: "Инициализировано локальное demo-state",
          entityType: "system",
          details: "Создана единственная роль Администратор МЦТП"
        })
      ],
      settings: {
        retentionDays: DEFAULT_RETENTION_DAYS,
        sourceSystem: "local-file-import",
        legacyTimezone: "Europe/Moscow",
        normalizerVersion: "1.0.0",
        severityPolicyVersion: "1.0.0",
        demoWarningAcceptedAt: null,
        ignoredPollingPaths: []
      },
      currentUserId: null
    };
  }

  function canPerformAction(state, userId, action) {
    const user = state.users.find((item) => item.id === userId && item.active);
    if (!user) return false;
    if (COMMON_ACTIONS.includes(action)) return true;
    return user.role === "administrator" && ADMIN_ACTIONS.includes(action);
  }

  function migrateState(candidate) {
    if (!isPlainObject(candidate)) {
      return { ok: false, errors: ["State должен быть JSON object"] };
    }
    if (candidate.version === STATE_VERSION) {
      return { ok: true, state: deepClone(candidate), migrated: false };
    }
    if ([1, 2].includes(candidate.version)) {
      const next = deepClone(candidate);
      next.version = STATE_VERSION;
      ["srImports", "locations", "inventoryDevices", "pollingRuns", "pollingResults", "deviceChanges", "inventoryIssues"].forEach((key) => {
        if (!Array.isArray(next[key])) next[key] = [];
      });
      if (!isPlainObject(next.settings)) next.settings = {};
      if (!Array.isArray(next.settings.ignoredPollingPaths)) next.settings.ignoredPollingPaths = [];
      let administrator = (next.users || []).find((user) => user && user.role === "administrator");
      if (!administrator) administrator = createDemoState().users[0];
      if (administrator) {
        administrator.name = "Администратор МЦТП";
        administrator.active = true;
        administrator.updatedAt = nowIso();
      }
      next.users = [administrator];
      next.currentUserId = null;
      return { ok: true, state: next, migrated: true };
    }
    if (candidate.version !== STATE_VERSION) {
      return {
        ok: false,
        errors: [`Неподдерживаемая версия state: ${String(candidate.version)}`]
      };
    }
    return { ok: true, state: deepClone(candidate), migrated: false };
  }

  function validateState(candidate) {
    const errors = [];
    if (!isPlainObject(candidate)) {
      return { ok: false, errors: ["State должен быть JSON object"] };
    }
    if (candidate.version !== STATE_VERSION) {
      errors.push(`version должен быть ${STATE_VERSION}`);
    }
    STATE_ARRAY_KEYS.forEach((key) => {
      if (!Array.isArray(candidate[key])) errors.push(`${key} должен быть массивом`);
    });
    if (!isPlainObject(candidate.settings)) {
      errors.push("settings должен быть object");
    } else {
      if (!Number.isInteger(candidate.settings.retentionDays) || candidate.settings.retentionDays <= 0) {
        errors.push("settings.retentionDays должен быть положительным целым числом");
      }
      if (!Array.isArray(candidate.settings.ignoredPollingPaths)) {
        errors.push("settings.ignoredPollingPaths должен быть массивом");
      }
    }

    if (errors.length) return { ok: false, errors };

    const userIds = candidate.users.map((item) => item && item.id);
    const userLogins = candidate.users.map((item) => item && item.login);
    const projectIds = candidate.projects.map((item) => item && item.id);
    const snapshotIds = candidate.snapshots.map((item) => item && item.id);
    const assetIds = candidate.assets.map((item) => item && item.id);
    const locationIds = candidate.locations.map((item) => item && item.id);
    const inventoryDeviceIds = candidate.inventoryDevices.map((item) => item && item.id);
    const pollingRunIds = candidate.pollingRuns.map((item) => item && item.id);
    const pollingResultIds = candidate.pollingResults.map((item) => item && item.id);

    if (userIds.some((id) => !id) || !unique(userIds)) errors.push("User IDs должны быть заполнены и уникальны");
    if (userLogins.some((login) => !login) || !unique(userLogins)) errors.push("User logins должны быть заполнены и уникальны");
    if (projectIds.some((id) => !id) || !unique(projectIds)) errors.push("Project IDs должны быть заполнены и уникальны");
    if (snapshotIds.some((id) => !id) || !unique(snapshotIds)) errors.push("Snapshot IDs должны быть заполнены и уникальны");
    if (assetIds.some((id) => !id) || !unique(assetIds)) errors.push("Asset IDs должны быть заполнены и уникальны");
    if (locationIds.some((id) => !id) || !unique(locationIds)) errors.push("Location IDs должны быть заполнены и уникальны");
    if (inventoryDeviceIds.some((id) => !id) || !unique(inventoryDeviceIds)) errors.push("Inventory Device IDs должны быть заполнены и уникальны");
    if (pollingRunIds.some((id) => !id) || !unique(pollingRunIds)) errors.push("Polling Run IDs должны быть заполнены и уникальны");
    if (pollingResultIds.some((id) => !id) || !unique(pollingResultIds)) errors.push("Polling Result IDs должны быть заполнены и уникальны");

    candidate.users.forEach((user, index) => {
      if (!isPlainObject(user)) {
        errors.push(`users[${index}] должен быть object`);
        return;
      }
      if (!ROLE_NAMES[user.role]) errors.push(`users[${index}].role не поддерживается`);
      if (typeof user.active !== "boolean") errors.push(`users[${index}].active должен быть boolean`);
    });

    if (candidate.currentUserId !== null && !userIds.includes(candidate.currentUserId)) {
      errors.push("currentUserId ссылается на отсутствующего пользователя");
    }

    candidate.snapshots.forEach((snapshot, index) => {
      if (!isPlainObject(snapshot)) {
        errors.push(`snapshots[${index}] должен быть object`);
        return;
      }
      if (snapshot.projectId !== null && !projectIds.includes(snapshot.projectId)) {
        errors.push(`snapshots[${index}].projectId не существует`);
      }
    });

    candidate.assets.forEach((asset, index) => {
      if (!isPlainObject(asset) || !projectIds.includes(asset.projectId)) {
        errors.push(`assets[${index}].projectId не существует`);
      }
    });

    candidate.changeSets.forEach((changeSet, index) => {
      if (!isPlainObject(changeSet)) {
        errors.push(`changeSets[${index}] должен быть object`);
        return;
      }
      if (!projectIds.includes(changeSet.projectId)) errors.push(`changeSets[${index}].projectId не существует`);
      if (!snapshotIds.includes(changeSet.fromSnapshotId)) errors.push(`changeSets[${index}].fromSnapshotId не существует`);
      if (!snapshotIds.includes(changeSet.toSnapshotId)) errors.push(`changeSets[${index}].toSnapshotId не существует`);
    });

    candidate.baselineAssignments.forEach((baseline, index) => {
      if (!isPlainObject(baseline)) {
        errors.push(`baselineAssignments[${index}] должен быть object`);
        return;
      }
      if (!projectIds.includes(baseline.projectId)) errors.push(`baselineAssignments[${index}].projectId не существует`);
      if (!snapshotIds.includes(baseline.snapshotId)) errors.push(`baselineAssignments[${index}].snapshotId не существует`);
    });

    candidate.inventoryDevices.forEach((device, index) => {
      if (!isPlainObject(device)) {
        errors.push(`inventoryDevices[${index}] должен быть object`);
        return;
      }
      if (device.locationId !== null && device.locationId !== undefined && !locationIds.includes(device.locationId)) {
        errors.push(`inventoryDevices[${index}].locationId не существует`);
      }
    });

    candidate.pollingRuns.forEach((run, index) => {
      if (!isPlainObject(run)) {
        errors.push(`pollingRuns[${index}] должен быть object`);
        return;
      }
      (run.deviceIds || []).forEach((deviceId) => {
        if (!inventoryDeviceIds.includes(deviceId)) errors.push(`pollingRuns[${index}].deviceIds содержит неизвестное устройство`);
      });
    });

    candidate.pollingResults.forEach((result, index) => {
      if (!isPlainObject(result)) {
        errors.push(`pollingResults[${index}] должен быть object`);
        return;
      }
      if (!pollingRunIds.includes(result.runId)) errors.push(`pollingResults[${index}].runId не существует`);
      if (result.deviceId !== null && !inventoryDeviceIds.includes(result.deviceId)) errors.push(`pollingResults[${index}].deviceId не существует`);
    });

    candidate.deviceChanges.forEach((change, index) => {
      if (!isPlainObject(change)) {
        errors.push(`deviceChanges[${index}] должен быть object`);
        return;
      }
      if (!inventoryDeviceIds.includes(change.deviceId)) errors.push(`deviceChanges[${index}].deviceId не существует`);
      if (!pollingResultIds.includes(change.fromPollingResultId)) errors.push(`deviceChanges[${index}].fromPollingResultId не существует`);
      if (!pollingResultIds.includes(change.toPollingResultId)) errors.push(`deviceChanges[${index}].toPollingResultId не существует`);
    });

    return { ok: errors.length === 0, errors };
  }

  // ---------------------------------------------------------------------------
  // Storage and atomic state replacement
  // ---------------------------------------------------------------------------

  function saveState(nextState, storage, options) {
    const targetStorage = storage;
    const settings = Object.assign({ maxBytes: DEFAULT_MAX_STATE_BYTES }, options || {});
    const validation = validateState(nextState);
    if (!validation.ok) {
      return { ok: false, kind: "validation", errors: validation.errors };
    }

    const serialized = serializeState(nextState);
    const bytes = measureTextBytes(serialized);
    if (bytes > settings.maxBytes) {
      return {
        ok: false,
        kind: "quota_preflight",
        bytes,
        maxBytes: settings.maxBytes,
        errors: [`State ${formatBytes(bytes)} превышает безопасный лимит ${formatBytes(settings.maxBytes)}`]
      };
    }

    if (!targetStorage || typeof targetStorage.setItem !== "function") {
      return { ok: false, kind: "storage_unavailable", errors: ["localStorage недоступен"] };
    }

    let previous = null;
    try {
      previous = targetStorage.getItem(STORAGE_KEY);
      targetStorage.setItem(STORAGE_KEY, serialized);
      if (targetStorage.getItem(STORAGE_KEY) !== serialized) {
        throw new Error("Проверка сохранённого state не прошла");
      }
      return { ok: true, bytes, serialized };
    } catch (error) {
      try {
        const current = targetStorage.getItem(STORAGE_KEY);
        if (current !== previous) {
          if (previous === null) targetStorage.removeItem(STORAGE_KEY);
          else targetStorage.setItem(STORAGE_KEY, previous);
        }
      } catch (rollbackError) {
        // The caller receives both the original failure and a recovery warning.
        return {
          ok: false,
          kind: "quota_or_storage",
          errors: [String(error.message || error), `Rollback не подтверждён: ${String(rollbackError.message || rollbackError)}`]
        };
      }
      return { ok: false, kind: "quota_or_storage", errors: [String(error.message || error)] };
    }
  }

  function loadState(storage) {
    const targetStorage = storage;
    if (!targetStorage || typeof targetStorage.getItem !== "function") {
      return {
        state: createDemoState(),
        recovery: { kind: "storage_unavailable", reason: "localStorage недоступен" },
        created: false
      };
    }

    const currentRaw = targetStorage.getItem(STORAGE_KEY);
    const legacyRaw = currentRaw === null ? targetStorage.getItem(LEGACY_STORAGE_KEY) : null;
    const raw = currentRaw === null ? legacyRaw : currentRaw;
    if (raw === null) {
      const fresh = createDemoState();
      const saved = saveState(fresh, targetStorage);
      return {
        state: fresh,
        recovery: saved.ok ? null : { kind: saved.kind, reason: saved.errors.join("; ") },
        created: true
      };
    }

    try {
      const parsed = JSON.parse(raw);
      const migrated = migrateState(parsed);
      if (!migrated.ok) throw new Error(migrated.errors.join("; "));
      const validation = validateState(migrated.state);
      if (!validation.ok) throw new Error(validation.errors.join("; "));
      if (migrated.migrated || currentRaw === null) {
        const saved = saveState(migrated.state, targetStorage);
        if (!saved.ok) throw new Error(saved.errors.join("; "));
      }
      return { state: migrated.state, recovery: null, created: false, migrated: migrated.migrated };
    } catch (error) {
      return {
        state: createDemoState(),
        recovery: {
          kind: "corrupt_state",
          reason: String(error.message || error),
          raw
        },
        created: false
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Ephemeral demo session (separate from persistent project state)
  // ---------------------------------------------------------------------------

  function clearPersistedUserSession(state) {
    const next = deepClone(state);
    next.currentUserId = null;
    return next;
  }

  function resolveSessionStorage(storage) {
    if (storage) return storage;
    try {
      return global.sessionStorage || null;
    } catch (error) {
      return null;
    }
  }

  function readSessionUserId(state, storage) {
    const targetStorage = resolveSessionStorage(storage);
    if (!targetStorage || typeof targetStorage.getItem !== "function") return null;
    try {
      const userId = targetStorage.getItem(SESSION_KEY);
      const valid = state.users.some((user) => user.id === userId && user.active);
      if (valid) return userId;
      if (userId !== null && typeof targetStorage.removeItem === "function") targetStorage.removeItem(SESSION_KEY);
      return null;
    } catch (error) {
      return null;
    }
  }

  function writeSessionUserId(state, userId, storage) {
    const targetStorage = resolveSessionStorage(storage);
    if (!state.users.some((user) => user.id === userId && user.active)) {
      return { ok: false, errors: ["Demo-пользователь для session не найден или неактивен"] };
    }
    if (!targetStorage || typeof targetStorage.setItem !== "function") {
      return { ok: false, errors: ["sessionStorage недоступен"] };
    }
    try {
      targetStorage.setItem(SESSION_KEY, userId);
      return { ok: true, errors: [] };
    } catch (error) {
      return { ok: false, errors: [String(error.message || error)] };
    }
  }

  function clearSessionUserId(storage) {
    const targetStorage = resolveSessionStorage(storage);
    if (!targetStorage || typeof targetStorage.removeItem !== "function") return false;
    try {
      targetStorage.removeItem(SESSION_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Backup contract
  // ---------------------------------------------------------------------------

  function createBackup(state) {
    const exportedState = deepClone(state);
    exportedState.currentUserId = null;
    return {
      schema: BACKUP_SCHEMA,
      version: STATE_VERSION,
      exportedAt: nowIso(),
      state: exportedState
    };
  }

  function validateBackup(value) {
    const errors = [];
    if (!isPlainObject(value)) return { ok: false, errors: ["Backup должен быть JSON object"] };
    if (value.schema !== BACKUP_SCHEMA) errors.push(`schema должен быть ${BACKUP_SCHEMA}`);
    if (![1, 2, STATE_VERSION].includes(value.version)) errors.push(`version должен быть 1, 2 или ${STATE_VERSION}`);
    if (!value.exportedAt || Number.isNaN(new Date(value.exportedAt).getTime())) {
      errors.push("exportedAt должен быть корректной ISO date-time");
    }
    const migrated = migrateState(value.state);
    if (!migrated.ok) errors.push(...migrated.errors.map((item) => `state: ${item}`));
    const stateValidation = migrated.ok ? validateState(migrated.state) : { ok: false, errors: [] };
    if (!stateValidation.ok) errors.push(...stateValidation.errors.map((item) => `state: ${item}`));
    return { ok: errors.length === 0, errors, state: errors.length ? null : deepClone(migrated.state) };
  }

  function importBackupText(text, storage, options) {
    const settings = options || {};
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      return { ok: false, kind: "invalid_json", errors: ["Backup содержит некорректный JSON"] };
    }
    const validation = validateBackup(payload);
    if (!validation.ok) return { ok: false, kind: "invalid_backup", errors: validation.errors };
    const nextState = typeof settings.transformState === "function"
      ? settings.transformState(deepClone(validation.state))
      : validation.state;
    const transformedValidation = validateState(nextState);
    if (!transformedValidation.ok) {
      return { ok: false, kind: "invalid_transformed_state", errors: transformedValidation.errors };
    }
    const saved = saveState(nextState, storage, settings);
    if (!saved.ok) return saved;
    return { ok: true, state: nextState, bytes: saved.bytes };
  }

  function downloadBlob(content, filename, type) {
    if (typeof document === "undefined" || typeof Blob === "undefined" || !global.URL) return false;
    const blob = new Blob([content], { type: type || "application/octet-stream" });
    const url = global.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    global.URL.revokeObjectURL(url);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Snapshot contracts, hashing and normalization
  // ---------------------------------------------------------------------------

  const COMPLETENESS_SECTIONS = Object.freeze([
    "project",
    "controller",
    "devices",
    "network",
    "firmware",
    "gui",
    "runtime",
    "diagnostics"
  ]);

  const COMPLETENESS_STATUSES = Object.freeze(["complete", "partial", "failed", "unknown"]);

  function normalizeText(value) {
    if (value === null || value === undefined || value === "") return null;
    return String(value).trim().replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeDisplay(value) {
    if (value === null || value === undefined || value === "") return null;
    return String(value).trim().replace(/\s+/g, " ");
  }

  function normalizeIp(value) {
    return normalizeDisplay(value);
  }

  function normalizeMac(value) {
    if (value === null || value === undefined || value === "") return null;
    const compact = String(value).toLowerCase().replace(/[^0-9a-f]/g, "");
    if (compact.length !== 12) return normalizeText(value);
    return compact.match(/.{2}/g).join(":");
  }

  function normalizeBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const text = normalizeText(value);
    if (["true", "yes", "on", "1", "enabled", "да", "vip"].includes(text)) return true;
    if (["false", "no", "off", "0", "disabled", "нет"].includes(text)) return false;
    return null;
  }

  function normalizeUnordered(value) {
    const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
    return values.map((item) => normalizeText(item) ?? "").sort();
  }

  function normalizeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function normalizeComparable(value) {
    if (Array.isArray(value)) return JSON.stringify(normalizeUnordered(value));
    if (typeof value === "boolean") return value;
    return normalizeText(value);
  }

  function makeField(rawValue, sourcePath, normalizer) {
    const normalize = normalizer || normalizeComparable;
    return {
      rawValue: rawValue === undefined ? null : deepClone(rawValue),
      normalizedValue: normalize(rawValue),
      sourcePath,
      quality: rawValue === undefined || rawValue === null ? "missing" : "valid"
    };
  }

  // ---------------------------------------------------------------------------
  // SR inventory and polling primitives
  // ---------------------------------------------------------------------------

  function normalizeSrHeader(value) {
    return normalizeText(value) || "";
  }

  function normalizeManufacturer(value) {
    const normalized = normalizeText(value);
    if (normalized === "huawey") return "huawei";
    if (normalized === "poly") return "polycom";
    return normalized;
  }

  function getSrValue(row, expectedHeader) {
    if (!isPlainObject(row)) return null;
    const expected = normalizeSrHeader(expectedHeader);
    const aliasGroup = Object.values(SR_FIELD_ALIASES).find((aliases) => aliases.some((alias) => normalizeSrHeader(alias) === expected));
    const candidates = aliasGroup || [expectedHeader];
    for (const candidate of candidates) {
      const key = Object.keys(row).find((header) => normalizeSrHeader(header) === normalizeSrHeader(candidate));
      if (key !== undefined) return row[key];
    }
    return null;
  }

  function missingSrRequiredHeaders(headers) {
    const normalized = new Set((headers || []).map(normalizeSrHeader));
    return SR_REQUIRED_FIELDS
      .filter((field) => !SR_FIELD_ALIASES[field].some((alias) => normalized.has(normalizeSrHeader(alias))))
      .map((field) => SR_FIELD_ALIASES[field][0]);
  }

  function normalizeSrCategoryValue(value) {
    if (value === null || value === undefined) return null;
    return normalizeText(String(value).replace(/[\u200B-\u200D\u2060\uFEFF]/g, ""));
  }

  function matchesSrCategoryRule(row, descriptor) {
    return normalizeSrCategoryValue(getSrValue(row, descriptor.srField)) === normalizeSrCategoryValue(descriptor.srValue);
  }

  function classifySrDevice(row) {
    const controllerDescriptor = EQUIPMENT_CATEGORY_CATALOG.find((item) => item.id === "controller");
    if (controllerDescriptor && matchesSrCategoryRule(row, controllerDescriptor)) return controllerDescriptor.id;
    const modelDescriptor = EQUIPMENT_CATEGORY_CATALOG.find((item) => item.id !== "controller"
      && normalizeSrHeader(item.srField) === normalizeSrHeader("Тип")
      && matchesSrCategoryRule(row, item));
    if (modelDescriptor) return modelDescriptor.id;
    const descriptor = EQUIPMENT_CATEGORY_CATALOG.find((item) => normalizeSrHeader(item.srField) !== normalizeSrHeader("Тип")
      && matchesSrCategoryRule(row, item));
    return descriptor?.id || "other";
  }

  function normalizeIpv4(value) {
    const display = normalizeDisplay(value);
    if (!display) return null;
    const parts = display.split(".");
    if (parts.length !== 4) return null;
    const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
    if (numbers.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    return numbers.join(".");
  }

  function parseRunFolderTimestamp(folderName) {
    const raw = normalizeDisplay(folderName) || "";
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/);
    if (!match) return { ok: false, capturedAt: null, error: "Имя папки должно соответствовать YYYY-MM-DD_HH-MM-SS" };
    const parts = match.slice(1).map(Number);
    const [year, month, day, hour, minute, second] = parts;
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    const valid = date.getFullYear() === year
      && date.getMonth() === month - 1
      && date.getDate() === day
      && date.getHours() === hour
      && date.getMinutes() === minute
      && date.getSeconds() === second;
    return valid
      ? { ok: true, capturedAt: date.toISOString(), source: "folder_name", error: null }
      : { ok: false, capturedAt: null, error: "Имя папки содержит некорректную календарную дату" };
  }

  function normalizePollingRelativePath(value) {
    return String(value || "")
      .replace(/\\/g, "/")
      .split("/")
      .filter((segment) => segment && segment !== ".")
      .join("/");
  }

  function groupPollingFilesByRunFolder(inputFiles) {
    const batchesByPath = new Map();
    const rejected = [];
    const ignored = [];
    for (const inputFile of inputFiles || []) {
      const name = String(inputFile?.name || "");
      const relativePath = normalizePollingRelativePath(inputFile?.relativePath || inputFile?.webkitRelativePath || name);
      const file = { ...inputFile, name: name || relativePath.split("/").pop() || "unknown", relativePath };
      if (file.name === "polling-recovery.json") {
        ignored.push({ ...file, reason: "Журнал восстановления опроса не является результатом устройства" });
        continue;
      }
      if (!/\.json$/i.test(file.name)) {
        ignored.push({ ...file, reason: "Файл не является JSON" });
        continue;
      }
      const segments = relativePath.split("/").filter(Boolean);
      const directories = segments.slice(0, -1);
      let folderIndex = -1;
      let timestamp = null;
      for (let index = directories.length - 1; index >= 0; index -= 1) {
        const parsed = parseRunFolderTimestamp(directories[index]);
        if (parsed.ok) {
          folderIndex = index;
          timestamp = parsed;
          break;
        }
      }
      if (folderIndex < 0 || !timestamp) {
        rejected.push({ ...file, reason: "JSON находится вне папки формата YYYY-MM-DD_HH-MM-SS" });
        continue;
      }
      const folderPath = directories.slice(0, folderIndex + 1).join("/");
      if (!batchesByPath.has(folderPath)) {
        batchesByPath.set(folderPath, {
          folderName: directories[folderIndex],
          folderPath,
          capturedAt: timestamp.capturedAt,
          capturedAtSource: timestamp.source,
          files: []
        });
      }
      batchesByPath.get(folderPath).files.push(file);
    }
    const batches = [...batchesByPath.values()]
      .map((batch) => ({ ...batch, files: [...batch.files].sort((left, right) => left.relativePath.localeCompare(right.relativePath, "ru")) }))
      .sort((left, right) => new Date(left.capturedAt) - new Date(right.capturedAt) || left.folderPath.localeCompare(right.folderPath, "ru"));
    return { batches, rejected, ignored };
  }

  function parsePollingFilenameIp(filename) {
    const safeName = normalizeDisplay(filename) || "";
    const basename = safeName.replace(/^.*[\\/]/, "").replace(/\.json$/i, "").trim();
    const ip = normalizeIpv4(basename);
    return ip
      ? { ok: true, ip, error: null }
      : { ok: false, ip: null, error: "Имя JSON не содержит корректный IPv4" };
  }

  function getCaseInsensitive(object, expectedKey) {
    if (!isPlainObject(object)) return undefined;
    const expected = normalizeText(expectedKey);
    const key = Object.keys(object).find((candidate) => normalizeText(candidate) === expected);
    return key === undefined ? undefined : object[key];
  }

  function detectExtronJsonDeviceType(payload) {
    const blocks = getCaseInsensitive(payload, "webBlocks");
    const projectInfo = getCaseInsensitive(blocks, "Project Info");
    const controllerType = normalizeText(getCaseInsensitive(projectInfo, "Controller Type"));
    if (controllerType === "primary controller") return "controller";
    if (controllerType === "tlp") return "panel";
    return "unknown";
  }

  function extractPollingInternalIpEvidence(payload) {
    if (!isPlainObject(payload)) return { internalIp: null, internalIps: [], evidence: [] };
    const blocks = getCaseInsensitive(payload, "webBlocks");
    const lanSettings = getCaseInsensitive(blocks, "LAN Settings");
    const candidates = [
      { path: "$.ip", rawValue: getCaseInsensitive(payload, "ip") },
      { path: "$.webBlocks['LAN Settings']['IP Address']", rawValue: getCaseInsensitive(lanSettings, "IP Address") }
    ];
    const evidence = candidates
      .filter((item) => item.rawValue !== undefined && item.rawValue !== null && String(item.rawValue).trim() !== "")
      .map((item) => ({ ...item, ipNormalized: normalizeIpv4(item.rawValue) }));
    const internalIps = [...new Set(evidence.map((item) => item.ipNormalized).filter(Boolean))];
    return { internalIp: internalIps.length === 1 ? internalIps[0] : null, internalIps, evidence };
  }

  function addPollingIpIndexValue(index, ip, device) {
    if (!ip) return;
    if (!index.has(ip)) index.set(ip, []);
    const values = index.get(ip);
    if (!values.includes(device)) values.push(device);
  }

  function createPollingInventoryIndexes(devices) {
    const currentInventoryByIp = new Map();
    const historicalInventoryByIp = new Map();
    for (const device of devices || []) {
      if (device.inCurrentSr !== false && device.ipNormalized) addPollingIpIndexValue(currentInventoryByIp, device.ipNormalized, device);
      for (const historicalIp of new Set(device.ipHistory || [])) {
        if (historicalIp && historicalIp !== device.ipNormalized) addPollingIpIndexValue(historicalInventoryByIp, historicalIp, device);
      }
    }
    return { currentInventoryByIp, historicalInventoryByIp };
  }

  function resolvePollingInventoryMatch(input) {
    const filenameIp = input?.filenameIp || null;
    const currentCandidates = Array.isArray(input?.currentCandidates) ? input.currentCandidates : [];
    const historicalCandidates = Array.isArray(input?.historicalCandidates) ? input.historicalCandidates : [];
    const detectedCategory = input?.detectedCategory || "unknown";
    const internal = extractPollingInternalIpEvidence(input?.payload);
    const historicalCandidateDeviceIds = [...new Set(historicalCandidates.map((device) => device.id).filter(Boolean))];
    const internalIpConflict = internal.internalIps.length > 1
      || Boolean(filenameIp && internal.internalIps.some((ip) => ip !== filenameIp));
    const base = {
      device: null,
      currentCandidates,
      historicalCandidateDeviceIds,
      detectedCategory,
      internalIp: internal.internalIp,
      internalIps: internal.internalIps,
      internalIpEvidence: internal.evidence
    };
    if (internalIpConflict) return { ...base, matchStatus: "ip_conflict", reason: "polling_ip_conflict" };
    if (!filenameIp || !currentCandidates.length) return { ...base, matchStatus: "unmatched", reason: "unmatched_ip" };
    let candidates = currentCandidates;
    if (candidates.length > 1 && detectedCategory !== "unknown") {
      const categoryCandidates = candidates.filter((device) => device.category === detectedCategory);
      if (categoryCandidates.length === 1) candidates = categoryCandidates;
    }
    if (candidates.length !== 1) return { ...base, currentCandidates: candidates, matchStatus: "ambiguous", reason: "ambiguous_ip" };
    const candidate = candidates[0];
    if (detectedCategory !== "unknown" && candidate.category !== detectedCategory) {
      return { ...base, currentCandidates: candidates, matchStatus: "category_conflict", reason: "classification_conflict" };
    }
    return { ...base, currentCandidates: candidates, device: candidate, matchStatus: "matched", reason: null };
  }

  function pollingMatchIssueInput(match, filenameIp) {
    if (!match || match.matchStatus === "matched") return null;
    const candidateIds = match.currentCandidates.map((device) => device.id);
    const details = {
      filenameIp: filenameIp || null,
      internalIps: match.internalIps,
      internalIpEvidence: match.internalIpEvidence,
      candidateIds,
      historicalCandidateDeviceIds: match.historicalCandidateDeviceIds,
      jsonCategory: match.detectedCategory,
      srCategories: [...new Set(match.currentCandidates.map((device) => device.category))]
    };
    if (match.matchStatus === "ip_conflict") return { kind: "polling_ip_conflict", message: "IP имени файла не совпадает с подтверждённым IP внутри JSON", details };
    if (match.matchStatus === "category_conflict") return { kind: "classification_conflict", message: "Класс оборудования JSON не совпадает с классом текущего устройства SR", details };
    if (match.matchStatus === "ambiguous") return { kind: "ambiguous_ip", message: `IP ${filenameIp || "не определён"} соответствует нескольким текущим устройствам SR`, details };
    return { kind: "unmatched_ip", message: filenameIp ? `Текущий IP ${filenameIp} не найден в актуальной SR` : "IP отсутствует", details };
  }

  function derivePollingStatus(payload) {
    const failedStage = normalizeText(getCaseInsensitive(payload, "failedStage"));
    const explicitError = normalizeText(getCaseInsensitive(payload, "error"));
    const ping = getCaseInsensitive(payload, "ping");
    const pingOk = isPlainObject(ping) && typeof getCaseInsensitive(ping, "ok") === "boolean"
      ? getCaseInsensitive(ping, "ok")
      : null;
    let pingStatus = "unknown";
    if (failedStage === "ping" && pingOk === false) pingStatus = "failed";
    else if (pingOk === true) pingStatus = "ok";
    const explicitOk = getCaseInsensitive(payload, "ok");
    const authFailure = explicitError === "no credentials were accepted"
      || (["authorization", "authentication", "auth"].includes(failedStage) && explicitOk === false);
    let pollStatus = "unknown";
    if (authFailure) pollStatus = "authorization_error";
    else if (pingStatus === "failed") pollStatus = "network_unreachable";
    else if (explicitOk === true) pollStatus = "success";
    else if (explicitOk === false) pollStatus = "processing_error";
    return {
      pollStatus,
      pingStatus,
      authorizationStatus: authFailure ? "failed" : "unknown",
      authorizationEvidence: explicitError === "no credentials were accepted" ? "extron_no_credentials_accepted" : authFailure ? "failed_stage" : null,
      rebootCount: null,
      gcPlus: null
    };
  }

  function scopePollingStatusToInventory(status, device) {
    if (status?.pollStatus !== "authorization_error") return status;
    const supportedScope = device && (
      normalizeManufacturer(device.manufacturerNormalized || device.manufacturerRaw) === "extron"
      || resolvePollingCapability(device).support === "implemented"
    );
    if (supportedScope) return status;
    return { ...status, pollStatus: "processing_error", authorizationStatus: "unknown", authorizationEvidence: null };
  }

  function resolvePollingResultTimestamp(input) {
    const lastModified = Number(input?.lastModified);
    if (Number.isFinite(lastModified) && lastModified > 0) {
      const date = new Date(lastModified);
      if (Number.isFinite(date.getTime())) return { capturedAt: date.toISOString(), source: "file_last_modified", sourceLastModified: lastModified };
    }
    return { capturedAt: null, source: "unavailable", sourceLastModified: null };
  }

  function resolvePollingObservationTimestamp(payload, resultTimestamp) {
    const uptimeObservedAt = normalizeDate(getCaseInsensitive(payload, "uptimeObservedAt"));
    if (uptimeObservedAt) {
      return { observationAt: uptimeObservedAt, source: "payload_uptime_observed_at", confidence: "confirmed", uncertaintyMs: 1000 };
    }
    const payloadCapturedAt = normalizeDate(getCaseInsensitive(payload, "capturedAt"));
    if (payloadCapturedAt) {
      return { observationAt: payloadCapturedAt, source: "payload_captured_at", confidence: "confirmed", uncertaintyMs: 1000 };
    }
    const fallback = normalizeDate(resultTimestamp?.capturedAt);
    if (fallback) {
      return { observationAt: fallback, source: resultTimestamp.source || "file_last_modified", confidence: "limited", uncertaintyMs: 1000 };
    }
    return { observationAt: null, source: "unavailable", confidence: "unknown", uncertaintyMs: null };
  }

  function resolvePollingCapability(device) {
    const category = normalizeText(device && device.category);
    const manufacturerNormalized = normalizeManufacturer(device && (device.manufacturerNormalized || device.manufacturerRaw));
    const modelNormalized = normalizeText(device && (device.modelNormalized || device.modelRaw || device.model));
    const descriptor = POLLING_ADAPTERS.find((item) => item.category === category
      && item.manufacturerNormalized === manufacturerNormalized
      && (!item.modelNormalized || normalizeText(item.modelNormalized) === modelNormalized));
    if (descriptor) return deepClone(descriptor);
    return {
      key: null,
      category,
      manufacturerNormalized,
      modelNormalized,
      support: category && manufacturerNormalized ? "not_implemented" : "unknown",
      transport: null,
      normalizerKey: null,
      credentialMode: "not_configured"
    };
  }

  function normalizeMacLoose(value) {
    const normalized = normalizeMac(value);
    return normalized || null;
  }

  function stableJsonValue(value) {
    if (Array.isArray(value)) return value.map(stableJsonValue);
    if (!isPlainObject(value)) return typeof value === "string" ? value.trim() : value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJsonValue(value[key])]));
  }

  function projectPolycomSetting(key, supplied) {
    const value = getCaseInsensitive(supplied, "value");
    const source = String(getCaseInsensitive(supplied, "source") || "");
    const binary = ["enabled", "disabled"];
    const oneName = (name) => `POST /rest/config:${name}`;
    if (key === "telnet" && source === oneName("security.remoteaccess.telnet.enabled") && binary.includes(value)) return { status: "read", value, source };
    if (key === "autoUpdate" && source === oneName("softupdate.pollingenabled") && binary.includes(value)) return { status: "read", value, source };
    if (key === "http" && source === oneName("security.remoteaccess.web.enabled,security.remoteaccess.web.httpsonly,security.remoteaccess.web.httpport")
      && getCaseInsensitive(supplied, "meaning") === "web_http_allowed"
      && typeof getCaseInsensitive(supplied, "webAccessEnabled") === "boolean"
      && typeof getCaseInsensitive(supplied, "httpsOnly") === "boolean"
      && Number.isSafeInteger(getCaseInsensitive(supplied, "configuredPort"))
      && getCaseInsensitive(supplied, "configuredPort") >= 1 && getCaseInsensitive(supplied, "configuredPort") <= 65535
      && value === (supplied.webAccessEnabled && !supplied.httpsOnly ? "enabled" : "disabled")) {
      return { status: "read", value, source, webAccessEnabled: supplied.webAccessEnabled, httpsOnly: supplied.httpsOnly,
        configuredPort: supplied.configuredPort, meaning: "web_http_allowed" };
    }
    if (key === "snmpV2" && source === oneName("management.snmp.enabled,management.snmp.versiontwo")
      && typeof getCaseInsensitive(supplied, "serviceEnabled") === "boolean"
      && typeof getCaseInsensitive(supplied, "configuredEnabled") === "boolean"
      && value === (supplied.serviceEnabled && supplied.configuredEnabled ? "enabled" : "disabled")) {
      return { status: "read", value, source, serviceEnabled: supplied.serviceEnabled, configuredEnabled: supplied.configuredEnabled };
    }
    if (key === "autoAnswer" && source === oneName("comm.callsetting.callfeatures.autoanswer.answersinglecall,comm.callsetting.callfeatures.autoanswer.answermultipointcall") && isPlainObject(value)) {
      const pointToPoint = getCaseInsensitive(value, "pointToPoint");
      const multipoint = getCaseInsensitive(value, "multipoint");
      const allowed = ["enabled", "disabled", null];
      if (!allowed.includes(pointToPoint) || !allowed.includes(multipoint) || (pointToPoint === null && multipoint === null)) return null;
      const missing = [pointToPoint === null ? "pointToPoint" : null, multipoint === null ? "multipoint" : null].filter(Boolean);
      const declared = getCaseInsensitive(supplied, "unconfirmedFields");
      if (missing.length && (!Array.isArray(declared) || JSON.stringify(declared) !== JSON.stringify(missing))) return null;
      return { status: "read", value: { pointToPoint, multipoint }, source, ...(missing.length ? { unconfirmedFields: missing } : {}) };
    }
    if (key === "ntp" && source === oneName("time.timeserver.mode,time.timeserver.address,time.timeserver.address1") && isPlainObject(value)
      && value.enabled === true && value.mode === "manual" && value.modeCode === "Manual") {
      const primary = getCaseInsensitive(value, "primaryServer");
      const secondary = getCaseInsensitive(value, "secondaryServer");
      const safeServer = (server, allowEmpty) => server === null || (typeof server === "string" && server.length <= 255
        && (allowEmpty || server.length > 0) && !/[\u0000-\u001f]/.test(server));
      if (!safeServer(primary, false) || !safeServer(secondary, true) || (primary === null && secondary === null)) return null;
      const missing = [primary === null ? "primaryServer" : null, secondary === null ? "secondaryServer" : null].filter(Boolean);
      const declared = getCaseInsensitive(supplied, "unconfirmedFields");
      if (missing.length && (!Array.isArray(declared) || JSON.stringify(declared) !== JSON.stringify(missing))) return null;
      return { status: "read", value: { enabled: true, mode: "manual", modeCode: "Manual", primaryServer: primary, secondaryServer: secondary },
        source, ...(missing.length ? { unconfirmedFields: missing } : {}) };
    }
    if (key === "ssh" && ["enabled", "disabled"].includes(value)
      && getCaseInsensitive(supplied, "ruleVersion") === "polycom-ssh-source-priority-v1") {
      const basis = getCaseInsensitive(supplied, "basis");
      const meaning = getCaseInsensitive(supplied, "meaning");
      if (basis === "legacy_api_fallback" && meaning === "ssh_audit_proxy"
        && source === oneName("security.remoteaccess.ssh.enabled")) {
        return { status: "read", value, source, basis, meaning, ruleVersion: "polycom-ssh-source-priority-v1" };
      }
      const direct = /^POST \/rest\/config:((?:security|system)\.[a-z0-9._-]{5,120})$/.exec(source);
      if (basis === "ssh_service_direct" && meaning === "ssh_service_setting" && direct
        && direct[1].includes("ssh") && direct[1] !== "security.remoteaccess.ssh.enabled"
        && !/(?:password|secret|private|community|key)/.test(direct[1])
        && getCaseInsensitive(supplied, "validationStatus") === "provisional_user_validation") {
        return { status: "read", value, source, basis, meaning, ruleVersion: "polycom-ssh-source-priority-v1" };
      }
    }
    if (key === "ssh" && source === oneName("security.remoteaccess.ssh.enabled") && getCaseInsensitive(supplied, "meaning") === "legacy_api_over_ssh_only"
      && isPlainObject(value) && typeof value.legacyApiOverSshEnabled === "boolean" && value.sshServiceEnabled === null
      && JSON.stringify(getCaseInsensitive(supplied, "unconfirmedFields")) === JSON.stringify(["sshServiceEnabled"])) {
      return { status: "read", value: { legacyApiOverSshEnabled: value.legacyApiOverSshEnabled, sshServiceEnabled: null }, source,
        meaning: "legacy_api_over_ssh_only", unconfirmedFields: ["sshServiceEnabled"] };
    }
    if (key === "powerManagement" && source === oneName("system.remote.hangupkeylongpressfunc")
      && getCaseInsensitive(supplied, "meaning") === "remote_hangup_long_press" && isPlainObject(value)
      && value.hangupLongPressAction === "power_off" && value.actionCode === "Power_Off" && value.sleepMode === null
      && JSON.stringify(getCaseInsensitive(supplied, "unconfirmedFields")) === JSON.stringify(["sleepMode"])) {
      return { status: "read", value: { hangupLongPressAction: "power_off", actionCode: "Power_Off", sleepMode: null }, source,
        meaning: "remote_hangup_long_press", unconfirmedFields: ["sleepMode"] };
    }
    return null;
  }

  function pollingPayloadProjection(payload) {
    if (!isPlainObject(payload)) return {};
    const projected = {
      ok: getCaseInsensitive(payload, "ok") ?? null,
      adapterKey: typeof getCaseInsensitive(payload, "adapterKey") === "string" ? getCaseInsensitive(payload, "adapterKey").slice(0, 128) : null,
      failedStage: getCaseInsensitive(payload, "failedStage") ?? null,
      ping: getCaseInsensitive(payload, "ping") ?? null,
      webInterface: getCaseInsensitive(payload, "webInterface") ?? null,
      webBlocks: getCaseInsensitive(payload, "webBlocks") ?? null
    };
    const observedModel = auditModelToken(getCaseInsensitive(getCaseInsensitive(projected.webBlocks, "Device Info"), "Model"));
    const boxModelExact = (projected.adapterKey === "vcs/huawei/box310" && observedModel === "box310")
      || (projected.adapterKey === "vcs/huawei/box610" && observedModel === "box610");
    const siteName = getCaseInsensitive(payload, "siteName");
    if (siteName !== undefined) {
      const read = isPlainObject(siteName) && normalizeText(getCaseInsensitive(siteName, "status")) === "read";
      const value = read ? normalizedSiteName(getCaseInsensitive(siteName, "value")) : null;
      const siteValidation = boxModelExact ? getCaseInsensitive(siteName, "validationStatus") : null;
      projected.siteName = boxModelExact && read && value && siteValidation === "confirmed_user_validation"
        ? { status: "read", value, validationStatus: "confirmed_user_validation" }
        : boxModelExact && read && value
          ? { status: "provisional", value, validationStatus: "provisional_user_validation" }
          : { status: read && value ? "read" : "unavailable", value };
    } else if (boxModelExact) projected.siteName = { status: "unavailable", value: null };
    const settingKeys = ["telnet", "http", "snmpV2", "autoUpdate", "autoAnswer", "ntp", "wifi", "ssh", "powerManagement"];
    const suppliedSettings = getCaseInsensitive(payload, "deviceSettings");
    const suppliedFields = getCaseInsensitive(suppliedSettings, "fields");
    const te20SettingsConfirmed = projected.adapterKey === "vcs/huawei/te20-legacy"
      && auditModelToken(getCaseInsensitive(getCaseInsensitive(projected.webBlocks, "Device Info"), "Model")) === "te20";
    const teFamilySettingsConfirmed = projected.adapterKey === "vcs/huawei/te-family"
      && ["te30", "te40", "te50", "te60"].includes(auditModelToken(getCaseInsensitive(getCaseInsensitive(projected.webBlocks, "Device Info"), "Model")));
    const bar310SettingsConfirmed = projected.adapterKey === "vcs/huawei/bar310"
      && auditModelToken(getCaseInsensitive(getCaseInsensitive(projected.webBlocks, "Device Info"), "Model")) === "bar310";
    const bar300SettingsConfirmed = projected.adapterKey === "vcs/huawei/bar300" && observedModel === "bar300";
    const box300SettingsExact = (projected.adapterKey === "vcs/huawei/box300" && observedModel === "box300")
      || (projected.adapterKey === "vcs/huawei/box600" && observedModel === "box600");
    const box300SettingsValidation = box300SettingsExact ? getCaseInsensitive(suppliedSettings, "validationStatus") : null;
    const box300SettingsAccepted = ["provisional_user_validation", "confirmed_user_validation"].includes(box300SettingsValidation);
    const exact300SettingsRead = bar300SettingsConfirmed || box300SettingsAccepted;
    const boxSettingsValidation = boxModelExact ? getCaseInsensitive(suppliedSettings, "validationStatus") : null;
    const boxSettingsAccepted = ["provisional_user_validation", "confirmed_user_validation"].includes(boxSettingsValidation);
    const polycomModel = ["group300", "group310", "group500", "group700"].includes(observedModel) ? observedModel : null;
    const polycomVendor = getCaseInsensitive(payload, "vendorPolling");
    const polycomValidation = getCaseInsensitive(suppliedSettings, "validationStatus");
    const polycomVendorEvidence = getCaseInsensitive(polycomVendor, "evidenceStatus");
    const polycomSettingsAccepted = Boolean(polycomModel
      && projected.adapterKey === `vcs/polycom/${polycomModel}`
      && getCaseInsensitive(polycomVendor, "contract") === `polycom-${polycomModel}-web-v1`
      && auditModelToken(getCaseInsensitive(polycomVendor, "model")) === polycomModel
      && ["provisional_user_validation", "confirmed_user_validation"].includes(polycomVendorEvidence)
      && (polycomModel === "group300" || polycomVendorEvidence === "confirmed_user_validation")
      && auditModelToken(getCaseInsensitive(suppliedSettings, "model")) === polycomModel
      && ["provisional_user_validation", "confirmed_user_validation"].includes(polycomValidation)
      && (polycomValidation !== "confirmed_user_validation" || polycomVendorEvidence === "confirmed_user_validation")
      && getCaseInsensitive(payload, "ok") === true);
    const projectedFields = {};
    const approvedReadSources = {
      telnet: new Set(["WEB_GetCfgParamAPI:enabletelnet", "managementActions.after.telnetPort23"]),
      http: new Set(["WEB_GetCfgParamAPI:enable_http", "POST /v1/om/config:enable_http", "managementActions.after.httpPort80"]),
      ssh: new Set(["WEB_GetCfgParamAPI:enable_ssh", "POST /v1/om/config:enable_ssh"]),
      autoUpdate: new Set(["WEB_GetCfgParamAPI:isenableautoupgrade"]),
      autoAnswer: new Set(["WEB_GetCfgParamAPI:autoreply", "POST /v1/om/config:autoreply"]),
      snmpV2: new Set(["WEB_GetSnmpCfgAPI:snmpv2,IsEnableSnmp"])
    };
    for (const key of settingKeys) {
      const supplied = getCaseInsensitive(suppliedFields, key);
      const status = normalizeText(getCaseInsensitive(supplied, "status"));
      const value = getCaseInsensitive(supplied, "value");
      const source = String(getCaseInsensitive(supplied, "source") || "");
      const exact310SettingsRead = bar310SettingsConfirmed || (boxSettingsAccepted && getCaseInsensitive(supplied, "validationStatus") === boxSettingsValidation);
      const polycomFieldValidation = getCaseInsensitive(supplied, "validationStatus");
      const directSshProvisional = key === "ssh" && polycomValidation === "confirmed_user_validation"
        && polycomFieldValidation === "provisional_user_validation" && getCaseInsensitive(supplied, "basis") === "ssh_service_direct";
      if (polycomSettingsAccepted && status === "read" && (polycomFieldValidation === polycomValidation || directSshProvisional)) {
        const polycomField = projectPolycomSetting(key, supplied);
        if (polycomField) projectedFields[key] = { ...polycomField, validationStatus: polycomFieldValidation };
      } else if (key === "autoUpdate" && exact310SettingsRead && status === "read" && ["enabled", "disabled"].includes(value)
        && ["GET /v1/om/config/service:serverType", "GET /v1/om/config/service+auto-config:serverType"].includes(source)
        && getCaseInsensitive(supplied, "basis") === "server_type_audit_rule"
        && getCaseInsensitive(supplied, "ruleVersion") === "bar310-server-type-audit-v1") {
        projectedFields[key] = { status: "read", value, source, basis: "server_type_audit_rule", ruleVersion: "bar310-server-type-audit-v1", meaning: "firmware_update_capability" };
      } else if (key === "autoUpdate" && exact300SettingsRead && status === "read"
        && source === "WEB_GetCfgParamAPI:cloudType"
        && [2, 5, 6, 7, 8, 10, 11].includes(getCaseInsensitive(supplied, "serverTypeCode"))
        && value === (getCaseInsensitive(supplied, "serverTypeCode") === 7 ? "disabled" : "enabled")
        && getCaseInsensitive(supplied, "basis") === "server_type_audit_rule"
        && getCaseInsensitive(supplied, "ruleVersion") === "bar300-cloud-type-audit-v1"
        && getCaseInsensitive(supplied, "meaning") === "firmware_update_capability") {
        projectedFields[key] = { status: "read", value, source, serverTypeCode: getCaseInsensitive(supplied, "serverTypeCode"),
          basis: "server_type_audit_rule", ruleVersion: "bar300-cloud-type-audit-v1", meaning: "firmware_update_capability" };
      } else if (status === "read" && approvedReadSources[key]?.has(source) && ["enabled", "disabled"].includes(value)
        && ((key === "http" && (te20SettingsConfirmed || teFamilySettingsConfirmed || bar310SettingsConfirmed || boxModelExact || exact300SettingsRead))
          || (key === "telnet" && (te20SettingsConfirmed || teFamilySettingsConfirmed || exact300SettingsRead))
          || (te20SettingsConfirmed && !["http", "telnet"].includes(key))
          || (teFamilySettingsConfirmed && ["ssh", "autoUpdate", "autoAnswer", "snmpV2"].includes(key))
          || (exact300SettingsRead && ["ssh", "autoAnswer"].includes(key))
          || (exact310SettingsRead && ["ssh", "autoAnswer"].includes(key)))) {
        projectedFields[key] = { status: "read", value, source };
        if (key === "snmpV2" && teFamilySettingsConfirmed) {
          if (typeof getCaseInsensitive(supplied, "configuredEnabled") !== "boolean" || typeof getCaseInsensitive(supplied, "serviceEnabled") !== "boolean" || value !== (supplied.configuredEnabled && supplied.serviceEnabled ? "enabled" : "disabled")) {
            delete projectedFields[key];
          } else {
            projectedFields[key].configuredEnabled = supplied.configuredEnabled;
            projectedFields[key].serviceEnabled = supplied.serviceEnabled;
          }
        }
      } else if (status === "read" && (te20SettingsConfirmed || teFamilySettingsConfirmed || exact300SettingsRead) && key === "ntp" && source === "WEB_GetCfgParamAPI:synSerTime,ntpGetMode,timeServer" && isPlainObject(value) && typeof value.enabled === "boolean" && [0, 1].includes(value.modeCode) && typeof value.server === "string" && value.server.length <= 255 && !/[\u0000-\u001f]/.test(value.server)) {
        projectedFields[key] = { status: "read", value: { enabled: value.enabled, modeCode: value.modeCode, mode: value.modeCode === 1 ? "manual" : "automatic", server: value.server }, source };
      } else if (status === "read" && exact310SettingsRead && key === "ntp" && source === "POST /v1/om/config:synSerTime,ntpGetMode,ntpServerAddr" && isPlainObject(value) && typeof value.enabled === "boolean" && [0, 1].includes(value.modeCode) && typeof value.server === "string" && value.server.length <= 255 && !/[\u0000-\u001f]/.test(value.server)) {
        projectedFields[key] = { status: "read", value: { enabled: value.enabled, modeCode: value.modeCode, mode: value.modeCode === 1 ? "manual" : "automatic", server: value.server }, source };
      } else if (status === "read" && (teFamilySettingsConfirmed || exact300SettingsRead) && key === "wifi" && source === "WEB_GetWifiStatModeAPI:ucWifiMode" && isPlainObject(value) && [0, 1, 2, 3].includes(value.modeCode) && value.clientEnabled === [2, 3].includes(value.modeCode) && value.accessPointEnabled === [1, 3].includes(value.modeCode)) {
        projectedFields[key] = { status: "read", value: { modeCode: value.modeCode, clientEnabled: value.clientEnabled, accessPointEnabled: value.accessPointEnabled }, source };
      } else if (status === "read" && exact310SettingsRead && key === "wifi" && source === "POST /v1/om/config:enableWifi,apEnable,isWifiPriority" && isPlainObject(value) && typeof value.clientEnabled === "boolean" && typeof value.accessPointEnabled === "boolean" && typeof value.preferredNetworkEnabled === "boolean") {
        projectedFields[key] = { status: "read", value: { clientEnabled: value.clientEnabled, accessPointEnabled: value.accessPointEnabled, preferredNetworkEnabled: value.preferredNetworkEnabled }, source };
      } else if (status === "read" && exact300SettingsRead && key === "powerManagement" && isPlainObject(value) && [0, 1, 5, 10, 15, 30, 60].includes(value.sleepTimeCode) && value.sleepMode === (value.sleepTimeCode === 0 ? "never" : "interval")) {
        const switches = [["enable_wol", "networkWakeEnabled", "networkWake"], ["faceWakeUp", "faceWakeEnabled", "faceWake"],
          ["sleepCloseAPP", "clearMemoryInSleepEnabled", "clearMemoryInSleep"], ["autoReboot", "automaticRestartEnabled", "automaticRestart"]];
        const present = switches.filter(([, property]) => typeof value[property] === "boolean");
        const expectedSource = `WEB_GetCfgParamAPI:sleepTime${present.map(([id]) => `,${id}`).join("")}`;
        if (source === expectedSource) {
          const power = { sleepTimeCode: value.sleepTimeCode, sleepMode: value.sleepMode };
          for (const [, property] of present) power[property] = value[property];
          projectedFields[key] = { status: "read", value: power, source,
            unconfirmedFields: [ ...switches.filter(([, property]) => typeof value[property] !== "boolean").map(([, , unknown]) => unknown),
              ...(power.automaticRestartEnabled === true ? ["automaticRestartIntervalDays"] : []) ] };
        }
      } else if (status === "read" && teFamilySettingsConfirmed && key === "powerManagement" && source === "WEB_GetCfgParamAPI:sleepTime" && isPlainObject(value) && ["never", "interval"].includes(value.sleepMode) && Number.isInteger(value.sleepTimeCode) && value.sleepTimeCode >= 0 && value.sleepTimeCode <= 100000 && value.sleepMode === (value.sleepTimeCode === 0 ? "never" : "interval")) {
        const power = { sleepMode: value.sleepMode, sleepTimeCode: value.sleepTimeCode };
        if (typeof value.shutDownEnabled === "boolean") power.shutDownEnabled = value.shutDownEnabled;
        for (const key of ["scheduledPowerOn", "scheduledPowerOff"]) {
          const schedule = value[key];
          if (!isPlainObject(schedule) || typeof schedule.enabled !== "boolean") continue;
          if (schedule.enabled === false && schedule.time === null) power[key] = { enabled: false, time: null };
          else if (schedule.enabled === true && typeof schedule.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) power[key] = { enabled: true, time: schedule.time };
          else if (schedule.enabled === true && schedule.time === null && schedule.status === "unavailable") power[key] = { enabled: true, time: null, status: "unavailable" };
        }
        projectedFields[key] = { status: "read", value: power, source };
      } else if (status === "read" && te20SettingsConfirmed && key === "powerManagement" && ["WEB_GetCfgParamAPI:sleepTime,enableTimeReboot", "WEB_GetCfgParamAPI:sleepTime,enableTimeReboot,suppotReboot,rebootHour,rebootMinute"].includes(source) && isPlainObject(value) && ["never", "interval"].includes(value.sleepMode) && Number.isInteger(value.sleepTimeCode) && value.sleepTimeCode >= 0 && value.sleepTimeCode <= 100000 && [0, 1].includes(value.scheduledRestartCode)) {
        const projectedPower = { sleepMode: value.sleepMode, sleepTimeCode: value.sleepTimeCode, scheduledRestartCode: value.scheduledRestartCode };
        if (source.endsWith("suppotReboot,rebootHour,rebootMinute") && typeof value.shutdownRestartEnabled === "boolean" && Number.isInteger(value.restartHour) && value.restartHour >= 0 && value.restartHour <= 23 && Number.isInteger(value.restartMinute) && value.restartMinute >= 0 && value.restartMinute <= 59) {
          Object.assign(projectedPower, { shutdownRestartEnabled: value.shutdownRestartEnabled, restartHour: value.restartHour, restartMinute: value.restartMinute });
        }
        projectedFields[key] = { status: "read", value: projectedPower, source };
      } else if (status === "read" && exact310SettingsRead && key === "powerManagement" && source === "POST /v1/om/config:suppotReboot,sleepTime,autoReboot,sleepCloseAPP,autoRebootVal,savePowerMode" && isPlainObject(value) && [0, 1, 5, 10, 15, 30, 60].includes(value.sleepTimeCode) && value.sleepMode === (value.sleepTimeCode === 0 ? "never" : "interval") && ["shutdownRestartEnabled", "automaticRestartEnabled", "clearMemoryInSleepEnabled", "energySavingEnabled"].every((field) => typeof value[field] === "boolean") && Number.isInteger(value.automaticRestartIntervalDays) && value.automaticRestartIntervalDays >= 0 && value.automaticRestartIntervalDays <= 3650) {
        projectedFields[key] = { status: "read", value: { shutdownRestartEnabled: value.shutdownRestartEnabled, sleepMode: value.sleepMode, sleepTimeCode: value.sleepTimeCode, automaticRestartEnabled: value.automaticRestartEnabled, automaticRestartIntervalDays: value.automaticRestartIntervalDays, clearMemoryInSleepEnabled: value.clearMemoryInSleepEnabled, energySavingEnabled: value.energySavingEnabled }, source, unconfirmedFields: ["scheduledPowerOn", "scheduledPowerOff", "clearMemoryAfterRestart"] };
      } else if (["protocol_required", "unavailable", "not_exposed"].includes(status)) {
        projectedFields[key] = { status, value: null };
        if ((te20SettingsConfirmed || exact300SettingsRead) && key === "snmpV2" && status === "not_exposed" && getCaseInsensitive(supplied, "reason") === "version_not_supported") {
          projectedFields[key].reason = "version_not_supported";
        }
        if (te20SettingsConfirmed && key === "wifi" && status === "not_exposed" && getCaseInsensitive(supplied, "reason") === "capability_absent") {
          projectedFields[key].reason = "capability_absent";
        }
      }
      if (boxSettingsAccepted && key !== "http" && projectedFields[key]?.status === "read") projectedFields[key].validationStatus = boxSettingsValidation;
      if (box300SettingsExact && projectedFields[key]?.status === "read") {
        if (getCaseInsensitive(supplied, "validationStatus") === box300SettingsValidation && box300SettingsAccepted) {
          projectedFields[key].validationStatus = box300SettingsValidation;
        } else delete projectedFields[key];
      }
    }
    if (getCaseInsensitive(payload, "ok") === true && ["vcs/huawei/te20-legacy", "vcs/huawei/te-family", "vcs/huawei/bar310", "vcs/huawei/box310", "vcs/huawei/box610"].includes(projected.adapterKey)) {
      const actions = getCaseInsensitive(payload, "managementActions");
      const verified = Array.isArray(actions) ? actions.find((item) => getCaseInsensitive(item, "id") === "disable_insecure_management_services" && ["applied", "already_compliant"].includes(normalizeText(getCaseInsensitive(item, "status")))) : null;
      const after = getCaseInsensitive(verified, "after");
      for (const [key, legacyKey] of [["telnet", "telnetPort23"], ["http", "httpPort80"]]) {
        if (projectedFields[key]?.status === "read") continue;
        const legacyValue = normalizeText(getCaseInsensitive(after, legacyKey));
        if (["enabled", "disabled"].includes(legacyValue)) projectedFields[key] = { status: "read", value: legacyValue, source: `managementActions.after.${legacyKey}` };
      }
    }
    if (Object.keys(projectedFields).length) projected.deviceSettings = { fields: projectedFields,
      ...(boxSettingsAccepted ? { validationStatus: boxSettingsValidation } : {}),
      ...(polycomSettingsAccepted ? { validationStatus: polycomValidation } : {}) };
    return stableJsonValue(projected);
  }

  function normalizedSiteName(value) {
    if (typeof value !== "string") return null;
    const name = value.trim();
    return name && name.length <= 1024 && !/[\u0000-\u001f]/.test(name) ? name : null;
  }

  function siteNameFromPollingData(normalizedData, device) {
    if (!isPlainObject(normalizedData)) return null;
    const direct = getCaseInsensitive(normalizedData, "siteName");
    if (direct !== undefined) {
      return isPlainObject(direct) && normalizeText(getCaseInsensitive(direct, "status")) === "read"
        ? normalizedSiteName(getCaseInsensitive(direct, "value")) : null;
    }
    const blocks = getCaseInsensitive(normalizedData, "webBlocks");
    const deviceInfo = getCaseInsensitive(blocks, "Device Info");
    const explicit = normalizedSiteName(getCaseInsensitive(deviceInfo, "Site Name"));
    if (explicit) return explicit;
    if (normalizeManufacturer(device?.manufacturerNormalized || device?.manufacturerRaw) !== "polycom") return null;
    const planned = normalizeText(device?.modelNormalized || device?.modelRaw || "");
    const match = planned.match(/^(?:polycom )?realpresence group (300|310|500|700)$/);
    if (!match) return null;
    const observed = normalizeText(getCaseInsensitive(deviceInfo, "Model")).replace(/^polycom /, "");
    return observed === `realpresence group ${match[1]}`
      ? normalizedSiteName(getCaseInsensitive(deviceInfo, "System Name")) : null;
  }

  function flattenPollingChanges(before, after, path, ignoredPaths, output) {
    const currentPath = path || "$";
    if (ignoredPaths.some((ignored) => ignored === currentPath || currentPath.startsWith(`${ignored}.`))) return;
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (isPlainObject(before) || isPlainObject(after)) {
      const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
      [...keys].sort().forEach((key) => flattenPollingChanges(before?.[key], after?.[key], `${currentPath}.${key}`, ignoredPaths, output));
      return;
    }
    output.push({ path: currentPath, oldValue: before === undefined ? null : deepClone(before), newValue: after === undefined ? null : deepClone(after) });
  }

  function getJsonPathValue(value, path) {
    const segments = String(path || "").replace(/^\$\.?/, "").split(".").filter(Boolean);
    let current = value;
    for (const segment of segments) {
      if (!current || typeof current !== "object" || !(segment in current)) return undefined;
      current = current[segment];
    }
    return current;
  }

  function getAnalyzedParameterRules(device) {
    const category = normalizeText(device?.category);
    const manufacturer = normalizeManufacturer(device?.manufacturerNormalized || device?.manufacturerRaw);
    const model = normalizeText(device?.modelNormalized || device?.modelRaw);
    return ANALYZED_PARAMETER_RULES.filter((rule) => rule.category === category
      && (!rule.manufacturerNormalized || normalizeManufacturer(rule.manufacturerNormalized) === manufacturer)
      && (!rule.modelNormalized || normalizeText(rule.modelNormalized) === model));
  }

  function diffAnalyzedParameters(device, before, after) {
    const changes = [];
    for (const rule of getAnalyzedParameterRules(device)) {
      const oldValue = getJsonPathValue(before, rule.path);
      const newValue = getJsonPathValue(after, rule.path);
      if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
      changes.push({
        ruleId: rule.id,
        path: rule.path,
        parameterLabel: rule.label,
        rationale: rule.rationale,
        oldValue: oldValue === undefined ? null : deepClone(oldValue),
        newValue: newValue === undefined ? null : deepClone(newValue)
      });
    }
    return changes;
  }

  function createInventoryIssue(input) {
    return {
      id: createId("inventory-issue"),
      kind: input.kind || "data_quality",
      severity: input.severity || "warning",
      sourceType: input.sourceType || "sr_row",
      sourceId: input.sourceId || null,
      rowNumber: input.rowNumber || null,
      deviceId: input.deviceId || null,
      message: String(input.message || "Проблема входных данных"),
      details: input.details ? deepClone(input.details) : null,
      createdAt: input.createdAt || nowIso(),
      status: "open"
    };
  }

  function rowsFromWorkbook(arrayBuffer) {
    if (!global.XLSX) return { ok: false, errors: ["Локальная библиотека XLSX не загружена"] };
    try {
      const workbook = global.XLSX.read(arrayBuffer, { type: "array", cellDates: false });
      for (const sheetName of workbook.SheetNames || []) {
        const matrix = global.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false });
        const headerIndex = matrix.findIndex((row) => Array.isArray(row) && row.some((cell) => normalizeDisplay(cell)));
        if (headerIndex < 0) continue;
        const headers = matrix[headerIndex].map((header) => normalizeDisplay(header) || "");
        const duplicates = headers.filter((header, index) => header && headers.findIndex((candidate) => normalizeSrHeader(candidate) === normalizeSrHeader(header)) !== index);
        if (duplicates.length) return { ok: false, errors: [`Повторяющиеся заголовки: ${duplicates.join(", ")}`] };
        const missingHeaders = missingSrRequiredHeaders(headers);
        if (missingHeaders.length) return { ok: false, errors: [`Отсутствуют обязательные колонки: ${missingHeaders.join(", ")}`] };
        const rows = matrix.slice(headerIndex + 1)
          .filter((row) => Array.isArray(row) && row.some((cell) => normalizeDisplay(cell)))
          .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
        return { ok: true, sheetName, headers, rows, errors: [] };
      }
      return { ok: false, errors: ["В XLSX не найден непустой лист"] };
    } catch (error) {
      return { ok: false, errors: [`XLSX не прочитан: ${error.message || String(error)}`] };
    }
  }

  function normalizedSrRow(row) {
    const get = (field) => getSrValue(row, SR_FIELD_ALIASES[field][0]);
    const manufacturerRaw = normalizeDisplay(get("manufacturer"));
    return {
      smartRoomLocationId: normalizeDisplay(get("locationId")),
      roomName: normalizeDisplay(get("locationName")),
      locationOverallStatus: normalizeDisplay(get("locationOverallStatus")),
      locationDescription: normalizeDisplay(get("locationDescription")),
      locationAccountingComment: normalizeDisplay(get("locationAccountingComment")),
      roomAddress: normalizeDisplay(get("locationAddress")),
      serviceStatus: normalizeDisplay(get("serviceStatus")),
      roomVip: normalizeBoolean(get("locationVip")),
      favoriteLocation: normalizeBoolean(get("favoriteLocation")),
      openTickets: normalizeDisplay(get("openTickets")),
      closedTickets: normalizeDisplay(get("closedTickets")),
      equipmentCount: normalizeDisplay(get("equipmentCount")),
      employeeNumber: normalizeDisplay(get("employeeNumber")),
      contactPerson: normalizeDisplay(get("contactPerson")),
      contractor: normalizeDisplay(get("contractor")),
      contractorDescription: normalizeDisplay(get("contractorDescription")),
      warrantyTerm: normalizeDisplay(get("warrantyTerm")),
      smartRoomEquipmentId: normalizeDisplay(get("equipmentId")),
      equipmentTypeRaw: normalizeDisplay(get("equipmentClass")),
      equipmentTypeNormalized: normalizeSrCategoryValue(get("equipmentClass")),
      nameRaw: normalizeDisplay(get("equipmentName")),
      equipmentOverallStatus: normalizeDisplay(get("equipmentOverallStatus")),
      udpStatus: normalizeDisplay(get("udpStatus")),
      icmpStatus: normalizeDisplay(get("icmpStatus")),
      tcpStatus: normalizeDisplay(get("tcpStatus")),
      authorizationStatus: normalizeDisplay(get("authorizationStatus")),
      controllerSmartRoomId: normalizeDisplay(get("controllerSmartRoomId")),
      equipmentDescription: normalizeDisplay(get("equipmentDescription")),
      equipmentAccountingComment: normalizeDisplay(get("equipmentAccountingComment")),
      externalDeviceId: normalizeDisplay(get("deviceId")),
      modelRaw: normalizeDisplay(get("model")),
      modelNormalized: normalizeText(get("model")),
      modelTypeRaw: normalizeDisplay(get("modelType")),
      modelTypeNormalized: normalizeSrCategoryValue(get("modelType")),
      manufacturerRaw,
      manufacturerNormalized: normalizeManufacturer(manufacturerRaw),
      ipRaw: normalizeDisplay(get("ip")),
      ipNormalized: normalizeIpv4(get("ip")),
      macRaw: normalizeDisplay(get("mac")),
      macNormalized: normalizeMacLoose(get("mac")),
      domain: normalizeDisplay(get("domain")),
      sipUri: normalizeDisplay(get("sipUri")),
      inventoryNumber: normalizeDisplay(get("inventoryNumber")),
      serialNumber: normalizeDisplay(get("serialNumber")),
      powerStatus: normalizeDisplay(get("powerStatus")),
      interfaceType: normalizeDisplay(get("interfaceType")),
      ipProtocol: normalizeDisplay(get("ipProtocol")),
      dot1x: normalizeDisplay(get("dot1x")),
      deviceVip: normalizeBoolean(get("legacyDeviceVip")),
      category: classifySrDevice(row),
      rawRow: deepClone(row)
    };
  }

  function srLocationFallbackKey(row) {
    return `${normalizeText(row.roomName) || ""}|${normalizeText(row.roomAddress) || ""}`;
  }

  function srLocationIdentityKey(row) {
    const stableId = normalizeText(row.smartRoomLocationId);
    return stableId ? `smartroom-location|${stableId}` : srLocationFallbackKey(row);
  }

  function srLocationProjection(row) {
    return {
      identityKey: srLocationIdentityKey(row),
      smartRoomLocationId: row.smartRoomLocationId,
      name: row.roomName,
      address: row.roomAddress,
      vip: row.roomVip,
      overallStatus: row.locationOverallStatus,
      description: row.locationDescription,
      accountingComment: row.locationAccountingComment,
      serviceStatus: row.serviceStatus,
      favorite: row.favoriteLocation,
      openTickets: row.openTickets,
      closedTickets: row.closedTickets,
      equipmentCount: row.equipmentCount,
      employeeNumber: row.employeeNumber,
      contactPerson: row.contactPerson,
      contractor: row.contractor,
      contractorDescription: row.contractorDescription,
      warrantyTerm: row.warrantyTerm,
      domain: row.domain
    };
  }

  function findSrLocation(locations, row) {
    const stableId = normalizeText(row.smartRoomLocationId);
    if (stableId) {
      const exact = locations.find((location) => normalizeText(location.smartRoomLocationId) === stableId);
      if (exact) return exact;
    }
    const identityKey = srLocationIdentityKey(row);
    const exactIdentity = locations.find((location) => location.identityKey === identityKey);
    if (exactIdentity) return exactIdentity;
    if (stableId) {
      const fallbackKey = srLocationFallbackKey(row);
      return locations.find((location) => !location.smartRoomLocationId && location.identityKey === fallbackKey) || null;
    }
    return null;
  }

  function srFallbackIdentityBase(row) {
    return [row.smartRoomLocationId, row.roomName, row.roomAddress, row.category, row.equipmentTypeNormalized, row.modelTypeNormalized, row.manufacturerNormalized, row.modelNormalized, row.nameRaw]
      .map((value) => normalizeText(value) || "")
      .join("|");
  }

  function srRecordFingerprint(record) {
    return JSON.stringify([
      record.smartRoomLocationId, record.roomName, record.locationOverallStatus, record.locationDescription,
      record.locationAccountingComment, record.roomAddress, record.serviceStatus, record.roomVip,
      record.favoriteLocation, record.openTickets, record.closedTickets, record.equipmentCount,
      record.employeeNumber, record.contactPerson, record.contractor, record.contractorDescription,
      record.warrantyTerm, record.smartRoomEquipmentId, record.category, record.equipmentTypeNormalized,
      record.nameRaw, record.equipmentOverallStatus, record.udpStatus, record.icmpStatus, record.tcpStatus,
      record.authorizationStatus, record.controllerSmartRoomId, record.equipmentDescription,
      record.equipmentAccountingComment, record.externalDeviceId, record.modelNormalized,
      record.modelTypeNormalized, record.manufacturerNormalized,
      record.ipNormalized, record.macNormalized, record.sipUri, record.inventoryNumber,
      record.serialNumber, record.powerStatus, record.interfaceType, record.ipProtocol, record.dot1x,
      Boolean(record.deviceVip), record.domain
    ].map((value) => normalizeText(value) || ""));
  }

  function srIdentityMatchKind(device, row) {
    if (row.smartRoomEquipmentId && normalizeText(device?.smartRoomEquipmentId) === normalizeText(row.smartRoomEquipmentId)) return "smartroom_equipment";
    if (row.externalDeviceId && normalizeText(device?.externalDeviceId) === normalizeText(row.externalDeviceId)) return "device_id";
    if (row.inventoryNumber && normalizeText(device?.inventoryNumber) === normalizeText(row.inventoryNumber)) return "inventory";
    if (row.serialNumber && row.manufacturerNormalized
      && normalizeText(device?.serialNumber) === normalizeText(row.serialNumber)
      && device?.manufacturerNormalized === row.manufacturerNormalized) return "serial_manufacturer";
    if (row.macNormalized && device?.macNormalized === row.macNormalized) return "mac";
    if (!row.smartRoomEquipmentId && !row.externalDeviceId && !row.inventoryNumber && !row.serialNumber && !row.macNormalized && row.ipNormalized
      && (device?.ipNormalized === row.ipNormalized || (device?.ipHistory || []).includes(row.ipNormalized))) return "ip";
    if (!row.smartRoomEquipmentId && !row.externalDeviceId && !row.inventoryNumber && !row.serialNumber && !row.macNormalized && !row.ipNormalized
      && row.sourceFallbackKey && device?.sourceFallbackKey === row.sourceFallbackKey) return "fallback";
    return "unknown";
  }

  function resolveSrImportCandidate(candidates, row, srImportId, fingerprintCandidates) {
    const values = Array.isArray(candidates) ? candidates : [];
    const fingerprint = srRecordFingerprint(row);
    const exactValues = fingerprintCandidates || values.filter((device) => srRecordFingerprint(device) === fingerprint);
    const exact = exactValues.length === 1 ? exactValues[0] : null;
    if (values.length > 1) {
      if (exact) return { device: exact, outcome: exact.lastSrImportId === srImportId ? "confirmed_duplicate" : "matched", matchKind: srIdentityMatchKind(exact, row), sameFingerprint: true };
      if (values.some((device) => device.lastSrImportId === srImportId && device.inCurrentSr !== false)) {
        return { device: null, outcome: "identity_collision", matchKind: srIdentityMatchKind(values[0], row), sameFingerprint: false };
      }
      return { device: null, outcome: "ambiguous", matchKind: srIdentityMatchKind(values[0], row), sameFingerprint: false };
    }
    if (values.length === 1) {
      const candidate = values[0];
      if (candidate.lastSrImportId === srImportId && candidate.inCurrentSr !== false) {
        if (srRecordFingerprint(candidate) === fingerprint) return { device: candidate, outcome: "confirmed_duplicate", matchKind: srIdentityMatchKind(candidate, row), sameFingerprint: true };
        return { device: null, outcome: "identity_collision", matchKind: srIdentityMatchKind(candidate, row), sameFingerprint: false };
      }
      return { device: candidate, outcome: "matched", matchKind: srIdentityMatchKind(candidate, row), sameFingerprint: srRecordFingerprint(candidate) === fingerprint };
    }
    return { device: null, outcome: "new", matchKind: "none", sameFingerprint: false };
  }

  function findInventoryCandidates(devices, row) {
    const levels = [
      row.smartRoomEquipmentId && ((device) => normalizeText(device.smartRoomEquipmentId) === normalizeText(row.smartRoomEquipmentId)),
      row.externalDeviceId && ((device) => normalizeText(device.externalDeviceId) === normalizeText(row.externalDeviceId)),
      row.inventoryNumber && ((device) => normalizeText(device.inventoryNumber) === normalizeText(row.inventoryNumber)),
      row.serialNumber && row.manufacturerNormalized && ((device) => normalizeText(device.serialNumber) === normalizeText(row.serialNumber) && device.manufacturerNormalized === row.manufacturerNormalized),
      row.macNormalized && ((device) => device.macNormalized === row.macNormalized),
      !row.smartRoomEquipmentId && !row.externalDeviceId && !row.inventoryNumber && !row.serialNumber && !row.macNormalized && row.ipNormalized && ((device) => device.ipNormalized === row.ipNormalized || (device.ipHistory || []).includes(row.ipNormalized)),
      !row.smartRoomEquipmentId && !row.externalDeviceId && !row.inventoryNumber && !row.serialNumber && !row.macNormalized && !row.ipNormalized && row.sourceFallbackKey && ((device) => device.sourceFallbackKey === row.sourceFallbackKey)
    ].filter(Boolean);
    for (const matcher of levels) {
      const candidates = devices.filter(matcher);
      if (candidates.length) return candidates;
    }
    return [];
  }

  function importSrRows(currentState, input) {
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const headers = input.headers || Object.keys(rows[0] || {});
    const missingHeaders = missingSrRequiredHeaders(headers);
    if (missingHeaders.length) return { ok: false, outcome: "failed", state: deepClone(currentState), errors: [`Отсутствуют обязательные колонки: ${missingHeaders.join(", ")}`] };
    if (input.rawSha256 && currentState.srImports.some((item) => item.rawSha256 === input.rawSha256)) {
      return { ok: true, outcome: "duplicate", state: deepClone(currentState), errors: [] };
    }
    let next = deepClone(currentState);
    const importedAt = input.importedAt || nowIso();
    const srImport = { id: createId("sr-import"), filename: input.filename || "inventory.xlsx", sheetName: input.sheetName || "", rawSha256: input.rawSha256 || null, importedAt, importedById: input.actorId || "system", rowCount: rows.length, acceptedCount: 0, rejectedCount: 0, status: "processing" };
    next.inventoryDevices.forEach((device) => { device.inCurrentSr = false; });
    next.locations.forEach((location) => { location.inCurrentSr = false; });
    const fallbackOccurrences = new Map();
    rows.forEach((rawRow, index) => {
      const rowNumber = index + 2;
      const row = normalizedSrRow(rawRow);
      const hasIdentity = row.smartRoomEquipmentId || row.externalDeviceId || row.inventoryNumber || row.serialNumber || row.macNormalized || row.ipNormalized;
      if (!hasIdentity) {
        const fallbackBase = srFallbackIdentityBase(row);
        const occurrence = (fallbackOccurrences.get(fallbackBase) || 0) + 1;
        fallbackOccurrences.set(fallbackBase, occurrence);
        row.sourceFallbackKey = `${fallbackBase}|${occurrence}`;
      }
      let location = findSrLocation(next.locations, row);
      if (!location) {
        location = { id: createId("location"), ...srLocationProjection(row), inCurrentSr: true, firstSeenAt: importedAt, lastSeenAt: importedAt };
        next.locations.push(location);
      } else {
        Object.assign(location, srLocationProjection(row), { domain: row.domain || location.domain || null, inCurrentSr: true, lastSeenAt: importedAt });
      }
      const candidates = findInventoryCandidates(next.inventoryDevices, row);
      const resolution = resolveSrImportCandidate(candidates, row, srImport.id);
      let device = resolution.device;
      if (resolution.outcome === "ambiguous") next.inventoryIssues.push(createInventoryIssue({ kind: "ambiguous_identity", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Найдено несколько кандидатов; создана отдельная запись", details: { matchKind: resolution.matchKind, candidateIds: candidates.slice(0, 10).map((item) => item.id) } }));
      if (resolution.outcome === "identity_collision") next.inventoryIssues.push(createInventoryIssue({ kind: "identity_collision", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Совпавший идентификатор уже занят другой строкой текущей SR; создана отдельная запись", details: { matchKind: resolution.matchKind, candidateIds: candidates.slice(0, 10).map((item) => item.id) } }));
      if (resolution.outcome === "confirmed_duplicate") next.inventoryIssues.push(createInventoryIssue({ kind: "duplicate_sr_row", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: "Подтверждён точный повтор строки SR", details: { matchKind: resolution.matchKind } }));
      const oldIp = device?.ipNormalized || null;
      if (!device) {
        device = { id: createId("inventory-device"), firstSeenAt: importedAt, ipHistory: [] };
        next.inventoryDevices.push(device);
      }
      if (oldIp && oldIp !== row.ipNormalized && !device.ipHistory.includes(oldIp)) device.ipHistory.push(oldIp);
      Object.assign(device, row, { locationId: location.id, inCurrentSr: true, lastSeenAt: importedAt, lastSrImportId: srImport.id, sourceRowNumber: rowNumber, pollingCapability: resolvePollingCapability(row) });
      if (!hasIdentity) next.inventoryIssues.push(createInventoryIssue({ kind: "missing_identity", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: "Устройство сохранено без SmartRoom ID оборудования, ID устройства, inventory/serial/MAC/IP; используется локальная составная идентичность", details: { sourceFallbackKey: row.sourceFallbackKey } }));
      if (row.ipRaw && !row.ipNormalized) next.inventoryIssues.push(createInventoryIssue({ kind: "invalid_ip", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: `Некорректный IP: ${row.ipRaw}` }));
      if (row.category === "other") next.inventoryIssues.push(createInventoryIssue({ kind: "unknown_category", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: "Строка не относится к ВКС, контроллеру или панели" }));
      srImport.acceptedCount += 1;
    });
    srImport.status = srImport.rejectedCount > 0 ? "partial" : "processed";
    next.srImports.push(srImport);
    next = appendHistory(next, { actorId: input.actorId || "system", action: "Импортирована выгрузка SR", entityType: "sr_import", entityId: srImport.id, details: `${srImport.filename}: ${srImport.acceptedCount}/${srImport.rowCount}` });
    return { ok: true, outcome: srImport.status, state: next, srImportId: srImport.id, acceptedCount: srImport.acceptedCount, rejectedCount: srImport.rejectedCount, errors: [] };
  }

  const DEFAULT_SR_IMPORT_BATCH_SIZE = 256;

  function addSrIndexValue(index, key, device) {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(device);
  }

  function removeSrIndexValue(index, key, device) {
    if (!key || !index.has(key)) return;
    const values = index.get(key).filter((item) => item !== device);
    if (values.length) index.set(key, values); else index.delete(key);
  }

  function srDeviceIndexKeys(device) {
    return {
      smartRoomEquipment: normalizeText(device?.smartRoomEquipmentId),
      externalDevice: normalizeText(device?.externalDeviceId),
      inventory: normalizeText(device?.inventoryNumber),
      serialManufacturer: device?.serialNumber && device?.manufacturerNormalized ? `${normalizeText(device.serialNumber)}|${device.manufacturerNormalized}` : null,
      mac: device?.macNormalized || null,
      ips: [...new Set([device?.ipNormalized, ...(device?.ipHistory || [])].filter(Boolean))],
      fallback: device?.sourceFallbackKey || null,
      fingerprint: srRecordFingerprint(device)
    };
  }

  function createSrImportContext(candidateState) {
    const context = {
      locationsByIdentity: new Map(candidateState.locations.map((location) => [location.identityKey, location])),
      locationsBySmartRoomId: new Map(candidateState.locations.filter((location) => location.smartRoomLocationId).map((location) => [normalizeText(location.smartRoomLocationId), location])),
      bySmartRoomEquipment: new Map(), byExternalDevice: new Map(), byInventory: new Map(), bySerialManufacturer: new Map(), byMac: new Map(), byIp: new Map(), byFallback: new Map(), byFingerprint: new Map()
    };
    for (const device of candidateState.inventoryDevices) {
      const keys = srDeviceIndexKeys(device);
      addSrIndexValue(context.bySmartRoomEquipment, keys.smartRoomEquipment, device);
      addSrIndexValue(context.byExternalDevice, keys.externalDevice, device);
      addSrIndexValue(context.byInventory, keys.inventory, device);
      addSrIndexValue(context.bySerialManufacturer, keys.serialManufacturer, device);
      addSrIndexValue(context.byMac, keys.mac, device);
      keys.ips.forEach((ip) => addSrIndexValue(context.byIp, ip, device));
      addSrIndexValue(context.byFallback, keys.fallback, device);
      addSrIndexValue(context.byFingerprint, keys.fingerprint, device);
    }
    return context;
  }

  function removeSrDeviceFromContext(context, device) {
    const keys = srDeviceIndexKeys(device);
    removeSrIndexValue(context.bySmartRoomEquipment, keys.smartRoomEquipment, device);
    removeSrIndexValue(context.byExternalDevice, keys.externalDevice, device);
    removeSrIndexValue(context.byInventory, keys.inventory, device);
    removeSrIndexValue(context.bySerialManufacturer, keys.serialManufacturer, device);
    removeSrIndexValue(context.byMac, keys.mac, device);
    keys.ips.forEach((ip) => removeSrIndexValue(context.byIp, ip, device));
    removeSrIndexValue(context.byFallback, keys.fallback, device);
    removeSrIndexValue(context.byFingerprint, keys.fingerprint, device);
  }

  function addSrDeviceToContext(context, device) {
    const keys = srDeviceIndexKeys(device);
    addSrIndexValue(context.bySmartRoomEquipment, keys.smartRoomEquipment, device);
    addSrIndexValue(context.byExternalDevice, keys.externalDevice, device);
    addSrIndexValue(context.byInventory, keys.inventory, device);
    addSrIndexValue(context.bySerialManufacturer, keys.serialManufacturer, device);
    addSrIndexValue(context.byMac, keys.mac, device);
    keys.ips.forEach((ip) => addSrIndexValue(context.byIp, ip, device));
    addSrIndexValue(context.byFallback, keys.fallback, device);
    addSrIndexValue(context.byFingerprint, keys.fingerprint, device);
  }

  function findIndexedSrCandidates(context, row) {
    const levels = [
      row.smartRoomEquipmentId ? context.bySmartRoomEquipment.get(normalizeText(row.smartRoomEquipmentId)) : null,
      row.externalDeviceId ? context.byExternalDevice.get(normalizeText(row.externalDeviceId)) : null,
      row.inventoryNumber ? context.byInventory.get(normalizeText(row.inventoryNumber)) : null,
      row.serialNumber && row.manufacturerNormalized ? context.bySerialManufacturer.get(`${normalizeText(row.serialNumber)}|${row.manufacturerNormalized}`) : null,
      row.macNormalized ? context.byMac.get(row.macNormalized) : null,
      !row.smartRoomEquipmentId && !row.externalDeviceId && !row.inventoryNumber && !row.serialNumber && !row.macNormalized && row.ipNormalized ? context.byIp.get(row.ipNormalized) : null,
      !row.smartRoomEquipmentId && !row.externalDeviceId && !row.inventoryNumber && !row.serialNumber && !row.macNormalized && !row.ipNormalized && row.sourceFallbackKey ? context.byFallback.get(row.sourceFallbackKey) : null
    ];
    return levels.find((candidates) => candidates?.length) || [];
  }

  async function processSrImportRows(currentState, input) {
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const headers = input.headers || Object.keys(rows[0] || {});
    const missingHeaders = missingSrRequiredHeaders(headers);
    if (missingHeaders.length) return { ok: false, outcome: "failed", state: deepClone(currentState), errors: [`Отсутствуют обязательные колонки: ${missingHeaders.join(", ")}`] };
    if (input.rawSha256 && currentState.srImports.some((item) => item.rawSha256 === input.rawSha256)) return { ok: true, outcome: "duplicate", state: currentState, errors: [] };

    const startedAt = monotonicNow();
    const metrics = { normalizedRows: 0, locationLookups: 0, identityLookups: 0, yields: 0, batches: 0, stagesMs: { clone: 0, processing: 0, inventory: 0, uiOverhead: 0 } };
    const onProgress = typeof input.onProgress === "function" ? input.onProgress : () => {};
    const yieldControl = input.yieldControl || cooperativeBrowserYield;
    const batchSize = Math.max(1, Number(input.batchSize) || DEFAULT_SR_IMPORT_BATCH_SIZE);
    const emitProgress = (stage, processed, status) => {
      const progressStarted = monotonicNow();
      onProgress(Object.freeze({ stage, processed, total: rows.length, accepted: srImport.acceptedCount, rejected: srImport.rejectedCount, status: status || "running", elapsedMs: monotonicNow() - startedAt }));
      metrics.stagesMs.uiOverhead += monotonicNow() - progressStarted;
    };

    const cloneStarted = monotonicNow();
    const next = deepClone(currentState);
    metrics.stagesMs.clone = monotonicNow() - cloneStarted;
    const importedAt = input.importedAt || nowIso();
    const srImport = { id: createId("sr-import"), filename: input.filename || "inventory.xlsx", sheetName: input.sheetName || "", rawSha256: input.rawSha256 || null, importedAt, importedById: input.actorId || "system", rowCount: rows.length, acceptedCount: 0, rejectedCount: 0, status: "processing" };
    next.inventoryDevices.forEach((device) => { device.inCurrentSr = false; });
    next.locations.forEach((location) => { location.inCurrentSr = false; });
    const contextStarted = monotonicNow();
    const context = createSrImportContext(next);
    const fallbackOccurrences = new Map();
    metrics.stagesMs.inventory += monotonicNow() - contextStarted;
    emitProgress("Обработка строк", 0);

    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const processingStarted = monotonicNow();
      const limit = Math.min(rows.length, offset + batchSize);
      for (let index = offset; index < limit; index += 1) {
        const rawRow = rows[index];
        const rowNumber = index + 2;
        try {
          const row = normalizedSrRow(rawRow);
          metrics.normalizedRows += 1;
          const hasIdentity = row.smartRoomEquipmentId || row.externalDeviceId || row.inventoryNumber || row.serialNumber || row.macNormalized || row.ipNormalized;
          if (!hasIdentity) {
            const fallbackBase = srFallbackIdentityBase(row);
            const occurrence = (fallbackOccurrences.get(fallbackBase) || 0) + 1;
            fallbackOccurrences.set(fallbackBase, occurrence);
            row.sourceFallbackKey = `${fallbackBase}|${occurrence}`;
          }
          const locationKey = srLocationIdentityKey(row);
          const stableLocationId = normalizeText(row.smartRoomLocationId);
          metrics.locationLookups += 1;
          let location = stableLocationId ? context.locationsBySmartRoomId.get(stableLocationId) : context.locationsByIdentity.get(locationKey);
          if (!location && stableLocationId) location = context.locationsByIdentity.get(srLocationFallbackKey(row));
          if (!location) {
            location = { id: createId("location"), ...srLocationProjection(row), inCurrentSr: true, firstSeenAt: importedAt, lastSeenAt: importedAt };
            next.locations.push(location);
            context.locationsByIdentity.set(locationKey, location);
            if (stableLocationId) context.locationsBySmartRoomId.set(stableLocationId, location);
          } else {
            context.locationsByIdentity.delete(location.identityKey);
            Object.assign(location, srLocationProjection(row), { domain: row.domain || location.domain || null, inCurrentSr: true, lastSeenAt: importedAt });
            context.locationsByIdentity.set(location.identityKey, location);
            if (stableLocationId) context.locationsBySmartRoomId.set(stableLocationId, location);
          }
          metrics.identityLookups += 1;
          const candidates = findIndexedSrCandidates(context, row);
          const resolution = resolveSrImportCandidate(candidates, row, srImport.id, context.byFingerprint.get(srRecordFingerprint(row)) || []);
          let device = resolution.device;
          if (resolution.outcome === "ambiguous") next.inventoryIssues.push(createInventoryIssue({ kind: "ambiguous_identity", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Найдено несколько кандидатов; создана отдельная запись", details: { matchKind: resolution.matchKind, candidateIds: candidates.slice(0, 10).map((item) => item.id) } }));
          if (resolution.outcome === "identity_collision") next.inventoryIssues.push(createInventoryIssue({ kind: "identity_collision", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Совпавший идентификатор уже занят другой строкой текущей SR; создана отдельная запись", details: { matchKind: resolution.matchKind, candidateIds: candidates.slice(0, 10).map((item) => item.id) } }));
          if (resolution.outcome === "confirmed_duplicate") next.inventoryIssues.push(createInventoryIssue({ kind: "duplicate_sr_row", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: "Подтверждён точный повтор строки SR", details: { matchKind: resolution.matchKind } }));
          const oldIp = device?.ipNormalized || null;
          if (!device) {
            device = { id: createId("inventory-device"), firstSeenAt: importedAt, ipHistory: [] };
            next.inventoryDevices.push(device);
          } else if (!resolution.sameFingerprint) {
            removeSrDeviceFromContext(context, device);
          }
          if (oldIp && oldIp !== row.ipNormalized && !device.ipHistory.includes(oldIp)) device.ipHistory.push(oldIp);
          Object.assign(device, row, { locationId: location.id, inCurrentSr: true, lastSeenAt: importedAt, lastSrImportId: srImport.id, sourceRowNumber: rowNumber, pollingCapability: resolvePollingCapability(row) });
          if (!resolution.sameFingerprint) addSrDeviceToContext(context, device);
          if (!hasIdentity) next.inventoryIssues.push(createInventoryIssue({ kind: "missing_identity", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: "Устройство сохранено без SmartRoom ID оборудования, ID устройства, inventory/serial/MAC/IP; используется локальная составная идентичность", details: { sourceFallbackKey: row.sourceFallbackKey } }));
          if (row.ipRaw && !row.ipNormalized) next.inventoryIssues.push(createInventoryIssue({ kind: "invalid_ip", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: `Некорректный IP: ${row.ipRaw}` }));
          if (row.category === "other") next.inventoryIssues.push(createInventoryIssue({ kind: "unknown_category", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: "Строка не относится ни к одной утверждённой категории оборудования" }));
          srImport.acceptedCount += 1;
        } catch (error) {
          srImport.rejectedCount += 1;
          next.inventoryIssues.push(createInventoryIssue({ kind: "data_quality", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Строку SR не удалось обработать", details: { error: error.message || String(error) } }));
        }
      }
      metrics.stagesMs.processing += monotonicNow() - processingStarted;
      metrics.batches += 1;
      emitProgress("Обработка строк", limit);
      if (limit < rows.length) {
        await yieldControl();
        metrics.yields += 1;
      }
    }

    emitProgress("Формирование перечня оборудования", rows.length);
    srImport.status = srImport.rejectedCount > 0 ? "partial" : "processed";
    next.srImports.push(srImport);
    next.history.push(makeHistoryEntry({ actorId: input.actorId || "system", action: "Импортирована выгрузка SR", entityType: "sr_import", entityId: srImport.id, details: `${srImport.filename}: ${srImport.acceptedCount}/${srImport.rowCount}` }));
    emitProgress("Обновление аналитики", rows.length);
    emitProgress("Готово", rows.length, "complete");
    return { ok: true, outcome: srImport.status, state: next, srImportId: srImport.id, acceptedCount: srImport.acceptedCount, rejectedCount: srImport.rejectedCount, metrics, errors: [] };
  }

  async function sha256Bytes(value) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (global.crypto?.subtle) {
      const hash = await global.crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(hash)].map((part) => part.toString(16).padStart(2, "0")).join("");
    }
    return sha256Text(String.fromCharCode(...bytes));
  }

  async function importSrWorkbook(currentState, input) {
    input.onProgress?.(Object.freeze({ stage: "Чтение выгрузки SR", processed: 0, total: 0, accepted: 0, rejected: 0, status: "running", elapsedMs: 0 }));
    const parsed = rowsFromWorkbook(input.arrayBuffer);
    if (!parsed.ok) return { ok: false, outcome: "failed", state: deepClone(currentState), errors: parsed.errors };
    return processSrImportRows(currentState, { ...input, ...parsed, rawSha256: await sha256Bytes(input.arrayBuffer) });
  }

  function parseManagementTargetRows(input) {
    const rows = Array.isArray(input?.rows) ? input.rows : [];
    const headers = input?.headers || Object.keys(rows[0] || {});
    const secretHeaders = headers.filter((header) => /(?:пароль|password|passwd|secret|token|api[_ -]?key|логин)/iu.test(normalizeSrHeader(header)));
    if (secretHeaders.length) return { ok: false, devices: [], errors: ["Список устройств не должен содержать столбцы с учётными данными"] };
    const missingHeaders = missingSrRequiredHeaders(headers);
    if (missingHeaders.length) return { ok: false, devices: [], errors: [`Отсутствуют обязательные колонки: ${missingHeaders.join(", ")}`] };
    const devices = [];
    const rowsByIp = new Map();
    const errors = [];
    rows.forEach((rawRow, index) => {
      const rowNumber = index + 2;
      const row = normalizedSrRow(rawRow);
      if (!row.ipNormalized) {
        errors.push(`Строка ${rowNumber}: отсутствует корректный IPv4-адрес`);
        return;
      }
      const existingRow = rowsByIp.get(row.ipNormalized);
      if (existingRow) {
        errors.push(`Строки ${existingRow} и ${rowNumber}: повторяется IP-адрес ${row.ipNormalized}`);
        return;
      }
      rowsByIp.set(row.ipNormalized, rowNumber);
      const device = {
        ...row,
        rawRow: undefined,
        id: `port-closure-target-${index + 1}`,
        inCurrentSr: true,
        sourceRowNumber: rowNumber,
        pollingCapability: resolvePollingCapability(row)
      };
      delete device.rawRow;
      devices.push(device);
    });
    if (!rows.length) errors.push("Список устройств пуст");
    if (errors.length) return { ok: false, devices: [], errors };
    return { ok: true, devices, acceptedCount: devices.length, errors: [] };
  }

  async function parseManagementTargetWorkbook(input) {
    const parsed = rowsFromWorkbook(input?.arrayBuffer);
    if (!parsed.ok) return { ok: false, devices: [], errors: parsed.errors };
    const normalized = parseManagementTargetRows(parsed);
    if (!normalized.ok) return normalized;
    return { ...normalized, sheetName: parsed.sheetName, headers: parsed.headers, rows: parsed.rows, sourceSha256: await sha256Bytes(input.arrayBuffer) };
  }

  function classifyDeviceLogPrefix(prefix, filename) {
    const bytes = prefix instanceof Uint8Array ? prefix : new Uint8Array(prefix || []);
    if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return "ZIP (без распаковки)";
    if (/\.tgz$/i.test(String(filename || "")) && bytes.length >= 3 && bytes[0] === 0x1f && bytes[1] === 0x8b && bytes[2] === 0x08) return "TGZ (без распаковки)";
    const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 2048)).replace(/^\uFEFF/, "").trimStart();
    if (head.startsWith("<?xml") && /<LogModule(?:\s|>)/.test(head)) return "Huawei TE XML";
    if (head.startsWith("<?xml")) return "XML (неизвестная схема)";
    if (/\.(?:txt|log)$/i.test(String(filename || "")) && !bytes.includes(0)) return "Текст (без разбора)";
    return "Неизвестный формат";
  }

  function buildDeviceLogImportRows(entries, currentState) {
    const inventory = (currentState?.inventoryDevices || []).filter((device) => device.inCurrentSr !== false);
    const byIp = new Map();
    inventory.forEach((device) => {
      const ip = normalizeIpv4(device.ipNormalized || device.ipRaw);
      if (!ip) return;
      if (!byIp.has(ip)) byIp.set(ip, []);
      byIp.get(ip).push(device);
    });
    const rows = (entries || []).map((entry) => {
      const name = String(entry.name || "");
      const path = String(entry.relativePath || name).replace(/\\/g, "/");
      const runFolder = path.split("/").slice(0, -1).reverse().find((part) => /^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d(?:-\d+)?$/.test(part)) || "";
      const ip = normalizeIpv4(name.replace(/\.(?:xml|zip|txt|log|tgz)$/i, ""));
      const candidates = ip ? byIp.get(ip) || [] : [];
      const matchStatus = !ip ? "IP не указан" : candidates.length === 1 ? "Сопоставлено" : candidates.length ? "Неоднозначный IP" : "Нет в SR";
      const detectedFormat = entry.readError ? "Ошибка чтения" : classifyDeviceLogPrefix(entry.prefix, name);
      const exact310 = candidates.length === 1 && candidates[0].category === "vcs" && normalizeManufacturer(candidates[0].manufacturerNormalized || candidates[0].manufacturerRaw) === "huawei" && ["bar310", "box310", "box610"].includes(auditModelToken(candidates[0].modelRaw));
      const exact300 = candidates.length === 1 && candidates[0].category === "vcs" && normalizeManufacturer(candidates[0].manufacturerNormalized || candidates[0].manufacturerRaw) === "huawei" && ["bar300", "box300", "box600"].includes(auditModelToken(candidates[0].modelRaw));
      const exactPolycom = candidates.length === 1 && candidates[0].category === "vcs" && normalizeManufacturer(candidates[0].manufacturerNormalized || candidates[0].manufacturerRaw) === "polycom" && ["group300", "group310", "group500", "group700"].includes(auditModelToken(candidates[0].modelRaw));
      return { path, name, runFolder, ip, size: Number(entry.size || 0), modifiedAt: Number.isFinite(entry.lastModified) ? new Date(entry.lastModified).toISOString() : "", format: detectedFormat === "Huawei TE XML" && exact310 ? "Huawei 310 XML" : detectedFormat === "Huawei TE XML" && exact300 ? "Huawei 300 XML" : detectedFormat === "TGZ (без распаковки)" && exactPolycom ? "Polycom Group TGZ" : detectedFormat, matchStatus, deviceId: candidates.length === 1 ? candidates[0].id : null, deviceName: candidates.length === 1 ? candidates[0].nameRaw || candidates[0].modelRaw || "" : "" };
    });
    const formats = {};
    rows.forEach((row) => { formats[row.format] = (formats[row.format] || 0) + 1; });
    return { rows, summary: { files: rows.length, bytes: rows.reduce((sum, row) => sum + row.size, 0), matched: rows.filter((row) => row.matchStatus === "Сопоставлено").length, issues: rows.filter((row) => row.matchStatus !== "Сопоставлено" || ["Ошибка чтения", "Неизвестный формат", "XML (неизвестная схема)"].includes(row.format)).length, formats } };
  }

  function summarizeDeviceLogRows(rows) {
    const formats = {};
    for (const row of rows) formats[row.format] = (formats[row.format] || 0) + 1;
    return { files: rows.length, bytes: rows.reduce((sum, row) => sum + row.size, 0),
      matched: rows.filter((row) => row.matchStatus === "Сопоставлено").length,
      issues: rows.filter((row) => row.matchStatus !== "Сопоставлено" || row.analysisStatus === "Ошибка разбора"
        || ["Ошибка чтения", "Неизвестный формат", "XML (неизвестная схема)"].includes(row.format)).length,
      formats };
  }

  function mergeLogEventIndexes(previous, incoming) {
    if (!previous) return incoming;
    const events = new Map((previous.events || []).map((event) => [event.id, { ...event, sources: [...(event.sources || [])] }]));
    const priority = { unknown_start: 0, start_after_shutdown: 1, confirmed_reboot: 2, power_off: 2 };
    for (const event of incoming.events || []) {
      const old = events.get(event.id);
      if (!old) { events.set(event.id, event); continue; }
      if ((priority[event.kind] ?? 0) > (priority[old.kind] ?? 0)) {
        old.kind = event.kind;
        old.ruleVersion = event.ruleVersion;
        old.validationStatus = event.validationStatus || old.validationStatus;
        old.actionMethod = event.actionMethod || old.actionMethod;
        old.shutdownMethod = event.shutdownMethod || old.shutdownMethod;
        if (event.kind !== "unknown_start") old.silenceGap = null;
      }
      if (event.silenceGap && old.kind === "unknown_start") {
        const earlier = old.silenceGap;
        old.silenceGap = earlier && earlier.seconds <= event.silenceGap.seconds ? earlier : event.silenceGap;
        if (earlier?.knownAction || event.silenceGap.knownAction) old.silenceGap.knownAction = true;
        if (earlier?.clockAnomalyOrLongGap || event.silenceGap.clockAnomalyOrLongGap) old.silenceGap.clockAnomalyOrLongGap = true;
      }
      old.sourceCount = (old.sourceCount || old.sources.length) + (event.sourceCount || event.sources?.length || 0);
      for (const source of event.sources || []) {
        if (old.sources.length >= LOG_EVENT_SOURCE_SAMPLE_LIMIT) break;
        if (!old.sources.some((item) => item.path === source.path && item.line === source.line)) old.sources.push(source);
      }
    }
    const ordered = [...events.values()].sort((left, right) => timeValue(right.estimatedAt) - timeValue(left.estimatedAt) || left.id.localeCompare(right.id));
    const coverage = { ...(previous.coverage || {}) };
    for (const [key, value] of Object.entries(incoming.coverage || {})) {
      if (typeof value === "number" && !["confirmedReboots", "powerOffs", "unknownStarts", "startsAfterShutdown", "gapCandidates"].includes(key)) coverage[key] = (coverage[key] || 0) + value;
    }
    coverage.confirmedReboots = ordered.filter((item) => item.kind === "confirmed_reboot").length;
    coverage.powerOffs = ordered.filter((item) => item.kind === "power_off").length;
    coverage.unknownStarts = ordered.filter((item) => item.kind === "unknown_start").length;
    coverage.startsAfterShutdown = ordered.filter((item) => item.kind === "start_after_shutdown").length;
    coverage.gapCandidates = ordered.filter((item) => item.kind === "unknown_start" && item.silenceGap).length;
    return { ...incoming, events: ordered, coverage, validationStatus: incoming.validationStatus || previous.validationStatus };
  }

  async function prepareDeviceLogImport(files, currentState, options) {
    const sourceFiles = Array.isArray(files) ? files : [];
    if (!sourceFiles.length) throw new Error("log_import_empty");
    const settings = options || {};
    const shouldCancel = () => settings.shouldCancel?.() === true;
    const checkCancel = () => { if (shouldCancel()) throw new Error("log_import_cancelled"); };
    let skippedFiles = 0;
    let recoveredFiles = 0;
    let savedFiles = 0;
    let physicalBytes = 0;
    let scanStart = 0;
    const totalBytes = sourceFiles.reduce((sum, file) => sum + (Number.isSafeInteger(file.size) ? file.size : 0), 0);
    const report = (phase, processed, bytesRead) => {
      const elapsed = scanStart ? (monotonicNow() - scanStart) / 1000 : 0;
      settings.onProgress?.({ phase, processed, total: sourceFiles.length, bytesRead, totalBytes, skippedFiles, recoveredFiles,
        savedFiles, physicalBytes, bytesPerSecond: elapsed >= 0.5 ? physicalBytes / elapsed : null });
    };
    const entries = [];
    report("classifying", 0, 0);
    for (let start = 0; start < sourceFiles.length; start += 64) {
      checkCancel();
      const batch = await Promise.all(sourceFiles.slice(start, start + 64).map(async (file) => {
        try {
          const prefix = new Uint8Array(await file.slice(0, 2048).arrayBuffer());
          return { name: file.name, relativePath: file.webkitRelativePath || file.name, size: file.size,
            lastModified: file.lastModified, prefix, prefixSha256: await sha256Bytes(prefix) };
        }
        catch { return { name: file.name, relativePath: file.webkitRelativePath || file.name, size: file.size,
          lastModified: file.lastModified, readError: true, prefix: new Uint8Array() }; }
      }));
      entries.push(...batch);
      report("classifying", entries.length, 0);
      await new Promise((resolve) => global.setTimeout(resolve, 0));
    }
    checkCancel();
    const imported = buildDeviceLogImportRows(entries, currentState);
    imported.rows.forEach((row, index) => {
      row.sourceLastModified = Number(entries[index].lastModified) || 0;
      row.prefixSha256 = entries[index].prefixSha256 || null;
    });
    entries.forEach((entry) => entry.prefix.fill(0));
    entries.length = 0;
    const existing = settings.existing;
    const oldRegistry = Array.isArray(existing?.registry) ? existing.registry : [];
    const oldByPath = new Map(oldRegistry.map((item) => [item.path, item]));
    const oldRowsByPath = new Map((existing?.rows || []).map((item) => [item.path, item]));
    const selectedPaths = new Set(imported.rows.map((item) => item.path));
    if (selectedPaths.size !== imported.rows.length) throw new Error("duplicate_log_path");
    const currentSrDigest = currentState?.srImports?.at(-1)?.rawSha256 || null;
    const oldSrDigest = existing?.indexes?.te?.sourceSrSha256 || null;
    const srChanged = Boolean(oldRegistry.length && oldSrDigest !== currentSrDigest);
    const changedOldFile = imported.rows.some((row) => {
      const old = oldByPath.get(row.path);
      return old && (old.size !== row.size || old.lastModified !== row.sourceLastModified
        || old.prefixSha256 !== row.prefixSha256 || old.format !== row.format || old.deviceId !== row.deviceId);
    });
    const fullRecheck = settings.forceRescan === true || srChanged || changedOldFile;
    if (fullRecheck && oldRegistry.some((item) => !selectedPaths.has(item.path))) throw new Error("log_full_reimport_required");
    const reuseExisting = oldRegistry.length > 0 && !fullRecheck;
    const rowsByPath = new Map(reuseExisting ? oldRowsByPath : []);
    const registryByPath = new Map(reuseExisting ? oldByPath : []);
    const currentDevices = new Map(currentState.inventoryDevices.filter((item) => item.inCurrentSr !== false).map((item) => [item.id, item]));
    const sharedLogContext={devices:currentDevices,locations:new Map((currentState.locations||[]).map((item)=>[item.id,item]))};
    const makeAccumulators = () => ({
      te: createHuaweiTeLogEventIndex(currentState,sharedLogContext),
      huawei310: createHuawei310LogEventIndex(currentState,sharedLogContext),
      huawei300Bar: createHuawei300LogEventIndex(currentState, "bar",sharedLogContext),
      huawei300Box: createHuawei300LogEventIndex(currentState, "box",sharedLogContext)
    });
    let accumulators = makeAccumulators();
    if(settings.onStart) await settings.onStart({fullRecheck});
    const checkpoint = settings.checkpoint && currentSrDigest ? settings.checkpoint : null;
    let checkpointScope = null;
    const checkpointKeys = [];
    let known = new Set();
    if (checkpoint) {
      checkpointScope = await sha256Text(JSON.stringify(["log-import-v1", currentSrDigest, fullRecheck]));
      known = new Set(await checkpoint.list(checkpointScope));
    }
    let processed = 0;
    let completedBytes = 0;
    const concurrency = settings.scanClient || typeof global.Worker !== "function" || global.location?.protocol === "file:"
      || (global.navigator?.hardwareConcurrency || 2) < 4 ? 1 : 2;
    const readByLane = Array(concurrency).fill(0);
    const readingProgress = () => report("analyzing", processed, completedBytes + readByLane.reduce((sum, value) => sum + value, 0));
    const clients = Array.from({ length: concurrency }, (_, lane) => settings.scanClient || LOG_SCAN_CLIENT.createLogScanClient({ onProgress: (done) => {
      physicalBytes += Math.max(0, done - readByLane[lane]);
      readByLane[lane] = done;
      readingProgress();
    } }));
    const client = { cancel() { for (const worker of clients) worker.cancel?.(); } };
    settings.onClient?.(client);
    const findOld = (row) => {
      const old = reuseExisting ? oldByPath.get(row.path) : null;
      return old && old.analysisStatus !== "Ошибка разбора" && old.format !== "Ошибка чтения"
        && old.size === row.size && old.lastModified === row.sourceLastModified
        && old.prefixSha256 === row.prefixSha256 && old.format === row.format && old.deviceId === row.deviceId ? old : null;
    };
    async function scanEntry(index, lane) {
      checkCancel();
      const row = imported.rows[index];
      const old = findOld(row);
      if (old) return { old };
      const device = currentDevices.get(row.deviceId);
      const model = auditModelToken(device?.modelRaw);
      const huawei = row.matchStatus === "Сопоставлено" && device?.category === "vcs"
        && normalizeManufacturer(device.manufacturerNormalized || device.manufacturerRaw) === "huawei";
      const kind = huawei && row.format === "Huawei TE XML" && ["te20", "te30", "te40", "te50", "te60"].includes(model) ? "te"
        : huawei && row.format === "Huawei 310 XML" && ["bar310", "box310", "box610"].includes(model) ? "huawei310"
          : huawei && row.format === "Huawei 300 XML" && ["bar300", "box300", "box600"].includes(model) ? "huawei300" : null;
      const key = checkpoint && kind && row.prefixSha256 ? await sha256Text(JSON.stringify(
        [row.path, row.size, row.sourceLastModified, row.prefixSha256, row.format, row.deviceId, model])) : null;
      if (key && known.has(key)) {
        const stored = await checkpoint.read(checkpointScope, key);
        if (stored?.kind === kind && (kind ? stored.scan?.ok === true : stored.scan === null)) {
          checkpointKeys.push(key);
          return { kind, scan: stored.scan, recovered: true };
        }
      }
      let scan = null;
      if (kind) {
        try { scan = await clients[lane].scan(sourceFiles[index], kind, model); }
        catch (error) {
          if (shouldCancel() || error?.message === "log_scan_cancelled") throw new Error("log_import_cancelled");
          if (error?.message === "log_worker_failed") throw error;
          scan = { ok: false, reason: "read_failed", markers: [] };
        }
      }
      if (fullRecheck && oldByPath.has(row.path)
        && (row.format === "Ошибка чтения" || row.matchStatus !== "Сопоставлено" || (kind && !scan?.ok)))
        throw new Error("log_recheck_incomplete");
      // First persist a completed analysis; only then acknowledge the file in progress.
      if (key && scan?.ok) {
        await checkpoint.write(checkpointScope, key, { kind, scan });
        checkpointKeys.push(key);
        savedFiles += 1;
      }
      checkCancel();
      return { kind, scan };
    }
    try {
      scanStart = monotonicNow();
      report("analyzing", 0, 0);
      let wave = [];
      for (let index = 0; index < sourceFiles.length; index += 1) {
        checkCancel();
        const row = imported.rows[index];
        const lane = index % concurrency;
        if (lane === 0) {
          wave = await Promise.all(Array.from({ length: Math.min(concurrency, sourceFiles.length - index) },
            (_, slot) => scanEntry(index + slot, slot)));
        }
        const { old, kind, scan, recovered } = wave[lane];
        readByLane[lane] = 0;
        if (old) {
          const previousRow = oldRowsByPath.get(row.path);
          row.analysisStatus = previousRow?.analysisStatus || old.analysisStatus || "Ранее обработан";
          rowsByPath.set(row.path, previousRow || row);
          registryByPath.set(row.path, old);
          skippedFiles += 1;
          processed += 1;
          completedBytes += Number(sourceFiles[index].size || 0);
          readingProgress();
          if ((index + 1) % 8 === 0) await new Promise((resolve) => global.setTimeout(resolve, 0));
          continue;
        }
        if (recovered) { skippedFiles += 1; recoveredFiles += 1; }
        row.analysisStatus = row.format === "Polycom Group TGZ" && row.matchStatus === "Сопоставлено" ? "Архив Polycom: только метаданные"
          : !kind ? "Вне анализа Huawei TE/310/300" : scan?.ok ? `Маркеров: ${scan.markers.length}` : "Ошибка разбора";
        const entry = { row, scan };
        for (const accumulator of Object.values(accumulators)) accumulator.add(entry);
        rowsByPath.set(row.path, row);
        const registry = { path: row.path, size: row.size, lastModified: row.sourceLastModified,
          prefixSha256: row.prefixSha256, format: row.format, deviceId: row.deviceId,
          contentDigest: scan?.contentDigest || null, digestAlgorithm: scan?.digestAlgorithm || null,
          analysisStatus: row.analysisStatus, analysisDigest: scan?.ok
            ? await sha256Text(JSON.stringify({ markers: scan.markers, bootGaps: scan.bootGaps || [] })) : null };
        registryByPath.set(row.path, registry);
        if(settings.onEntry) {
          const indexes = Object.fromEntries(Object.entries(accumulators).map(([family, accumulator])=>[family,accumulator.finish()]));
          await settings.onEntry({row,registry,indexes});
          accumulators = makeAccumulators();
        }
        processed += 1;
        completedBytes += Number(sourceFiles[index].size || 0);
        readingProgress();
        if ((index + 1) % 8 === 0) await new Promise((resolve) => global.setTimeout(resolve, 0));
      }
      checkCancel();
      report("summarizing", processed, completedBytes);
      await cooperativeBrowserYield();
      checkCancel();
      const incoming = Object.fromEntries(Object.entries(accumulators).map(([kind, accumulator]) => [kind, accumulator.finish()]));
      const indexes = reuseExisting ? Object.fromEntries(Object.entries(incoming).map(([kind, value]) =>
        [kind, mergeLogEventIndexes(existing.indexes?.[kind], value)])) : incoming;
      const rows = [...rowsByPath.values()];
      const teRows = rows.filter((row) => row.format === "Huawei TE XML" && row.matchStatus === "Сопоставлено"
        && ["te20", "te30", "te40", "te50", "te60"].includes(auditModelToken(currentDevices.get(row.deviceId)?.modelRaw)));
      const h310Rows = rows.filter((row) => row.format === "Huawei 310 XML" && row.matchStatus === "Сопоставлено"
        && ["bar310", "box310", "box610"].includes(auditModelToken(currentDevices.get(row.deviceId)?.modelRaw)));
      const h300BarRows = rows.filter((row) => row.format === "Huawei 300 XML" && row.matchStatus === "Сопоставлено"
        && auditModelToken(currentDevices.get(row.deviceId)?.modelRaw) === "bar300");
      const h300BoxRows = rows.filter((row) => row.format === "Huawei 300 XML" && row.matchStatus === "Сопоставлено"
        && ["box300", "box600"].includes(auditModelToken(currentDevices.get(row.deviceId)?.modelRaw)));
      indexes.te.coverage.files = rows.length;
      indexes.te.coverage.invalidFiles = teRows.filter((row) => row.analysisStatus === "Ошибка разбора").length;
      for (const [kind, group] of [["huawei310", h310Rows], ["huawei300Bar", h300BarRows], ["huawei300Box", h300BoxRows]]) {
        indexes[kind].coverage.files = group.length;
        indexes[kind].coverage.invalidFiles = group.filter((row) => row.analysisStatus === "Ошибка разбора").length;
      }
      return { rows, summary: summarizeDeviceLogRows(rows), indexes, registry: [...registryByPath.values()], skippedFiles, recoveredFiles,
        checkpoint: checkpointKeys.length ? { scope: checkpointScope, keys: checkpointKeys } : null };
    } finally {
      for (const worker of clients) worker.close?.();
    }
  }

  const LOG_EVENT_SOURCE_SAMPLE_LIMIT = 16;

  function importProgressDisplay(progress) {
    const completed=progress?.status==="completed";
    const indeterminate=!completed&&(progress?.status==="saving"||!progress?.total);
    return {indeterminate,percent:completed?100:Math.min(99,Math.max(0,Math.round((progress?.processed||0)/Math.max(1,progress?.total||0)*100)))};
  }

  function createImportActivity(kind,at=Date.now()) {
    return {kind,startedAt:at,sampleAt:at,samplePercent:0,percent:0,phase:"preparing",status:"running",rate:null,caption:"Подготовка"};
  }

  function advanceImportActivity(previous,update,at=Date.now()) {
    if(!previous||previous.status!=="running")return previous;
    const phase=update.phase||previous.phase;
    const limits=phase==="publishing"?[80,99]:phase==="staging"?[60,80]:phase==="classifying"?[0,5]
      :phase==="analyzing"?(previous.kind==="sr"?[5,60]:[5,80]):[0,0];
    const ratio=Number.isFinite(update.total)&&update.total>0&&Number.isFinite(update.done)?Math.min(1,Math.max(0,update.done/update.total)):0;
    const percent=Math.max(previous.percent,Math.min(99,limits[0]+(limits[1]-limits[0])*ratio));
    const next={...previous,phase,percent,caption:update.caption||previous.caption};
    if(phase!==previous.phase&&previous.percent>0){next.sampleAt=at;next.samplePercent=previous.percent;next.rate=null;}
    const seconds=(at-next.sampleAt)/1000;
    if(seconds>=0.5&&percent>next.samplePercent){
      const measured=(percent-next.samplePercent)/seconds;
      next.rate=next.rate?next.rate*.65+measured*.35:measured;
      next.sampleAt=at;next.samplePercent=percent;
    }
    return next;
  }

  function importActivityView(activity,at=Date.now()) {
    if(!activity)return {percent:0,etaSeconds:null,elapsedSeconds:0};
    const completed=["completed","partial"].includes(activity.status);
    const percent=completed?100:Math.min(99,Math.max(0,Math.floor(activity.percent)));
    const elapsedSeconds=Math.max(0,((activity.finishedAt??at)-activity.startedAt)/1000);
    const sinceSample=Math.max(0,(at-activity.sampleAt)/1000);
    const remaining=activity.rate?(100-activity.percent)/activity.rate-sinceSample:null;
    const etaSeconds=completed?0:activity.status==="running"&&remaining>0&&sinceSample<30?remaining:null;
    return {percent,etaSeconds,elapsedSeconds};
  }

  function logImportBlockReason(candidate, runtimeKind, revision) {
    if(candidate.logImportBusy)return "Импорт логов уже выполняется. Дождитесь завершения или остановите его.";
    if(candidate.inventoryBusy)return "Сейчас выполняется импорт SR или JSON. Дождитесь его завершения и сохранения базы.";
    if(candidate.dbPrepare||candidate.dbOperationLoading)return "Подготавливается рабочая база и контекст устройств. Дождитесь завершения.";
    if(runtimeKind==="local"&&candidate.adminAccess?.adminUnlocked!==true)return "Сначала войдите в локальный доступ инструмента.";
    if(runtimeKind==="local"&&candidate.workspaceStatus?.status!=="ready")return "Сначала подключите рабочую папку базы данных.";
    if(candidate.dbMode&&(!revision||candidate.dbOperationalRevision!==revision))return "Контекст устройств ещё не подтверждён. Повторите подключение рабочей базы.";
    return null;
  }
  function logDeviceContext(candidateState) {
    const inventory = candidateState?.inventoryDevices || [], locations = candidateState?.locations || [];
    return {devices:new Map(inventory.filter((item)=>item.inCurrentSr!==false).map((item)=>[item.id,item])),
      locations:new Map(locations.map((item)=>[item.id,item]))};
  }

  function createHuaweiTeLogEventIndex(currentState,context) {
    const {devices,locations}=context||logDeviceContext(currentState);
    const events = new Map();
    const coverage = { files: 0, scannedFiles: 0, te20Files: 0, excludedFiles: 0, ambiguousFiles: 0, invalidFiles: 0, unknownStarts: 0, confirmedReboots: 0, powerOffs: 0, gapCandidates: 0 };
    function add(entry) {
      coverage.files += 1;
      const row = entry?.row || {};
      if (row.matchStatus !== "Сопоставлено") { coverage.excludedFiles += 1; if (row.matchStatus === "Неоднозначный IP") coverage.ambiguousFiles += 1; return; }
      const device = devices.get(row.deviceId);
      const model = auditModelToken(device?.modelRaw);
      if (!device || row.ip !== normalizeIpv4(device.ipNormalized || device.ipRaw) || device.category !== "vcs" || normalizeManufacturer(device.manufacturerNormalized || device.manufacturerRaw) !== "huawei" || !["te20", "te30", "te40", "te50", "te60"].includes(model) || row.format !== "Huawei TE XML") { coverage.excludedFiles += 1; return; }
      if (!entry.scan?.ok || !Array.isArray(entry.scan.markers)) { coverage.invalidFiles += 1; return; }
      coverage.scannedFiles += 1;
      if (model === "te20") coverage.te20Files += 1;
      const location = locations.get(device.locationId);
      const gapsByBoot = new Map((entry.scan.bootGaps || []).map((gap) => [gap.bootLocalAt, gap]));
      for (const parsed of TE_LOG_EVENTS.deriveEvents(entry.scan.markers)) {
        const family = parsed.kind === "power_off" ? "power_off" : "start";
        const key = `${device.id}|${family}|${parsed.localAt}`;
        const source = { path: String(row.path || "").slice(0, 512), line: parsed.lineNumber, markerLines: (parsed.markerLineNumbers || []).filter(Number.isSafeInteger).slice(0, 16) };
        const gap = parsed.kind === "unknown_start" ? gapsByBoot.get(parsed.localAt) : null;
        const silenceGap = gap && Number.isSafeInteger(gap.gapSeconds) && gap.gapSeconds > 0
          ? { seconds: gap.gapSeconds, minutes: gap.gapMinutes, fromLocalAt: gap.fromLocalAt, toLocalAt: gap.toLocalAt,
              knownAction: gap.knownAction === true, clockAnomalyOrLongGap: gap.clockAnomalyOrLongGap === true } : null;
        const prior = events.get(key);
        if (prior) {
          const existingSource = prior.sources.find((item) => item.path === source.path && item.line === source.line);
          if (!existingSource) {
            prior.sourceCount += 1;
            if (prior.sources.length < LOG_EVENT_SOURCE_SAMPLE_LIMIT) prior.sources.push(source);
          } else if (source.markerLines.length > existingSource.markerLines.length) existingSource.markerLines = source.markerLines;
          if (prior.kind === "unknown_start" && parsed.kind === "confirmed_reboot") {
            prior.kind = "confirmed_reboot";
            prior.ruleVersion = model === "te20" ? TE_LOG_EVENTS.TE20_RULE_VERSION : TE_LOG_EVENTS.RULE_VERSION;
          }
          if (!prior.shutdownMethod && parsed.method) prior.shutdownMethod = parsed.method;
          if (silenceGap && prior.kind === "unknown_start") {
            const previous = prior.silenceGap;
            prior.silenceGap = previous && previous.seconds <= silenceGap.seconds ? previous : silenceGap;
            if (previous?.knownAction || silenceGap.knownAction) prior.silenceGap.knownAction = true;
            if (previous?.clockAnomalyOrLongGap || silenceGap.clockAnomalyOrLongGap) prior.silenceGap.clockAnomalyOrLongGap = true;
          }
          continue;
        }
        events.set(key, { id: key, kind: parsed.kind, deviceId: device.id, deviceName: device.nameRaw || device.modelRaw || "Устройство без названия",
          category: device.category, manufacturer: device.manufacturerRaw || "Huawei", model: device.modelRaw || "Не указано", ip: row.ip,
          mac: device.macNormalized || device.macRaw || "Не указано", vip: Boolean(device.deviceVip || location?.vip),
          locationId: location?.id || device.locationId || null, locationName: location?.name || "Не указано", address: location?.address || "Не указано",
          estimatedAt: new Date(parsed.timeMs).toISOString(), deviceLocalTime: parsed.localAt, timeBasis: "device_local_unknown_timezone",
          ruleVersion: model === "te20" ? TE_LOG_EVENTS.TE20_RULE_VERSION : TE_LOG_EVENTS.RULE_VERSION,
          shutdownMethod: parsed.method || null, silenceGap, sources: [source], sourceCount: 1 });
      }
    }
    function finish() {
    const ordered = [...events.values()].sort((a, b) => timeValue(b.estimatedAt) - timeValue(a.estimatedAt) || a.id.localeCompare(b.id));
    coverage.confirmedReboots = ordered.filter((item) => item.kind === "confirmed_reboot").length;
    coverage.powerOffs = ordered.filter((item) => item.kind === "power_off").length;
    coverage.unknownStarts = ordered.filter((item) => item.kind === "unknown_start").length;
    coverage.gapCandidates = ordered.filter((item) => item.kind === "unknown_start" && item.silenceGap).length;
    return { events: ordered, coverage, sourceSrSha256: currentState?.srImports?.at(-1)?.rawSha256 || null };
    }
    return { add, finish };
  }

  function buildHuaweiTeLogEventIndex(scannedEntries, currentState) {
    const accumulator = createHuaweiTeLogEventIndex(currentState);
    for (const entry of scannedEntries || []) accumulator.add(entry);
    return accumulator.finish();
  }

  function createHuawei310LogEventIndex(currentState,context) {
    const {devices,locations}=context||logDeviceContext(currentState);
    const events = new Map();
    const coverage = { files: 0, scannedFiles: 0, excludedFiles: 0, invalidFiles: 0, boxFiles: 0, confirmedReboots: 0, unknownStarts: 0, startsAfterShutdown: 0, powerOffs: 0, gapCandidates: 0 };
    function add(entry) {
      const row = entry?.row || {};
      if (row.format !== "Huawei 310 XML") return;
      coverage.files += 1;
      const device = devices.get(row.deviceId);
      const model = auditModelToken(device?.modelRaw);
      if (row.matchStatus !== "Сопоставлено" || !device || row.ip !== normalizeIpv4(device.ipNormalized || device.ipRaw) || device.category !== "vcs" || normalizeManufacturer(device.manufacturerNormalized || device.manufacturerRaw) !== "huawei") { coverage.excludedFiles += 1; return; }
      const isBox = ["box310", "box610"].includes(model);
      if (model !== "bar310" && !isBox) { coverage.excludedFiles += 1; return; }
      if (!entry.scan?.ok || !Array.isArray(entry.scan.markers)) { coverage.invalidFiles += 1; return; }
      coverage.scannedFiles += 1;
      if (isBox) coverage.boxFiles += 1;
      const ruleVersion = isBox ? `huawei-${model}-log-v1` : HUAWEI_310_LOG_EVENTS.RULE_VERSION;
      const location = locations.get(device.locationId);
      const gapsByBoot = new Map((entry.scan.bootGaps || []).map((gap) => [gap.bootLocalAt, gap]));
      for (const parsed of HUAWEI_310_LOG_EVENTS.deriveEvents(entry.scan.markers)) {
        const key = `${device.id}|${parsed.kind === "power_off" ? "power_off" : "start"}|${parsed.localAt}`;
        const source = { path: String(row.path || "").slice(0, 512), line: parsed.lineNumber, markerLines: parsed.markerLineNumbers.filter(Number.isSafeInteger).slice(0, 16) };
        const gap = parsed.kind === "unknown_start" ? gapsByBoot.get(parsed.localAt) : null;
        const silenceGap = gap && Number.isSafeInteger(gap.gapSeconds) && gap.gapSeconds > 0
          ? { seconds: gap.gapSeconds, minutes: gap.gapMinutes, fromLocalAt: gap.fromLocalAt, toLocalAt: gap.toLocalAt,
              knownAction: gap.knownAction === true, clockAnomalyOrLongGap: gap.clockAnomalyOrLongGap === true } : null;
        const prior = events.get(key);
        if (prior) {
          if (!prior.sources.some((item) => item.path === source.path && item.line === source.line)) {
            prior.sourceCount += 1;
            if (prior.sources.length < LOG_EVENT_SOURCE_SAMPLE_LIMIT) prior.sources.push(source);
          }
          const eventPriority = { unknown_start: 0, start_after_shutdown: 1, confirmed_reboot: 2, power_off: 2 };
          if ((eventPriority[parsed.kind] ?? 0) > (eventPriority[prior.kind] ?? 0)) { prior.kind = parsed.kind; prior.ruleVersion = ruleVersion; }
          if (!prior.actionMethod && parsed.method) prior.actionMethod = parsed.method;
          if (silenceGap && prior.kind === "unknown_start") {
            const previous = prior.silenceGap;
            prior.silenceGap = previous && previous.seconds <= silenceGap.seconds ? previous : silenceGap;
            if (previous?.knownAction || silenceGap.knownAction) prior.silenceGap.knownAction = true;
            if (previous?.clockAnomalyOrLongGap || silenceGap.clockAnomalyOrLongGap) prior.silenceGap.clockAnomalyOrLongGap = true;
          }
          continue;
        }
        events.set(key, { id: key, kind: parsed.kind, deviceId: device.id, deviceName: device.nameRaw || device.modelRaw || "Устройство без названия",
          category: device.category, manufacturer: device.manufacturerRaw || "Huawei", model: device.modelRaw || "Bar 310", ip: row.ip,
          mac: device.macNormalized || device.macRaw || "Не указано", vip: Boolean(device.deviceVip || location?.vip),
          locationId: location?.id || device.locationId || null, locationName: location?.name || "Не указано", address: location?.address || "Не указано",
          estimatedAt: new Date(parsed.timeMs).toISOString(), deviceLocalTime: parsed.localAt, timeBasis: "device_local_unknown_timezone",
          ruleVersion, ...(isBox ? { validationStatus: "confirmed_user_validation" } : {}), actionMethod: parsed.method || null, shutdownMethod: parsed.kind === "power_off" ? parsed.method || null : null, silenceGap, sources: [source], sourceCount: 1 });
      }
    }
    function finish() {
    const ordered = [...events.values()].sort((a, b) => timeValue(b.estimatedAt) - timeValue(a.estimatedAt) || a.id.localeCompare(b.id));
    coverage.confirmedReboots = ordered.filter((item) => item.kind === "confirmed_reboot").length;
    coverage.unknownStarts = ordered.filter((item) => item.kind === "unknown_start").length;
    coverage.startsAfterShutdown = ordered.filter((item) => item.kind === "start_after_shutdown").length;
    coverage.powerOffs = ordered.filter((item) => item.kind === "power_off").length;
    coverage.gapCandidates = ordered.filter((item) => item.kind === "unknown_start" && item.silenceGap).length;
    return { events: ordered, coverage, sourceSrSha256: currentState?.srImports?.at(-1)?.rawSha256 || null };
    }
    return { add, finish };
  }

  function buildHuawei310LogEventIndex(scannedEntries, currentState) {
    const accumulator = createHuawei310LogEventIndex(currentState);
    for (const entry of scannedEntries || []) accumulator.add(entry);
    return accumulator.finish();
  }

  function createHuawei300LogEventIndex(currentState, modelGroup = "bar",context) {
    const allowedModels = modelGroup === "box" ? ["box300", "box600"] : ["bar300"];
    const {devices,locations}=context||logDeviceContext(currentState);
    const events = new Map();
    const coverage = { files: 0, scannedFiles: 0, excludedFiles: 0, invalidFiles: 0, unknownStarts: 0, startsAfterShutdown: 0, confirmedReboots: 0, powerOffs: 0, gapCandidates: 0 };
    function add(entry) {
      const row = entry?.row || {};
      if (row.format !== "Huawei 300 XML") return;
      const device = devices.get(row.deviceId);
      const model = auditModelToken(device?.modelRaw);
      if (!allowedModels.includes(model)) return;
      coverage.files += 1;
      if (row.matchStatus !== "Сопоставлено" || !device || row.ip !== normalizeIpv4(device.ipNormalized || device.ipRaw)
        || device.category !== "vcs" || normalizeManufacturer(device.manufacturerNormalized || device.manufacturerRaw) !== "huawei") { coverage.excludedFiles += 1; return; }
      if (!entry.scan?.ok || !Array.isArray(entry.scan.markers)) { coverage.invalidFiles += 1; return; }
      coverage.scannedFiles += 1;
      const location = locations.get(device.locationId);
      const gapsByBoot = new Map((entry.scan.bootGaps || []).map((gap) => [gap.bootLocalAt, gap]));
      for (const parsed of HUAWEI_300_LOG_EVENTS.deriveEvents(entry.scan.markers)) {
        const key = `${device.id}|${parsed.kind === "power_off" ? "power_off" : "start"}|${parsed.localAt}`;
        const source = { path: String(row.path || "").slice(0, 512), line: parsed.lineNumber, markerLines: (parsed.markerLineNumbers || []).filter(Number.isSafeInteger).slice(0, 16) };
        const gap = parsed.kind === "unknown_start" ? gapsByBoot.get(parsed.localAt) : null;
        const silenceGap = gap && Number.isSafeInteger(gap.gapSeconds) && gap.gapSeconds > 0
          ? { seconds: gap.gapSeconds, minutes: gap.gapMinutes, fromLocalAt: gap.fromLocalAt, toLocalAt: gap.toLocalAt,
              knownAction: gap.knownAction === true, clockAnomalyOrLongGap: gap.clockAnomalyOrLongGap === true } : null;
        const prior = events.get(key);
        if (prior) {
          if (!prior.sources.some((item) => item.path === source.path && item.line === source.line)) {
            prior.sourceCount += 1;
            if (prior.sources.length < LOG_EVENT_SOURCE_SAMPLE_LIMIT) prior.sources.push(source);
          }
          if (prior.kind === "unknown_start" && parsed.kind === "start_after_shutdown") { prior.kind = parsed.kind; prior.silenceGap = null; prior.actionMethod = parsed.method || null; if (modelGroup === "bar") prior.validationStatus = "confirmed_local_validation"; }
          if (silenceGap && prior.kind === "unknown_start" && (!prior.silenceGap || silenceGap.seconds < prior.silenceGap.seconds)) prior.silenceGap = silenceGap;
          continue;
        }
        events.set(key, { id: key, kind: parsed.kind, deviceId: device.id, deviceName: device.nameRaw || device.modelRaw || "Устройство без названия",
          category: device.category, manufacturer: device.manufacturerRaw || "Huawei", model: device.modelRaw || "Не указано", ip: row.ip,
          mac: device.macNormalized || device.macRaw || "Не указано", vip: Boolean(device.deviceVip || location?.vip),
          locationId: location?.id || device.locationId || null, locationName: location?.name || "Не указано", address: location?.address || "Не указано",
          estimatedAt: new Date(parsed.timeMs).toISOString(), deviceLocalTime: parsed.localAt, timeBasis: "device_local_unknown_timezone",
          ruleVersion: model === "bar300" ? HUAWEI_300_LOG_EVENTS.RULE_VERSION : `huawei-${model}-log-v2`,
          validationStatus: modelGroup === "box" ? "confirmed_user_validation" : parsed.kind === "power_off" || parsed.kind === "start_after_shutdown" ? "confirmed_local_validation" : "bar300_boot_observed",
          actionMethod: parsed.method || null, shutdownMethod: parsed.kind === "power_off" ? parsed.method || null : null,
          silenceGap, sources: [source], sourceCount: 1 });
      }
    }
    function finish() {
    const ordered = [...events.values()].sort((a, b) => timeValue(b.estimatedAt) - timeValue(a.estimatedAt) || a.id.localeCompare(b.id));
    coverage.unknownStarts = ordered.filter((item) => item.kind === "unknown_start").length;
    coverage.startsAfterShutdown = ordered.filter((item) => item.kind === "start_after_shutdown").length;
    coverage.powerOffs = ordered.filter((item) => item.kind === "power_off").length;
    coverage.gapCandidates = ordered.filter((item) => item.kind === "unknown_start" && item.silenceGap).length;
    return { events: ordered, coverage, validationStatus: modelGroup === "box" ? "confirmed_user_validation" : "bar300_boot_observed",
      sourceSrSha256: currentState?.srImports?.at(-1)?.rawSha256 || null };
    }
    return { add, finish };
  }

  function buildHuawei300LogEventIndex(scannedEntries, currentState, modelGroup = "bar") {
    const accumulator = createHuawei300LogEventIndex(currentState, modelGroup);
    for (const entry of scannedEntries || []) accumulator.add(entry);
    return accumulator.finish();
  }

  function ensurePollingRun(next, input, capturedAt) {
    if (input.runId) return next.pollingRuns.find((item) => item.id === input.runId) || null;
    const folderIdentity = input.folderPath || input.folderName || "manual";
    const key = `${capturedAt}|${folderIdentity}`;
    let run = next.pollingRuns.find((item) => item.identityKey === key);
    if (!run) {
      run = { id: createId("polling-run"), kind: "import", identityKey: key, folderName: input.folderName || null, folderPath: input.folderPath || input.folderName || null, capturedAt, capturedAtSource: input.capturedAtSource || "manual", importedAt: input.importedAt || nowIso(), importedById: input.actorId || "system", fileCount: 0, successCount: 0, errorCount: 0 };
      next.pollingRuns.push(run);
    }
    return run;
  }

  const POLLING_ALL = "*";
  const POLLING_MISSING = "__not_specified__";
  const POLLING_SELECTION_MODE_FILTERS = "filters";
  const POLLING_SELECTION_MODE_SINGLE_IP = "single_ip";
  const MANAGEMENT_TASK_DISABLE_INSECURE_SERVICES = "disable_insecure_management_services";
  const MANAGEMENT_TASK_TE20_AUTO_ANSWER = "set_te20_auto_answer_automatic";
  const MANAGEMENT_TASK_TE20_MANUAL_ANSWER = "set_te20_auto_answer_manual";
  const TE_FAMILY_ANSWER_TASK_BY_MODE = Object.freeze({ automatic: "set_te_family_auto_answer_automatic", manual: "set_te_family_auto_answer_manual" });
  const HUAWEI_310_ANSWER_TASK_BY_MODE = Object.freeze({ automatic: "set_huawei_310_auto_answer_automatic", manual: "set_huawei_310_auto_answer_manual" });
  const HUAWEI_300_ANSWER_TASK_BY_MODE = Object.freeze({ automatic: "set_huawei_300_auto_answer_automatic", manual: "set_huawei_300_auto_answer_manual" });
  const MANAGEMENT_TASK_POLYCOM_ANSWER = "set_polycom_group_auto_answer";
  const MANAGEMENT_TASK_TE20_DISABLE_AUTO_UPDATE = "disable_te20_auto_update";
  const TE20_SSH_TASK_BY_MODE = Object.freeze({ enable: "set_te20_ssh_enabled", disable: "set_te20_ssh_disabled" });
  const MANAGEMENT_TASK_TE20_NTP = "set_te20_ntp_settings";
  const MANAGEMENT_TASK_TE20_POWER = "set_te20_power_settings";
  const TE20_SLEEP_VALUES = Object.freeze([0, 1, 5, 10, 15, 30, 60]);
  const TE20_PORT_TASK_BY_MODE = Object.freeze({
    http: Object.freeze({ open: "set_te20_http_open", close: "set_te20_http_closed" }),
    telnet: Object.freeze({ open: "set_te20_telnet_open", close: "set_te20_telnet_closed" })
  });

  function pollingCategoryOrder(category) {
    const item = EQUIPMENT_CATEGORY_CATALOG.find((candidate) => candidate.id === category);
    return item ? item.order : Number.MAX_SAFE_INTEGER;
  }

  function pollingDimensionValue(device, dimension) {
    if (dimension === "domains") return normalizeText(device?.domain) || POLLING_MISSING;
    if (dimension === "categories") return normalizeText(device?.category) || POLLING_MISSING;
    if (dimension === "manufacturers") return normalizeManufacturer(device?.manufacturerNormalized || device?.manufacturerRaw) || POLLING_MISSING;
    return normalizeText(device?.modelNormalized || device?.modelRaw) || POLLING_MISSING;
  }

  function normalizePollingSelection(values, available) {
    const source = Array.isArray(values) ? values.map(String) : values ? [String(values)] : [];
    if (source.includes(POLLING_ALL)) return available.length ? [POLLING_ALL] : [];
    const allowed = new Set(available.map((item) => item.value));
    return [...new Set(source.filter((value) => allowed.has(value)))];
  }

  function pollingOptions(devices, dimension) {
    const labels = new Map();
    for (const device of devices) {
      const value = pollingDimensionValue(device, dimension);
      if (labels.has(value)) continue;
      let label = "Не указано";
      if (dimension === "domains") label = normalizeDisplay(device.domain) || "Не указано";
      else if (dimension === "categories") label = formatCategoryLabel(value);
      else if (dimension === "manufacturers") label = normalizeDisplay(device.manufacturerRaw || device.manufacturerNormalized) || "Не указано";
      else label = normalizeDisplay(device.modelRaw || device.modelNormalized) || "Не указано";
      labels.set(value, label);
    }
    return [...labels].map(([value, label]) => ({ value, label })).sort((left, right) => {
      if (dimension === "categories") return pollingCategoryOrder(left.value) - pollingCategoryOrder(right.value);
      return left.label.localeCompare(right.label, "ru", { sensitivity: "base" });
    });
  }

  function matchesPollingSelection(device, dimension, selection) {
    return selection.includes(POLLING_ALL) || selection.includes(pollingDimensionValue(device, dimension));
  }

  function sortPollingDevices(devices) {
    const textCollator = new Intl.Collator("ru", { sensitivity: "base" });
    const ipCollator = new Intl.Collator("en", { numeric: true });
    return devices.map((device) => ({
      device,
      categoryOrder: pollingCategoryOrder(device.category),
      manufacturer: normalizeDisplay(device.manufacturerRaw || device.manufacturerNormalized),
      model: normalizeDisplay(device.modelRaw || device.modelNormalized),
      ip: String(device.ipNormalized || ""),
      id: String(device.id || "")
    })).sort((left, right) => left.categoryOrder - right.categoryOrder
      || textCollator.compare(left.manufacturer, right.manufacturer)
      || textCollator.compare(left.model, right.model)
      || ipCollator.compare(left.ip, right.ip)
      || left.id.localeCompare(right.id)).map((item) => item.device);
  }

  function resolvePollingIpTarget(currentState, rawIp) {
    const displayIp = normalizeDisplay(rawIp);
    if (!displayIp) return Object.freeze({ status: "empty", normalizedIp: null, candidateCount: 0, device: null });
    const normalizedIp = normalizeIpv4(displayIp);
    if (!normalizedIp) return Object.freeze({ status: "invalid", normalizedIp: null, candidateCount: 0, device: null });
    const candidates = currentState.inventoryDevices.filter((device) => device.inCurrentSr !== false && device.ipNormalized === normalizedIp);
    if (!candidates.length) return Object.freeze({ status: "not_found", normalizedIp, candidateCount: 0, device: null });
    if (candidates.length !== 1) return Object.freeze({ status: "ambiguous", normalizedIp, candidateCount: candidates.length, device: null });
    return Object.freeze({ status: "found", normalizedIp, candidateCount: 1, device: candidates[0] });
  }

  function supportsManagementTask(device, taskId) {
    const capability = resolvePollingCapability(device);
    return capability.support === "implemented"
      && Array.isArray(capability.managementTasks)
      && capability.managementTasks.includes(taskId);
  }

  function deriveAutomaticPollingPlan(currentState, input) {
    const selection = input || {};
    const mode = selection.mode === POLLING_SELECTION_MODE_SINGLE_IP ? POLLING_SELECTION_MODE_SINGLE_IP : POLLING_SELECTION_MODE_FILTERS;
    const usesManagementTargetList = selection.disableInsecureManagementServices === true;
    const inventorySource = usesManagementTargetList && Array.isArray(selection.managementTargetDevices)
      ? selection.managementTargetDevices
      : currentState.inventoryDevices;
    const inventory = inventorySource.filter((device) => device.inCurrentSr !== false && EQUIPMENT_CATEGORY_IDS.includes(device.category));
    const availableDomains = pollingOptions(inventory, "domains");
    const domains = normalizePollingSelection(Object.prototype.hasOwnProperty.call(selection, "domains") ? selection.domains : [POLLING_ALL], availableDomains);
    const domainDevices = domains.length ? inventory.filter((device) => matchesPollingSelection(device, "domains", domains)) : [];
    const availableCategories = pollingOptions(domainDevices, "categories");
    const categories = normalizePollingSelection(selection.categories, availableCategories);
    const categoryDevices = categories.length ? domainDevices.filter((device) => matchesPollingSelection(device, "categories", categories)) : [];
    const availableManufacturers = pollingOptions(categoryDevices, "manufacturers");
    const manufacturers = normalizePollingSelection(selection.manufacturers, availableManufacturers);
    const manufacturerDevices = manufacturers.length ? categoryDevices.filter((device) => matchesPollingSelection(device, "manufacturers", manufacturers)) : [];
    const availableModels = pollingOptions(manufacturerDevices, "models");
    const models = normalizePollingSelection(selection.models, availableModels);
    const filteredDevices = sortPollingDevices(models.length ? manufacturerDevices.filter((device) => matchesPollingSelection(device, "models", models)) : []);
    const ipResolution = resolvePollingIpTarget({ inventoryDevices: inventory }, selection.ipAddress);
    const selectedDevices = mode === POLLING_SELECTION_MODE_SINGLE_IP
      ? (ipResolution.status === "found" ? [ipResolution.device] : [])
      : filteredDevices;
    const supportedDevices = [];
    const unsupportedDevices = [];
    selectedDevices.forEach((device) => {
      const capability = resolvePollingCapability(device);
      (device.ipNormalized && capability.support === "implemented" && capability.transport ? supportedDevices : unsupportedDevices).push(device);
    });
    const managementEligibleDevices = selectedDevices.filter((device) => supportsManagementTask(device, MANAGEMENT_TASK_DISABLE_INSECURE_SERVICES));
    const managementSkippedDevices = selectedDevices.filter((device) => !supportsManagementTask(device, MANAGEMENT_TASK_DISABLE_INSECURE_SERVICES));
    return Object.freeze({
      mode,
      targetSource: usesManagementTargetList ? "port_closure_list" : "sr",
      availableDomains: Object.freeze(availableDomains),
      availableCategories: Object.freeze(availableCategories),
      availableManufacturers: Object.freeze(availableManufacturers),
      availableModels: Object.freeze(availableModels),
      selection: Object.freeze({ mode, domains: Object.freeze(domains), categories: Object.freeze(categories), manufacturers: Object.freeze(manufacturers), models: Object.freeze(models) }),
      ipResolution,
      selectedDevices: Object.freeze(selectedDevices),
      supportedDevices: Object.freeze(supportedDevices),
      unsupportedDevices: Object.freeze(unsupportedDevices),
      managementEligibleDevices: Object.freeze(managementEligibleDevices),
      managementSkippedDevices: Object.freeze(managementSkippedDevices)
    });
  }

  function isZeroIntervalRange(input) {
    return [input?.intervalMinSeconds, input?.intervalMaxSeconds].every((value) =>
      value !== undefined && value !== null && String(value).trim() !== "" && Number(value) === 0);
  }

  function pollingStartEnabled(selection, zeroIntervalAcknowledged, busy) {
    return !busy && (!isZeroIntervalRange(selection) || zeroIntervalAcknowledged === true);
  }

  function createPollingPlan(currentState, input) {
    const projection = deriveAutomaticPollingPlan(currentState, input);
    const errors = [];
    const usesManagementTargetList = input.disableInsecureManagementServices === true;
    if (usesManagementTargetList) {
      if (!Array.isArray(input.managementTargetDevices) || !input.managementTargetDevices.length) errors.push("Загрузите файл «Список устройств для закрытия портов 80 и 23 (http, telnet)»");
      if (!/^[0-9a-f]{64}$/i.test(String(input.managementTargetSourceSha256 || ""))) errors.push("Не удалось подтвердить список устройств для закрытия портов");
    } else if (!currentState.srImports.some((item) => item.status === "processed" || item.status === "partial")) errors.push("Сначала загрузите выгрузку SR");
    if (projection.mode === POLLING_SELECTION_MODE_SINGLE_IP) {
      const ipErrors = {
        empty: "Введите IP-адрес устройства",
        invalid: "Введите корректный IPv4-адрес устройства",
        not_found: usesManagementTargetList ? "Устройство с таким IP отсутствует в списке устройств для закрытия портов" : "Устройство с таким IP отсутствует в актуальной выгрузке SR",
        ambiguous: usesManagementTargetList ? "В списке устройств для закрытия портов найдено несколько устройств с таким IP" : "В актуальной выгрузке SR найдено несколько устройств с таким IP"
      };
      if (projection.ipResolution.status !== "found") errors.push(ipErrors[projection.ipResolution.status] || "Устройство по IP не выбрано");
    } else {
      if (!projection.selection.domains.length) errors.push("Выберите Домен");
      if (!projection.selection.categories.length) errors.push("Выберите Класс оборудования");
      if (!projection.selection.manufacturers.length) errors.push("Выберите Производителя");
      if (!projection.selection.models.length) errors.push("Выберите Модель");
      if (!projection.selectedDevices.length) errors.push("По выбранным фильтрам устройства не найдены");
    }
    const scheduledAt = normalizeDate(input.scheduledAt);
    if (!scheduledAt) errors.push("Дата и время начала опроса обязательны");
    const legacyInterval = input.intervalMinSeconds === undefined && input.intervalMaxSeconds === undefined;
    const minInput = legacyInterval ? input.intervalSeconds : input.intervalMinSeconds;
    const maxInput = legacyInterval ? input.intervalSeconds : input.intervalMaxSeconds;
    const intervalMinSeconds = Number(minInput);
    const intervalMaxSeconds = Number(maxInput);
    if (minInput === undefined || maxInput === undefined || String(minInput).trim() === "" || String(maxInput).trim() === "" ||
        !Number.isSafeInteger(intervalMinSeconds) || !Number.isSafeInteger(intervalMaxSeconds) ||
        intervalMinSeconds < 0 || intervalMaxSeconds < intervalMinSeconds) {
      errors.push("Укажите целые границы интервала в секундах: от 0 и не больше значения «До»");
    } else if (intervalMinSeconds === intervalMaxSeconds && intervalMinSeconds !== 0 && projection.supportedDevices.length > 2) {
      errors.push("Для трёх и более опрашиваемых устройств задайте разные значения «От» и «До»: соседние интервалы не должны совпадать");
    }
    if (!input.credentialsReady) errors.push("Введите учётные данные оборудования в модуле «Загрузка данных и опрос устройств»");
    if (input.credentialsReady && !/^[0-9a-f]{64}$/i.test(String(input.credentialSourceSha256 || ""))) errors.push("Не удалось подтвердить введённые учётные данные");
    if (!projection.supportedDevices.length) errors.push("Среди выбранных устройств нет оборудования с поддерживаемым автоматическим опросом");
    if (input.collectLogs !== undefined && typeof input.collectLogs !== "boolean") errors.push("Некорректный выбор сбора логов");
    if (input.collectJson !== undefined && typeof input.collectJson !== "boolean") errors.push("Некорректный выбор JSON-опросов");
    if (input.collectJson === false && input.collectLogs !== true) errors.push("Выберите JSON-опросы, сбор логов или оба варианта");
    const managementTasks = input.disableInsecureManagementServices === true ? [MANAGEMENT_TASK_DISABLE_INSECURE_SERVICES] : [];
    if (input.te20AnswerMode === "automatic" || input.setTe20AutoAnswerAutomatic === true) managementTasks.push(MANAGEMENT_TASK_TE20_AUTO_ANSWER);
    if (input.te20AnswerMode === "manual") managementTasks.push(MANAGEMENT_TASK_TE20_MANUAL_ANSWER);
    if (input.teFamilyAnswerMode && !TE_FAMILY_ANSWER_TASK_BY_MODE[input.teFamilyAnswerMode]) errors.push("Недопустимое значение Answer mode Huawei TE30/40/50/60");
    if (TE_FAMILY_ANSWER_TASK_BY_MODE[input.teFamilyAnswerMode]) managementTasks.push(TE_FAMILY_ANSWER_TASK_BY_MODE[input.teFamilyAnswerMode]);
    if (input.huawei310AnswerMode && !HUAWEI_310_ANSWER_TASK_BY_MODE[input.huawei310AnswerMode]) errors.push("Недопустимое значение Answer mode Huawei 310");
    if (HUAWEI_310_ANSWER_TASK_BY_MODE[input.huawei310AnswerMode]) managementTasks.push(HUAWEI_310_ANSWER_TASK_BY_MODE[input.huawei310AnswerMode]);
    if (input.huawei300AnswerMode && !HUAWEI_300_ANSWER_TASK_BY_MODE[input.huawei300AnswerMode]) errors.push("Недопустимое значение Answer mode Huawei 300");
    if (HUAWEI_300_ANSWER_TASK_BY_MODE[input.huawei300AnswerMode]) managementTasks.push(HUAWEI_300_ANSWER_TASK_BY_MODE[input.huawei300AnswerMode]);
    for (const [label, value] of [["Point-to-Point", input.polycomPointToPointAnswerMode], ["Multipoint", input.polycomMultipointAnswerMode]]) {
      if (value && !["automatic", "manual"].includes(value)) errors.push(`Недопустимое значение Answer mode Polycom ${label}`);
    }
    const polycomAnswerChanges = {
      pointToPoint: ["automatic", "manual"].includes(input.polycomPointToPointAnswerMode) ? input.polycomPointToPointAnswerMode : null,
      multipoint: ["automatic", "manual"].includes(input.polycomMultipointAnswerMode) ? input.polycomMultipointAnswerMode : null
    };
    if (polycomAnswerChanges.pointToPoint || polycomAnswerChanges.multipoint) managementTasks.push(MANAGEMENT_TASK_POLYCOM_ANSWER);
    if (input.te20AutoUpdateMode && input.te20AutoUpdateMode !== "disable") errors.push("Недопустимое значение настройки автообновления");
    if (input.te20AutoUpdateMode === "disable") managementTasks.push(MANAGEMENT_TASK_TE20_DISABLE_AUTO_UPDATE);
    if (input.te20SshMode && !TE20_SSH_TASK_BY_MODE[input.te20SshMode]) errors.push("Недопустимое значение настройки SSH");
    if (TE20_SSH_TASK_BY_MODE[input.te20SshMode]) managementTasks.push(TE20_SSH_TASK_BY_MODE[input.te20SshMode]);
    const ntpEnabled = input.te20NtpEnabled === "enable" ? true : input.te20NtpEnabled === "disable" ? false : null;
    const ntpMode = ["automatic", "manual"].includes(input.te20NtpMode) ? input.te20NtpMode : null;
    const ntpServer = input.te20NtpServerMode === "set" ? String(input.te20NtpServerValue || "").trim() : null;
    if (input.te20NtpEnabled && !["enable", "disable"].includes(input.te20NtpEnabled)) errors.push("Недопустимое значение синхронизации NTP");
    if (input.te20NtpMode && !["automatic", "manual"].includes(input.te20NtpMode)) errors.push("Недопустимый режим адреса NTP");
    if (input.te20NtpServerMode && input.te20NtpServerMode !== "set") errors.push("Недопустимый выбор сервера NTP");
    if (input.te20NtpServerMode === "set" && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,40}$/.test(ntpServer)) errors.push("Укажите имя или адрес сервера NTP длиной до 41 символа без пробелов");
    if (ntpEnabled === false && (ntpMode !== null || ntpServer !== null)) errors.push("При отключении NTP режим и сервер должны оставаться без изменений");
    if (ntpMode === "automatic" && ntpServer !== null) errors.push("Для режима «Авто» имя сервера должно оставаться без изменений");
    const ntpChanges = { enabled: ntpEnabled, mode: ntpMode, server: ntpServer };
    if (ntpEnabled !== null || ntpMode !== null || ntpServer !== null) managementTasks.push(MANAGEMENT_TASK_TE20_NTP);
    const binaryPower = (value) => value === "enable" ? true : value === "disable" ? false : null;
    const shutdownRestart = binaryPower(input.te20ShutdownRestart);
    const scheduledRestart = binaryPower(input.te20ScheduledRestart);
    const sleepMinutes = input.te20SleepMinutes === undefined || input.te20SleepMinutes === "" ? null : Number(input.te20SleepMinutes);
    const restartTime = String(input.te20RestartTime || "").trim();
    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(restartTime);
    for (const [label, value] of [["Shut Down/Restart", input.te20ShutdownRestart], ["Плановый перезапуск", input.te20ScheduledRestart]]) {
      if (value && !["enable", "disable"].includes(value)) errors.push(`Недопустимое значение «${label}»`);
    }
    if (sleepMinutes !== null && !TE20_SLEEP_VALUES.includes(sleepMinutes)) errors.push("Выберите подтверждённый интервал сна TE20");
    if (restartTime && !timeMatch) errors.push("Укажите время планового перезапуска в формате ЧЧ:ММ (00:00–23:59)");
    if (scheduledRestart === true && !timeMatch) errors.push("При включении планового перезапуска укажите время");
    if (scheduledRestart === false && restartTime) errors.push("При отключении расписания время должно оставаться без изменений");
    const powerChanges = { shutdownRestart, sleepMinutes, scheduledRestart, restartHour: timeMatch ? Number(timeMatch[1]) : null, restartMinute: timeMatch ? Number(timeMatch[2]) : null };
    if (shutdownRestart !== null || sleepMinutes !== null || scheduledRestart !== null || restartTime) managementTasks.push(MANAGEMENT_TASK_TE20_POWER);
    for (const [port, value] of [["http", input.te20HttpMode], ["telnet", input.te20TelnetMode]]) {
      if (value && !["open", "close"].includes(value)) errors.push(`Недопустимое значение настройки ${port.toUpperCase()}`);
      if (TE20_PORT_TASK_BY_MODE[port][value]) managementTasks.push(TE20_PORT_TASK_BY_MODE[port][value]);
    }
    const answerTask = managementTasks.find((task) => [MANAGEMENT_TASK_TE20_AUTO_ANSWER, MANAGEMENT_TASK_TE20_MANUAL_ANSWER, ...Object.values(TE_FAMILY_ANSWER_TASK_BY_MODE), ...Object.values(HUAWEI_310_ANSWER_TASK_BY_MODE), ...Object.values(HUAWEI_300_ANSWER_TASK_BY_MODE), MANAGEMENT_TASK_POLYCOM_ANSWER].includes(task));
    const portTasks = managementTasks.filter((task) => Object.values(TE20_PORT_TASK_BY_MODE).some((group) => Object.values(group).includes(task)));
    if (answerTask && managementTasks.length > 1) errors.push("Запускайте изменение Answer mode отдельно от других задач управления");
    if (managementTasks.includes(MANAGEMENT_TASK_TE20_DISABLE_AUTO_UPDATE) && managementTasks.length > 1) errors.push("Отключение автообновления запускайте отдельно от других задач управления");
    const sshTask = managementTasks.find((task) => Object.values(TE20_SSH_TASK_BY_MODE).includes(task));
    if (sshTask && managementTasks.length > 1) errors.push("Изменение SSH запускайте отдельно от других задач управления");
    if (managementTasks.includes(MANAGEMENT_TASK_TE20_NTP) && managementTasks.length > 1) errors.push("Изменение NTP запускайте отдельно от других задач управления");
    if (managementTasks.includes(MANAGEMENT_TASK_TE20_POWER) && managementTasks.length > 1) errors.push("Управление питанием запускайте отдельно от других задач управления");
    if (portTasks.length && managementTasks.length !== portTasks.length) errors.push("Отдельные настройки портов нельзя совмещать с другими задачами управления");
    if (answerTask && (![POLLING_SELECTION_MODE_SINGLE_IP, POLLING_SELECTION_MODE_FILTERS].includes(projection.mode)
      || !projection.selectedDevices.length
      || (projection.mode === POLLING_SELECTION_MODE_SINGLE_IP && projection.selectedDevices.length !== 1)
      || projection.selectedDevices.some((device) => !supportsManagementTask(device, answerTask))
      || !/^[0-9a-f]{64}$/i.test(String(currentState.srImports.at(-1)?.rawSha256 || "")))) errors.push("Для изменения Answer mode выберите один IP или фильтрами только точные устройства одной поддерживаемой группы из актуальной SR");
    if (managementTasks.includes(MANAGEMENT_TASK_TE20_DISABLE_AUTO_UPDATE) && (projection.mode !== POLLING_SELECTION_MODE_SINGLE_IP || projection.selectedDevices.length !== 1 || !supportsManagementTask(projection.selectedDevices[0], MANAGEMENT_TASK_TE20_DISABLE_AUTO_UPDATE) || !/^[0-9a-f]{64}$/i.test(String(currentState.srImports.at(-1)?.rawSha256 || "")))) errors.push("Отключение автообновления доступно только для одного точного Huawei TE20, выбранного по IP из загруженной SR");
    if (sshTask && (projection.mode !== POLLING_SELECTION_MODE_SINGLE_IP || projection.selectedDevices.length !== 1 || !supportsManagementTask(projection.selectedDevices[0], sshTask) || !/^[0-9a-f]{64}$/i.test(String(currentState.srImports.at(-1)?.rawSha256 || "")))) errors.push("Изменение SSH доступно только для одного точного Huawei TE20, выбранного по IP из загруженной SR");
    if (managementTasks.includes(MANAGEMENT_TASK_TE20_NTP) && (projection.mode !== POLLING_SELECTION_MODE_SINGLE_IP || projection.selectedDevices.length !== 1 || !supportsManagementTask(projection.selectedDevices[0], MANAGEMENT_TASK_TE20_NTP) || !/^[0-9a-f]{64}$/i.test(String(currentState.srImports.at(-1)?.rawSha256 || "")))) errors.push("Изменение NTP доступно только для одного точного Huawei TE20, выбранного по IP из загруженной SR");
    if (managementTasks.includes(MANAGEMENT_TASK_TE20_POWER) && (projection.mode !== POLLING_SELECTION_MODE_SINGLE_IP || projection.selectedDevices.length !== 1 || !supportsManagementTask(projection.selectedDevices[0], MANAGEMENT_TASK_TE20_POWER) || !/^[0-9a-f]{64}$/i.test(String(currentState.srImports.at(-1)?.rawSha256 || "")))) errors.push("Управление питанием доступно только для одного точного Huawei TE20, выбранного по IP из загруженной SR");
    if (portTasks.length && (projection.mode !== POLLING_SELECTION_MODE_SINGLE_IP || projection.selectedDevices.length !== 1 || portTasks.some((task) => !supportsManagementTask(projection.selectedDevices[0], task)) || !/^[0-9a-f]{64}$/i.test(String(currentState.srImports.at(-1)?.rawSha256 || "")))) errors.push("Изменение HTTP/Telnet доступно только для одного точного Huawei TE20, выбранного по IP из загруженной SR");
    if (managementTasks.includes(MANAGEMENT_TASK_DISABLE_INSECURE_SERVICES) && !projection.managementEligibleDevices.length) errors.push("Среди выбранных устройств нет точной модели Huawei с поддержкой выбранной задачи управления HTTP/Telnet");
    if (errors.length) return { ok: false, state: deepClone(currentState), projection, errors };
    let next = deepClone(currentState);
    const plan = {
      id: createId("polling-run"), kind: "plan", identityKey: `plan|${scheduledAt}|${nowIso()}`,
      folderName: null, capturedAt: scheduledAt, capturedAtSource: "planned", importedAt: nowIso(), importedById: input.actorId || "system",
      intervalMinSeconds, intervalMaxSeconds, ...(legacyInterval ? { intervalSeconds: intervalMinSeconds } : {}),
      authenticationInputSha256: String(input.credentialSourceSha256).toLowerCase(), selection: deepClone(projection.selection),
      targetSource: projection.targetSource,
      targetSourceSha256: usesManagementTargetList ? String(input.managementTargetSourceSha256).toLowerCase() : (currentState.srImports.at(-1)?.rawSha256 || null),
      deviceIds: usesManagementTargetList ? [] : projection.selectedDevices.map((device) => device.id),
      targetDevices: usesManagementTargetList ? projection.selectedDevices.map(pollingRuntimeDevice) : [],
      managementTasks,
      collectLogs: input.collectLogs === true,
      collectJson: input.collectJson !== false,
      ...(managementTasks.includes(MANAGEMENT_TASK_TE20_NTP) ? { ntpChanges } : {}),
      ...(managementTasks.includes(MANAGEMENT_TASK_TE20_POWER) ? { powerChanges } : {}),
      ...(managementTasks.includes(MANAGEMENT_TASK_POLYCOM_ANSWER) ? { polycomAnswerChanges } : {}),
      fileCount: 0, successCount: 0, errorCount: 0, status: "ready_for_local_cli",
      selectionSummary: { total: projection.selectedDevices.length, implemented: projection.supportedDevices.length, notImplemented: projection.unsupportedDevices.length, managementEligible: projection.managementEligibleDevices.length, managementSkipped: projection.managementSkippedDevices.length }
    };
    next.pollingRuns.push(plan);
    next = appendHistory(next, { actorId: input.actorId || "system", action: "Сформирован план автоматического опроса", entityType: "polling_run", entityId: plan.id, details: `${plan.selectionSummary.total} устройств; поддерживается ${plan.selectionSummary.implemented}` });
    return { ok: true, state: next, plan, projection, errors: [] };
  }

  function buildPollingPlanExport(currentState, planId) {
    const plan = currentState.pollingRuns.find((item) => item.id === planId && item.kind === "plan");
    if (!plan) return { ok: false, errors: ["План опроса не найден"] };
    const devices = plan.targetSource === "port_closure_list"
      ? deepClone(plan.targetDevices || [])
      : (plan.deviceIds || []).map((deviceId) => currentState.inventoryDevices.find((item) => item.id === deviceId)).filter(Boolean).map(pollingRuntimeDevice);
    return {
      ok: true,
      payload: { schemaVersion: 3, scheduledAt: plan.capturedAt, intervalMinSeconds: plan.intervalMinSeconds, intervalMaxSeconds: plan.intervalMaxSeconds, ...(Number.isInteger(plan.intervalSeconds) ? { intervalSeconds: plan.intervalSeconds } : {}), authenticationInputSha256: plan.authenticationInputSha256, targetSource: plan.targetSource || "sr", targetSourceSha256: plan.targetSourceSha256 || null, selection: deepClone(plan.selection || {}), selectionSummary: deepClone(plan.selectionSummary || {}), managementTasks: deepClone(plan.managementTasks || []), collectLogs: plan.collectLogs === true, collectJson: plan.collectJson !== false, ...(plan.ntpChanges ? { ntpChanges: deepClone(plan.ntpChanges) } : {}), ...(plan.powerChanges ? { powerChanges: deepClone(plan.powerChanges) } : {}), ...(plan.polycomAnswerChanges ? { polycomAnswerChanges: deepClone(plan.polycomAnswerChanges) } : {}), devices },
      filename: `extron-polling-plan-${String(plan.capturedAt || "").slice(0, 10) || "local"}.json`,
      errors: []
    };
  }

  function pollingRuntimeDevice(device) {
    const capability = resolvePollingCapability(device);
    const pollingSupported = Boolean(device.ipNormalized && capability.support === "implemented" && capability.transport);
    return {
      ip: device.ipNormalized || null,
      category: device.category,
      manufacturer: device.manufacturerRaw || device.manufacturerNormalized,
      model: device.modelRaw || device.modelNormalized || "",
      pollingSupported,
      adapterKey: capability.key || null,
      allowInsecureTls: false
    };
  }

  function timeValue(value) {
    const parsed = new Date(value || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function compareTimedEntities(left, right, field) {
    return timeValue(left?.[field]) - timeValue(right?.[field]) || String(left?.id || "").localeCompare(String(right?.id || ""));
  }

  function dashboardCapability(device) {
    const stored = device?.pollingCapability;
    const capability = stored && typeof stored.support === "string" ? stored : resolvePollingCapability(device);
    if (capability.support === "implemented" && capability.transport) return "supported";
    if (!device?.category || !normalizeManufacturer(device.manufacturerNormalized || device.manufacturerRaw)) return "unknown";
    return "unsupported";
  }

  function dashboardPeriodScope(candidateState, filters, latestRun, nowValue) {
    const period = filters.period || "latest_run";
    const now = new Date(nowValue || nowIso());
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) return { valid: false, errors: ["Некорректное текущее время"] };
    let from = null;
    let to = nowMs;
    let label = "Последний запуск";
    if (period === "latest_run") {
      if (latestRun) from = to = timeValue(latestRun.capturedAt);
    } else if (period === "today") {
      const start = new Date(now); start.setHours(0, 0, 0, 0); from = start.getTime(); label = "Сегодня";
    } else if (period === "7d" || period === "30d") {
      const days = period === "7d" ? 7 : 30; from = nowMs - days * 86400000; label = `${days} дней`;
    } else if (period === "custom") {
      const fromDate = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : null;
      const toDate = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : null;
      if (!fromDate || !toDate || !Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) || fromDate > toDate) {
        return { valid: false, errors: ["Произвольный диапазон должен содержать корректные даты от и до"] };
      }
      from = fromDate.getTime(); to = toDate.getTime(); label = `${filters.dateFrom} — ${filters.dateTo}`;
    } else if (period === "all") {
      to = null; label = "Вся история";
    } else {
      return { valid: false, errors: ["Период Dashboard не поддерживается"] };
    }
    return { valid: true, errors: [], kind: period, from, to, label, includes(value) { const time = timeValue(value); return Boolean(time) && (from === null || time >= from) && (to === null || time <= to); } };
  }

  function dashboardStatus(device, latestResult) {
    const capability = dashboardCapability(device);
    if (capability === "unsupported") return "UNSUPPORTED";
    if (capability === "unknown") return "UNKNOWN";
    if (!latestResult) return "NOT_POLLED";
    if (latestResult.pollStatus === "success") return "SUCCESS";
    if (["authorization_error", "network_unreachable", "processing_error", "error"].includes(latestResult.operationalStatus || latestResult.pollStatus)) return "FAILED";
    return "UNKNOWN";
  }

  function safeDashboardValue(value, path) {
    if (/(password|passwd|token|secret|credential|authorization|api.?key)/i.test(String(path || ""))) return "[скрыто]";
    const text = typeof value === "string" ? value : value === undefined ? "—" : JSON.stringify(value);
    return String(text ?? "—").slice(0, 160);
  }

  function incrementDistribution(map, key) {
    const label = normalizeDisplay(key) || "Не указано";
    map.set(label, (map.get(label) || 0) + 1);
  }

  function distributionRows(map, limit) {
    return [...map].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ru")).slice(0, limit);
  }

  const REBOOT_RULE_VERSION = "extron-reboot-v2";
  const REBOOT_BOOT_CLUSTER_TOLERANCE_MS = 5000;

  function rebootDeviceStatusBlock(normalizedData) {
    const webBlocks = getCaseInsensitive(normalizedData, "webBlocks");
    return getCaseInsensitive(webBlocks, "Device Status") || null;
  }

  function parseFormattedUptime(value) {
    const match = String(value ?? "").match(/^(?:(\d+)d )?(\d+)h (\d+)m (\d+)s$/);
    if (!match) return null;
    const days = Number(match[1] || 0);
    const hours = Number(match[2]);
    const minutes = Number(match[3]);
    const seconds = Number(match[4]);
    if (![days, hours, minutes, seconds].every(Number.isSafeInteger) || hours > 23 || minutes > 59 || seconds > 59) return null;
    const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
    return Number.isSafeInteger(total) ? total : null;
  }

  function parseExtronDeviceDate(value) {
    if (typeof value !== "string") return null;
    const match = value.trim().match(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return null;
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const day = Number(match[2]);
    const month = months.indexOf(match[3]);
    const year = Number(match[4]);
    const hour = Number(match[5]);
    const minute = Number(match[6]);
    const second = Number(match[7]);
    if (month < 0 || hour > 23 || minute > 59 || second > 59) return null;
    const time = Date.UTC(year, month, day, hour, minute, second);
    const date = new Date(time);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day || weekdays[date.getUTCDay()] !== match[1]) return null;
    return { iso: date.toISOString(), time, source: "device_status_date", timeBasis: "device_local_unknown_timezone" };
  }

  function extractRebootObservation(result) {
    if (!result || result.parseStatus !== "parsed") return { eligible: false, reason: "unparsed" };
    if (!result.deviceId || ["ambiguous", "category_conflict", "ip_conflict", "historical_only"].includes(result.matchStatus)) return { eligible: false, reason: "unmatched" };
    const status = rebootDeviceStatusBlock(result.normalizedData);
    if (!status) return { eligible: false, reason: "missing_uptime" };
    const numericRaw = getCaseInsensitive(status, "Uptime Seconds");
    const numeric = typeof numericRaw === "number" && Number.isSafeInteger(numericRaw) && numericRaw >= 0 ? numericRaw : null;
    const formattedRaw = getCaseInsensitive(status, "Uptime");
    const formatted = formattedRaw === undefined || formattedRaw === null || formattedRaw === "" ? null : parseFormattedUptime(formattedRaw);
    if (numericRaw !== undefined && numericRaw !== null && numeric === null) return { eligible: false, reason: "invalid_uptime" };
    if (formattedRaw !== undefined && formattedRaw !== null && formattedRaw !== "" && formatted === null) return { eligible: false, reason: "invalid_uptime" };
    if (numeric !== null && formatted !== null && numeric !== formatted) return { eligible: false, reason: "conflicting_uptime" };
    const uptimeSeconds = numeric ?? formatted;
    if (uptimeSeconds === null) return { eligible: false, reason: "missing_uptime" };
    const source = numeric !== null ? "uptime_seconds" : "uptime_formatted";
    const deviceDateRaw = getCaseInsensitive(status, "Date");
    const deviceDate = parseExtronDeviceDate(deviceDateRaw);
    if (deviceDateRaw !== undefined && deviceDateRaw !== null && deviceDateRaw !== "" && !deviceDate) return { eligible: false, reason: "invalid_device_date" };
    const observedAt = deviceDate?.iso || normalizeDate(result.observationAt || result.capturedAt);
    if (!observedAt) return { eligible: false, reason: "missing_time" };
    const observationSource = deviceDate?.source || result.observationAtSource || result.capturedAtSource || "unknown";
    const confidence = deviceDate ? "confirmed" : result.observationConfidence || (["payload_uptime_observed_at", "payload_captured_at"].includes(observationSource) ? "confirmed" : "limited");
    const timeBasis = deviceDate?.timeBasis || "absolute_time";
    const observedAtMs = deviceDate?.time ?? new Date(observedAt).getTime();
    const timeUncertaintyMs = deviceDate ? 1000 : Math.max(0, Number(result.observationUncertaintyMs) || 1000);
    const uptimeUncertaintySeconds = 1;
    const bootAtMs = observedAtMs - uptimeSeconds * 1000;
    return {
      eligible: true,
      observation: {
        resultId: result.id,
        deviceId: result.deviceId,
        observedAt,
        observedAtMs,
        observedAtSource: observationSource,
        timeBasis,
        timeUncertaintyMs,
        uptimeSeconds,
        uptimeSource: source,
        uptimeUncertaintySeconds,
        bootAtMs,
        bootFromMs: observedAtMs - timeUncertaintyMs - (uptimeSeconds + uptimeUncertaintySeconds) * 1000,
        bootToMs: observedAtMs + timeUncertaintyMs - uptimeSeconds * 1000,
        confidence,
        rawSha256: result.rawSha256 || null,
        evidencePaths: [
          ...(deviceDate ? ["$.webBlocks.Device Status.Date"] : []),
          source === "uptime_seconds" ? "$.webBlocks.Device Status.Uptime Seconds" : "$.webBlocks.Device Status.Uptime"
        ]
      }
    };
  }

  function rebootEventFromObservations(observations, device, location) {
    const ordered = [...observations].sort((left, right) => left.observedAtMs - right.observedAtMs || String(left.resultId).localeCompare(String(right.resultId)));
    const representative = ordered[ordered.length - 1];
    const estimatedAtMs = Math.round(ordered.reduce((sum, item) => sum + item.bootAtMs, 0) / ordered.length);
    return {
      id: `${device.id}@${Math.round(estimatedAtMs / 1000)}`,
      deviceId: device.id,
      deviceName: device.nameRaw || device.modelRaw || "Устройство без названия",
      category: device.category || "other",
      manufacturer: device.manufacturerRaw || device.manufacturerNormalized || "Не указано",
      model: device.modelRaw || "Не указано",
      domain: device.domain || "",
      ip: device.ipNormalized || device.ip || "Не указано",
      mac: device.macNormalized || device.macRaw || "Не указано",
      vip: Boolean(device.deviceVip || location?.vip),
      locationId: location?.id || device.locationId || null,
      locationName: location?.name || "Не указано",
      address: location?.address || "Не указано",
      previousResultId: null,
      currentResultId: representative.resultId,
      evidenceResultIds: ordered.map((item) => item.resultId),
      previousObservedAt: null,
      currentObservedAt: representative.observedAt,
      occurredFrom: new Date(ordered.reduce((minimum, item) => Math.min(minimum, item.bootFromMs), Infinity)).toISOString(),
      occurredTo: new Date(ordered.reduce((maximum, item) => Math.max(maximum, item.bootToMs), -Infinity)).toISOString(),
      estimatedAt: new Date(estimatedAtMs).toISOString(),
      observedAtSource: representative.observedAtSource,
      timeBasis: representative.timeBasis,
      minimumCount: 1,
      uptimeBeforeSeconds: null,
      uptimeAfterSeconds: representative.uptimeSeconds,
      ruleVersion: REBOOT_RULE_VERSION,
      confidence: ordered.every((item) => item.confidence === "confirmed") ? "confirmed" : "limited",
      observationSources: [...new Set(ordered.map((item) => item.observedAtSource))],
      evidencePaths: [...new Set(ordered.flatMap((item) => item.evidencePaths))]
    };
  }

  function deriveMinimumReboot(previous, current, device, location) {
    if (!previous || !current || current.observedAtMs <= previous.observedAtMs) return { status: "unknown", reason: "ambiguous_time" };
    if (Math.abs(current.bootAtMs - previous.bootAtMs) <= REBOOT_BOOT_CLUSTER_TOLERANCE_MS) return { status: "not_confirmed" };
    return { status: "confirmed", event: rebootEventFromObservations([current], device, location) };
  }

  function rebootFilterOptions(events) {
    const values = (field) => [...new Set(events.map((item) => normalizeDisplay(item[field])).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    return { categories: values("category"), manufacturers: values("manufacturer"), models: values("model"), locations: values("locationName"), addresses: values("address") };
  }

  function buildRebootAnalysisIndex(candidateState) {
    const devices = new Map((candidateState?.inventoryDevices || []).filter((item) => item.inCurrentSr !== false).map((item) => [item.id, item]));
    const locations = new Map((candidateState?.locations || []).map((item) => [item.id, item]));
    const histories = new Map();
    const excludedByReason = {};
    let eligibleObservations = 0;
    const exclude = (reason, count = 1) => { excludedByReason[reason] = (excludedByReason[reason] || 0) + count; };
    for (const result of candidateState?.pollingResults || []) {
      if (!devices.has(result.deviceId)) { exclude(result.deviceId ? "historical_device" : "unmatched"); continue; }
      const extracted = extractRebootObservation(result);
      if (!extracted.eligible) { exclude(extracted.reason); continue; }
      eligibleObservations += 1;
      const list = histories.get(result.deviceId) || [];
      list.push(extracted.observation);
      histories.set(result.deviceId, list);
    }
    const events = [];
    let unknownPairs = 0;
    let devicesWithComparablePairs = 0;
    for (const [deviceId, rawHistory] of histories) {
      rawHistory.sort((left, right) => left.observedAtMs - right.observedAtMs || String(left.resultId).localeCompare(String(right.resultId)));
      const history = [];
      for (let index = 0; index < rawHistory.length;) {
        const timestamp = rawHistory[index].observedAtMs;
        const group = [];
        while (index < rawHistory.length && rawHistory[index].observedAtMs === timestamp) group.push(rawHistory[index++]);
        const signatures = new Set(group.map((item) => `${item.uptimeSeconds}|${item.rawSha256 || ""}`));
        if (signatures.size > 1) { unknownPairs += 1; exclude("ambiguous_timestamp", group.length); continue; }
        history.push(group[0]);
      }
      if (history.length) devicesWithComparablePairs += 1;
      const device = devices.get(deviceId);
      const location = locations.get(device.locationId);
      const byBootTime = [...history].sort((left, right) => left.bootAtMs - right.bootAtMs || left.observedAtMs - right.observedAtMs || String(left.resultId).localeCompare(String(right.resultId)));
      const clusters = [];
      for (const observation of byBootTime) {
        const cluster = clusters[clusters.length - 1];
        if (cluster && Math.abs(observation.bootAtMs - cluster.referenceBootAtMs) <= REBOOT_BOOT_CLUSTER_TOLERANCE_MS) {
          cluster.observations.push(observation);
          cluster.bootSum += observation.bootAtMs;
          cluster.referenceBootAtMs = Math.round(cluster.bootSum / cluster.observations.length);
        } else {
          clusters.push({ referenceBootAtMs: observation.bootAtMs, bootSum: observation.bootAtMs, observations: [observation] });
        }
      }
      clusters.forEach((cluster) => events.push(rebootEventFromObservations(cluster.observations, device, location)));
    }
    events.sort((left, right) => timeValue(right.estimatedAt) - timeValue(left.estimatedAt) || left.id.localeCompare(right.id));
    const coverage = {
      currentDevices: devices.size,
      pollingResults: (candidateState?.pollingResults || []).length,
      eligibleObservations,
      devicesWithObservations: histories.size,
      devicesWithComparablePairs,
      excludedResults: Object.values(excludedByReason).reduce((sum, count) => sum + count, 0),
      unknownPairs,
      excludedByReason
    };
    return { events, coverage, filterOptions: rebootFilterOptions(events) };
  }

  function rebootLocalPart(value, type, timeZone) {
    const options = type === "date"
      ? { year: "numeric", month: "2-digit", day: "2-digit", timeZone }
      : { hour: "2-digit", hourCycle: "h23", timeZone };
    const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(new Date(value));
    const get = (part) => parts.find((item) => item.type === part)?.value || "";
    return type === "date" ? `${get("year")}-${get("month")}-${get("day")}` : get("hour").padStart(2, "0");
  }

  function rebootPeriodScope(filters, nowValue) {
    const period = filters.period || "all";
    const now = new Date(nowValue || nowIso());
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) return { valid: false, errors: ["Некорректное текущее время"] };
    const wallNowMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    let from = null; let to = null; let wallFrom = null; let wallTo = null;
    if (period === "today") {
      const start = new Date(now); start.setHours(0, 0, 0, 0); from = start.getTime(); to = nowMs;
      wallFrom = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()); wallTo = wallNowMs;
    }
    else if (period === "7d" || period === "30d") {
      const duration = Number.parseInt(period, 10) * 86400000;
      from = nowMs - duration; to = nowMs; wallFrom = wallNowMs - duration; wallTo = wallNowMs;
    }
    else if (period === "custom") {
      const fromDate = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`) : null;
      const toDate = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`) : null;
      if (!fromDate || !toDate || !Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) || fromDate > toDate) return { valid: false, errors: ["Укажите корректные даты начала и окончания"] };
      from = fromDate.getTime(); to = toDate.getTime();
      wallFrom = Date.parse(`${filters.dateFrom}T00:00:00.000Z`); wallTo = Date.parse(`${filters.dateTo}T23:59:59.999Z`);
    } else if (period !== "all") return { valid: false, errors: ["Период перезагрузок не поддерживается"] };
    return { valid: true, errors: [], includes(value, timeBasis) { const time = timeValue(value); const useWall = timeBasis === "device_local_unknown_timezone"; const lower = useWall ? wallFrom : from; const upper = useWall ? wallTo : to; return Boolean(time) && (lower === null || time >= lower) && (upper === null || time <= upper); } };
  }

  function aggregateRebootDimension(events, field) {
    const map = new Map();
    events.forEach((event) => incrementDistribution(map, event[field]));
    return distributionRows(map, Number.MAX_SAFE_INTEGER);
  }

  function rebootLeaders(rows) {
    const maximum = rows[0]?.count || 0;
    return { count: maximum, labels: maximum ? rows.filter((item) => item.count === maximum).map((item) => item.label) : [] };
  }

  function buildRebootDetailRows(events, eventDates, eventHours) {
    const devices = new Map(), locations = new Map(), addresses = new Map();
    const dates = new Map(), hours = new Map();
    events.forEach((event, index) => {
      const dateKey = eventDates[index];
      const hourKey = eventHours[index];
      const device = devices.get(event.deviceId) || {
        deviceId: event.deviceId, deviceName: event.deviceName, ip: event.ip, mac: event.mac,
        vip: event.vip, locationName: event.locationName, address: event.address, count: 0, rebootDates: new Map()
      };
      device.count += 1;
      device.rebootDates.set(dateKey, (device.rebootDates.get(dateKey) || 0) + 1);
      devices.set(event.deviceId, device);

      if (event.locationId) {
        const location = locations.get(event.locationId) || {
          locationId: event.locationId, locationName: event.locationName, address: event.address,
          count: 0, deviceIds: new Set(), deviceNames: new Map()
        };
        location.count += 1;
        location.deviceIds.add(event.deviceId);
        location.deviceNames.set(event.deviceId, `${event.deviceName} (${event.ip})`);
        locations.set(event.locationId, location);
      }

      const address = addresses.get(event.address) || { address: event.address, count: 0, deviceIds: new Set(), deviceNames: new Map(), locationNames: new Set() };
      address.count += 1;
      address.deviceIds.add(event.deviceId);
      address.deviceNames.set(event.deviceId, `${event.deviceName} (${event.ip})`);
      address.locationNames.add(event.locationName);
      addresses.set(event.address, address);

      const date = dates.get(dateKey) || { date: dateKey, count: 0, addresses: new Map() };
      date.count += 1;
      date.addresses.set(event.address, (date.addresses.get(event.address) || 0) + 1);
      dates.set(dateKey, date);
      const hour = hours.get(hourKey) || { hour: hourKey, count: 0, locations: new Map() };
      hour.count += 1;
      const locationKey = event.locationId || `unknown:${event.locationName}|${event.address}`;
      const hourLocation = hour.locations.get(locationKey) || {
        locationId: event.locationId, locationName: event.locationName, address: event.address, count: 0, devices: new Map()
      };
      hourLocation.count += 1;
      const hourDevice = hourLocation.devices.get(event.deviceId) || { deviceId: event.deviceId, deviceName: event.deviceName, ip: event.ip, count: 0 };
      hourDevice.count += 1;
      hourLocation.devices.set(event.deviceId, hourDevice);
      hour.locations.set(locationKey, hourLocation);
      hours.set(hourKey, hour);
    });
    const byCount = (left, right) => right.count - left.count || String(left.deviceName || left.locationName || left.address || left.date || left.hour).localeCompare(String(right.deviceName || right.locationName || right.address || right.date || right.hour), "ru");
    const deviceRows = [...devices.values()].map((row) => ({ ...row, rebootDates: [...row.rebootDates].map(([date, count]) => ({ date, count })).sort((left, right) => right.date.localeCompare(left.date)) })).sort(byCount);
    const locationRows = [...locations.values()].map((row) => ({ ...row, uniqueDeviceCount: row.deviceIds.size, deviceNames: [...row.deviceNames.values()].sort((a, b) => a.localeCompare(b, "ru")) })).sort(byCount);
    const addressRows = [...addresses.values()].map((row) => ({ ...row, uniqueDeviceCount: row.deviceIds.size, deviceNames: [...row.deviceNames.values()].sort((a, b) => a.localeCompare(b, "ru")), locationNames: [...row.locationNames].sort((a, b) => a.localeCompare(b, "ru")) })).sort(byCount);
    const dateRows = [...dates.values()].map((row) => ({ ...row, addresses: [...row.addresses].map(([address, count]) => ({ address, count })).sort(byCount) })).sort(byCount);
    const hourRows = [...hours.values()].map((row) => ({
      ...row,
      locations: [...row.locations.values()].map((location) => ({ ...location, devices: [...location.devices.values()].sort(byCount) })).sort(byCount)
    })).sort(byCount);
    return {
      devices: deviceRows, locations: locationRows, addresses: addressRows, dates: dateRows, hours: hourRows,
      topDates: dateRows.slice(0, 5), topHours: hourRows.slice(0, 5), topDevices: deviceRows.slice(0, 5),
      topLocationsByDevices: [...locationRows].sort((left, right) => right.uniqueDeviceCount - left.uniqueDeviceCount || left.locationName.localeCompare(right.locationName, "ru")).slice(0, 5),
      topAddressesByDevices: [...addressRows].sort((left, right) => right.uniqueDeviceCount - left.uniqueDeviceCount || left.address.localeCompare(right.address, "ru")).slice(0, 5)
    };
  }

  function getRebootAnalytics(candidateState, inputFilters, options) {
    const filters = { period: "all", ...(inputFilters || {}) };
    const settings = options || {};
    const index = buildRebootAnalysisIndex(candidateState || {});
    const period = rebootPeriodScope(filters, settings.now);
    if (!period.valid) return { valid: false, errors: period.errors, events: [], coverage: index.coverage };
    const match = (event) => period.includes(event.estimatedAt, event.timeBasis)
      && (!filters.category || event.category === filters.category)
      && (!filters.manufacturer || normalizeText(event.manufacturer) === normalizeText(filters.manufacturer))
      && (!filters.model || normalizeText(event.model) === normalizeText(filters.model))
      && (!filters.domain || normalizeText(event.domain) === normalizeText(filters.domain))
      && (!filters.vip || (filters.vip === "yes") === Boolean(event.vip))
      && (!filters.locationId || event.locationId === filters.locationId)
      && (!filters.location || normalizeText(event.locationName) === normalizeText(filters.location))
      && (!filters.address || normalizeText(event.address) === normalizeText(filters.address));
    const events = index.events.filter(match);
    const timeZone = settings.timeZone;
    const dateMap = new Map(); const hourMap = new Map(); const eventDates = []; const eventHours = [];
    events.forEach((event) => {
      const eventTimeZone = event.timeBasis === "device_local_unknown_timezone" ? "UTC" : timeZone;
      const date = rebootLocalPart(event.estimatedAt, "date", eventTimeZone);
      const hour = rebootLocalPart(event.estimatedAt, "hour", eventTimeZone);
      eventDates.push(date); eventHours.push(hour);
      dateMap.set(date, (dateMap.get(date) || 0) + 1);
      hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
    });
    const byDate = [...dateMap].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label));
    const byHour = Array.from({ length: 24 }, (_, hour) => ({ label: String(hour).padStart(2, "0"), count: hourMap.get(String(hour).padStart(2, "0")) || 0 }));
    const byDevice = aggregateRebootDimension(events, "deviceName");
    const byLocation = aggregateRebootDimension(events, "locationName");
    const byAddress = aggregateRebootDimension(events, "address");
    const affectedDevices = new Set(events.map((event) => event.deviceId)).size;
    const affectedLocations = new Set(events.map((event) => event.locationId).filter(Boolean)).size;
    const details = buildRebootDetailRows(events, eventDates, eventHours);
    let emptyState = null;
    if (!index.coverage.currentDevices) emptyState = "no_sr";
    else if (!index.coverage.pollingResults) emptyState = "no_polling";
    else if (!index.coverage.eligibleObservations) emptyState = "insufficient";
    else if (!index.events.length) emptyState = "no_events";
    else if (!events.length) emptyState = "filtered_empty";
    return {
      valid: true, errors: [], events, coverage: index.coverage, filterOptions: index.filterOptions, emptyState,
      summary: { minimumReboots: events.length, affectedDevices, affectedLocations, comparableDevices: index.coverage.devicesWithComparablePairs, excludedResults: index.coverage.excludedResults },
      byDate, byHour, byDevice, byLocation, byAddress, details,
      leaders: { dates: rebootLeaders([...byDate].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))), hours: rebootLeaders([...byHour].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))), devices: rebootLeaders(byDevice), locations: rebootLeaders(byLocation), addresses: rebootLeaders(byAddress) }
    };
  }

  function getHuaweiTeLogAnalytics(index, candidateState, inputFilters, options) {
    const filters = { period: "all", ...(inputFilters || {}) };
    const period = rebootPeriodScope(filters, options?.now);
    if (!period.valid) return { valid: false, errors: period.errors, groups: {} };
    const silenceMinutes = Number(filters.logSilenceMinutes ?? 60);
    if (!Number.isSafeInteger(silenceMinutes) || silenceMinutes < 15 || silenceMinutes > 10080) return { valid: false, errors: ["Укажите порог тишины логов от 15 до 10080 минут"], groups: {} };
    const currentDigest = candidateState?.srImports?.at(-1)?.rawSha256 || null;
    const stale = Boolean(index?.sourceSrSha256 && currentDigest && index.sourceSrSha256 !== currentDigest);
    const currentDevices = new Map((candidateState?.inventoryDevices || []).filter((item) => item.inCurrentSr !== false).map((item) => [item.id, item]));
    const currentLocations = new Map((candidateState?.locations || []).map((item) => [item.id, item]));
    const scopedEvents = stale ? [] : (index?.events || []).filter((event) => {
      const device = currentDevices.get(event.deviceId);
      return device && normalizeIpv4(device.ipNormalized || device.ipRaw) === event.ip
        && period.includes(event.estimatedAt, event.timeBasis)
        && (!filters.category || event.category === filters.category)
        && (!filters.manufacturer || normalizeText(event.manufacturer) === normalizeText(filters.manufacturer))
        && (!filters.model || normalizeText(event.model) === normalizeText(filters.model))
        && (!filters.domain || normalizeText(device.domain) === normalizeText(filters.domain))
        && (!filters.vip || (filters.vip === "yes") === Boolean(device.deviceVip || currentLocations.get(device.locationId)?.vip))
        && (!filters.locationId || event.locationId === filters.locationId)
        && (!filters.address || normalizeText(event.address) === normalizeText(filters.address));
    });
    const events = scopedEvents.map((event) => event.kind === "unknown_start" && event.silenceGap
      && event.silenceGap.seconds >= silenceMinutes * 60 && !event.silenceGap.knownAction && !event.silenceGap.clockAnomalyOrLongGap
      ? { ...event, kind: "suspected_power_loss", confidence: "low" } : event);
    const groups = {};
    for (const kind of ["confirmed_reboot", "power_off", "suspected_power_loss", "unknown_start", "start_after_shutdown"]) {
      const selected = events.filter((item) => item.kind === kind);
      const dates = new Map(); const hours = new Map(); const devices = new Map(); const locations = new Map(); const addresses = new Map();
      for (const event of selected) {
        const date = event.deviceLocalTime.slice(0, 10); const hour = event.deviceLocalTime.slice(11, 13);
        dates.set(date, (dates.get(date) || 0) + 1); hours.set(hour, (hours.get(hour) || 0) + 1);
        for (const [map, key] of [[devices, event.deviceName], [locations, event.locationName], [addresses, event.address]]) map.set(key, (map.get(key) || 0) + 1);
      }
      const ranking = (map) => [...map].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ru"));
      groups[kind] = { events: selected, count: selected.length, affectedDevices: new Set(selected.map((item) => item.deviceId)).size,
        affectedLocations: new Set(selected.map((item) => item.locationId).filter(Boolean)).size,
        byDate: [...dates].map(([label, count]) => ({ label, count })).sort((a, b) => a.label.localeCompare(b.label)),
        byHour: Array.from({ length: 24 }, (_, hour) => ({ label: String(hour).padStart(2, "0"), count: hours.get(String(hour).padStart(2, "0")) || 0 })),
        topDevices: ranking(devices).slice(0, 5), topLocations: ranking(locations).slice(0, 5), topAddresses: ranking(addresses).slice(0, 5) };
    }
    return { valid: true, errors: [], stale, coverage: index?.coverage || null, validationStatus: index?.validationStatus || null, silenceMinutes, groups };
  }

  function getAccountedVcsAnalytics(candidateState, analyticsSources, inputFilters) {
    const filters = inputFilters || {};
    const locations = new Map((candidateState?.locations || []).map((item) => [item.id, item]));
    const cohort = (candidateState?.inventoryDevices || []).filter((device) => {
      if (device.inCurrentSr === false || device.category !== "vcs"
        || normalizeText(device.equipmentOverallStatus || "").replace(/ё/g, "е") !== "учет") return false;
      const location = locations.get(device.locationId);
      const vip = Boolean(device.deviceVip || location?.vip);
      return (!filters.category || filters.category === "vcs")
        && (!filters.domain || normalizeText(device.domain) === normalizeText(filters.domain))
        && (!filters.manufacturer || normalizeManufacturer(device.manufacturerRaw || device.manufacturerNormalized) === normalizeManufacturer(filters.manufacturer))
        && (!filters.model || normalizeText(device.modelRaw) === normalizeText(filters.model))
        && (!filters.locationId || device.locationId === filters.locationId)
        && (!filters.address || normalizeText(location?.address) === normalizeText(filters.address))
        && (!filters.vip || (filters.vip === "yes") === vip);
    });
    const rows = cohort.map((device) => {
      const location = locations.get(device.locationId);
      return { deviceId: device.id, deviceName: device.nameRaw || device.modelRaw || "Устройство без названия",
        model: device.modelRaw || "Не указано", manufacturer: device.manufacturerRaw || "Не указано",
        ip: device.ipNormalized || device.ipRaw || "", mac: device.macNormalized || device.macRaw || "",
        domain: device.domain || "", vip: Boolean(device.deviceVip || location?.vip),
        locationName: location?.name || "", address: location?.address || "",
        rebootCount: 0, powerConfirmedCount: 0, powerSuspectedCount: 0,
        firstReboot: null, lastReboot: null, firstPowerConfirmed: null, lastPowerConfirmed: null,
        firstPowerSuspected: null, lastPowerSuspected: null };
    });
    const byId = new Map(rows.map((row) => [row.deviceId, row]));
    const kinds = { confirmed_reboot: ["rebootCount", "firstReboot", "lastReboot"],
      power_off: ["powerConfirmedCount", "firstPowerConfirmed", "lastPowerConfirmed"],
      suspected_power_loss: ["powerSuspectedCount", "firstPowerSuspected", "lastPowerSuspected"] };
    const eventsByKind = { confirmed_reboot: [], power_off: [], suspected_power_loss: [] };
    const seen = new Set();
    for (const source of analyticsSources || []) {
      if (!source?.valid || source.stale || source.validationStatus === "provisional_user_validation") continue;
      for (const [kind, [counter, first, last]] of Object.entries(kinds)) {
        for (const event of source.groups?.[kind]?.events || []) {
          const row = byId.get(event.deviceId);
          if (!row) continue;
          const at = String(event.deviceLocalTime || event.estimatedAt || "");
          const key = `${event.deviceId}|${kind}|${at}`;
          if (seen.has(key)) continue;
          seen.add(key);
          row[counter] += 1;
          if (!row[first] || at < row[first]) row[first] = at;
          if (!row[last] || at > row[last]) row[last] = at;
          eventsByKind[kind].push({ ...event, deviceName: row.deviceName, model: row.model,
            ip: row.ip, mac: row.mac, domain: row.domain, vip: row.vip,
            locationName: row.locationName, address: row.address });
        }
      }
    }
    const rank = (items, count) => [...items].sort((left, right) => count(right) - count(left)
      || left.deviceName.localeCompare(right.deviceName, "ru") || left.deviceId.localeCompare(right.deviceId));
    const powerCount = (row) => row.powerConfirmedCount + row.powerSuspectedCount;
    return { totalDevices: rows.length, rows, eventsByKind,
      rebootDevices: rows.filter((row) => row.rebootCount > 0).length, rebootEvents: eventsByKind.confirmed_reboot.length,
      powerConfirmedDevices: rows.filter((row) => row.powerConfirmedCount > 0).length, powerConfirmedEvents: eventsByKind.power_off.length,
      powerSuspectedDevices: rows.filter((row) => row.powerSuspectedCount > 0).length, powerSuspectedEvents: eventsByKind.suspected_power_loss.length,
      powerUnionDevices: rows.filter((row) => powerCount(row) > 0).length,
      topReboots: rank(rows.filter((row) => row.rebootCount > 0), (row) => row.rebootCount).slice(0, 5),
      topPowerConfirmed: rank(rows.filter((row) => row.powerConfirmedCount > 0), (row) => row.powerConfirmedCount).slice(0, 5),
      topPowerSuspected: rank(rows.filter((row) => row.powerSuspectedCount > 0), (row) => row.powerSuspectedCount).slice(0, 5) };
  }

  const POWER_DURATION_BUCKETS = Object.freeze([
    { id: "hour", label: "До 1 часа", maxSeconds: 3600, color: "#37a6bd" },
    { id: "day", label: "1 час — 1 сутки", maxSeconds: 86400, color: "#408dc5" },
    { id: "week", label: "1 сутки — 1 неделя", maxSeconds: 604800, color: "#6279cc" },
    { id: "month", label: "1 неделя — 1 месяц", maxSeconds: 2592000, color: "#816ac5" },
    { id: "three_months", label: "1 — 3 месяца", maxSeconds: 7776000, color: "#a46db8" },
    { id: "six_months", label: "3 — 6 месяцев", maxSeconds: 15552000, color: "#c9799b" },
    { id: "year", label: "6 месяцев — 1 год", maxSeconds: 31536000, color: "#df886b" },
    { id: "over_year", label: "Более года", maxSeconds: Infinity, color: "#bd5d65" }
  ]);

  function getPowerDurationAnalytics(teAnalytics, barAnalytics, candidateState, filters, bar300Analytics = null, box300Analytics = null) {
    const locations = new Map((candidateState?.locations || []).map((item) => [item.id, item]));
    const selectedDevices = (candidateState?.inventoryDevices || []).filter((device) => {
      if (device.inCurrentSr === false) return false;
      const location = locations.get(device.locationId);
      return (!filters.category || device.category === filters.category)
        && (!filters.manufacturer || normalizeText(device.manufacturerRaw || device.manufacturerNormalized) === normalizeText(filters.manufacturer))
        && (!filters.model || normalizeText(device.modelRaw || device.modelNormalized) === normalizeText(filters.model))
        && (!filters.domain || normalizeText(device.domain) === normalizeText(filters.domain))
        && (!filters.vip || (filters.vip === "yes") === Boolean(device.deviceVip || location?.vip))
        && (!filters.locationId || device.locationId === filters.locationId)
        && (!filters.address || normalizeText(location?.address) === normalizeText(filters.address));
    });
    const selectedIds = new Set(selectedDevices.map((item) => item.id));
    const byDevice = new Map();
    const selectedEvents = [teAnalytics, barAnalytics, bar300Analytics, box300Analytics].filter((item) => item?.valid && !item.stale && item.validationStatus !== "provisional_user_validation").flatMap((item) => Object.values(item.groups || {}).flatMap((group) => group.events || []));
    const starts = new Map();
    for (const event of selectedEvents) {
      if (!["confirmed_reboot", "unknown_start", "start_after_shutdown", "suspected_power_loss"].includes(event.kind)) continue;
      if (!starts.has(event.deviceId)) starts.set(event.deviceId, []);
      starts.get(event.deviceId).push(timeValue(event.estimatedAt));
    }
    for (const list of starts.values()) list.sort((a, b) => a - b);
    function nextStartAfter(deviceId, at) {
      const list = starts.get(deviceId) || [];
      let low = 0; let high = list.length;
      while (low < high) { const middle = (low + high) >>> 1; if (list[middle] <= at) low = middle + 1; else high = middle; }
      return low < list.length ? list[low] : null;
    }
    function consider(event, seconds, basis) {
      if (!selectedIds.has(event.deviceId) || !Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 10 * 365 * 86400) return;
      const previous = byDevice.get(event.deviceId);
      if (!previous || seconds > previous.seconds || (seconds === previous.seconds && basis === "confirmed")) byDevice.set(event.deviceId, { ...event, seconds, basis });
    }
    for (const event of selectedEvents) {
      if (event.kind === "suspected_power_loss") consider(event, event.silenceGap?.seconds, "suspected");
      if (event.kind !== "power_off") continue;
      const offAt = timeValue(event.estimatedAt);
      const next = nextStartAfter(event.deviceId, offAt);
      if (next !== null) consider(event, Math.round((next - offAt) / 1000), "confirmed");
    }
    const buckets = POWER_DURATION_BUCKETS.map((item) => ({ ...item, devices: [] }));
    for (const item of byDevice.values()) buckets.find((bucket) => item.seconds <= bucket.maxSeconds).devices.push(item);
    return { totalDevices: selectedDevices.length, observedDevices: byDevice.size, withoutMeasuredGap: selectedDevices.length - byDevice.size,
      buckets: buckets.map((item) => ({ ...item, count: item.devices.length, percent: selectedDevices.length ? item.devices.length / selectedDevices.length * 100 : 0 })) };
  }

  const POWER_HEATMAP_DAYS = Object.freeze(["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]);

  function getPowerHeatmapAnalytics(teAnalytics, barAnalytics, kind, bar300Analytics = null, box300Analytics = null) {
    const selectedKind = kind === "suspected" ? "suspected_power_loss" : "power_off";
    const cells = Array.from({ length: 7 * 24 }, (_, index) => ({ day: Math.floor(index / 24), hour: index % 24, devices: new Map(), count: 0, eventCount: 0 }));
    const seen = new Set();
    for (const analytics of [teAnalytics, barAnalytics, bar300Analytics, box300Analytics]) {
      if (!analytics?.valid || analytics.stale || analytics.validationStatus === "provisional_user_validation") continue;
      for (const event of analytics.groups?.[selectedKind]?.events || []) {
        const at = String(event.deviceLocalTime || "");
        if (!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(at) || !event.deviceId) continue;
        const date = new Date(`${at.slice(0, 10)}T${at.slice(11)}Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19).replace("T", " ") !== at) continue;
        const day = (date.getUTCDay() + 6) % 7;
        const hour = date.getUTCHours();
        const cell = cells[day * 24 + hour];
        const eventKey = `${event.deviceId}|${selectedKind}|${at}`;
        const duplicate = seen.has(eventKey);
        seen.add(eventKey);
        const entry = cell.devices.get(event.deviceId) || { deviceId: event.deviceId, deviceName: event.deviceName, model: event.model, ip: event.ip,
          locationName: event.locationName, address: event.address, count: 0, latestAt: "", sources: [] };
        if (!duplicate) entry.count += 1;
        if (at > entry.latestAt) entry.latestAt = at;
        for (const source of event.sources || []) {
          if (entry.sources.length >= 12) break;
          const path = String(source.path || "").slice(0, 512);
          const line = Number.isSafeInteger(source.line) ? source.line : null;
          if (path && !entry.sources.some((item) => item.path === path && item.line === line)) entry.sources.push({ path, line });
        }
        cell.devices.set(event.deviceId, entry);
        if (!duplicate) cell.eventCount += 1;
      }
    }
    for (const cell of cells) cell.count = cell.devices.size;
    return { kind: selectedKind, cells, maxCount: Math.max(0, ...cells.map((item) => item.count)),
      totalEvents: cells.reduce((sum, item) => sum + item.eventCount, 0),
      affectedDevices: new Set(cells.flatMap((item) => [...item.devices.keys()])).size };
  }

  function getVersionAnalysis(candidateState, kind) {
    if (!["project", "firmware"].includes(kind)) return { rows: [], devices: 0, changes: 0 };
    const devices = new Map((candidateState?.inventoryDevices || []).filter((item) => item.inCurrentSr !== false).map((item) => [item.id, item]));
    const locations = new Map((candidateState?.locations || []).map((item) => [item.id, item]));
    const histories = new Map();
    for (const result of candidateState?.pollingResults || []) {
      if (!devices.has(result.deviceId) || result.matchStatus !== "matched" || result.parseStatus !== "parsed" || result.pollStatus !== "success") continue;
      const blocks = getCaseInsensitive(result.normalizedData, "webBlocks");
      const section = getCaseInsensitive(blocks, kind === "project" ? "Project Info" : "Firmware");
      const raw = getCaseInsensitive(section, "Version");
      if (typeof raw !== "string" && typeof raw !== "number") continue;
      const version = String(raw).trim();
      if (!version || version.length > 160) continue;
      const capturedAt = normalizeDate(result.capturedAt);
      if (!capturedAt) continue;
      const history = histories.get(result.deviceId) || [];
      history.push({ resultId: result.id, filename: result.filename || "Не указано", capturedAt, version });
      histories.set(result.deviceId, history);
    }
    const rows = [];
    for (const [deviceId, history] of histories) {
      history.sort((left, right) => timeValue(left.capturedAt) - timeValue(right.capturedAt) || String(left.resultId).localeCompare(String(right.resultId)));
      const device = devices.get(deviceId);
      const location = locations.get(device.locationId);
      history.forEach((item, index) => rows.push({
        ...item, deviceId, deviceName: device.nameRaw || device.modelRaw || "Не указано",
        model: device.modelRaw || "Не указано", ip: device.ipNormalized || device.ip || "Не указано",
        locationName: location?.name || "Не указано", address: location?.address || "Не указано",
        previousVersion: index ? history[index - 1].version : null,
        comparison: index === 0 ? "first" : history[index - 1].version === item.version ? "unchanged" : "changed"
      }));
    }
    rows.sort((left, right) => timeValue(right.capturedAt) - timeValue(left.capturedAt) || left.deviceName.localeCompare(right.deviceName, "ru"));
    return { rows, devices: histories.size, changes: rows.filter((item) => item.comparison === "changed").length };
  }

  function getConnectionErrorAnalysis(candidateState) {
    const devices = new Map((candidateState?.inventoryDevices || []).filter((item) => item.inCurrentSr !== false).map((item) => [item.id, item]));
    const locations = new Map((candidateState?.locations || []).map((item) => [item.id, item]));
    const groups = { authorization_error: new Map(), network_unreachable: new Map() };
    for (const result of candidateState?.pollingResults || []) {
      if (!devices.has(result.deviceId) || result.matchStatus !== "matched" || !groups[result.pollStatus]) continue;
      const group = groups[result.pollStatus];
      const device = devices.get(result.deviceId);
      const location = locations.get(device.locationId);
      const row = group.get(device.id) || {
        deviceId: device.id, deviceName: device.nameRaw || device.modelRaw || "Не указано",
        ip: device.ipNormalized || device.ip || "Не указано", mac: device.macNormalized || device.macRaw || "Не указано",
        model: device.modelRaw || "Не указано", locationName: location?.name || "Не указано",
        address: location?.address || "Не указано", count: 0, lastAt: null, lastFilename: "Не указано"
      };
      row.count += 1;
      const capturedAt = normalizeDate(result.capturedAt);
      if (capturedAt && (!row.lastAt || timeValue(capturedAt) > timeValue(row.lastAt))) {
        row.lastAt = capturedAt;
        row.lastFilename = result.filename || "Не указано";
      }
      group.set(device.id, row);
    }
    const ordered = (group) => [...group.values()].sort((left, right) => right.count - left.count || left.deviceName.localeCompare(right.deviceName, "ru"));
    return { authorization: ordered(groups.authorization_error), network: ordered(groups.network_unreachable) };
  }

  function getDashboardSummary(candidateState, inputFilters, options) {
    const filters = { ...(inputFilters || {}) };
    const settings = options || {};
    const limit = Math.max(1, Math.min(Number(settings.limit) || DASHBOARD_LIST_LIMIT, 50));
    const currentDevices = candidateState.inventoryDevices.filter((device) => device.inCurrentSr !== false && EQUIPMENT_CATEGORY_IDS.includes(device.category));
    const locationsById = new Map(candidateState.locations.map((location) => [location.id, location]));
    const latestResults = new Map();
    const everPolledIds = new Set();
    for (const result of candidateState.pollingResults) {
      if (!result.deviceId) continue;
      everPolledIds.add(result.deviceId);
      const previous = latestResults.get(result.deviceId);
      if (!previous || compareTimedEntities(previous, result, "capturedAt") < 0) latestResults.set(result.deviceId, result);
    }
    const latestRun = [...candidateState.pollingRuns].sort((left, right) => compareTimedEntities(right, left, "capturedAt"))[0] || null;
    const period = dashboardPeriodScope(candidateState, filters, latestRun, settings.now);
    if (!period.valid) return { valid: false, errors: period.errors, filters, period: null };
    const activeChanges = candidateState.deviceChanges.filter((change) => change.status === "active");
    const changeIds = new Set(activeChanges.map((change) => change.deviceId));
    const states = currentDevices.map((device) => {
      const location = locationsById.get(device.locationId) || null;
      const latestResult = latestResults.get(device.id) || null;
      const operationalStatus = dashboardStatus(device, latestResult);
      const isVip = Boolean(device.deviceVip || location?.vip);
      const hasChanges = changeIds.has(device.id);
      const hasCurrentPingFailure = latestResult?.pingStatus === "failed";
      const isProblem = operationalStatus === "FAILED" || hasCurrentPingFailure;
      return { device, location, latestResult, capabilityStatus: dashboardCapability(device), operationalStatus, isVip, hasChanges, hasCurrentPingFailure, isProblem };
    }).filter((item) => {
      const device = item.device;
      return (!filters.category || device.category === filters.category)
        && (!filters.manufacturer || device.manufacturerNormalized === normalizeManufacturer(filters.manufacturer))
        && (!filters.model || normalizeText(device.modelRaw) === normalizeText(filters.model))
        && (!filters.locationId || device.locationId === filters.locationId)
        && (!filters.vip || String(item.isVip) === filters.vip)
        && (!filters.pollStatus || ({ success: "SUCCESS", failed: "FAILED", not_polled: "NOT_POLLED", unsupported: "UNSUPPORTED", unknown: "UNKNOWN" }[filters.pollStatus] || "") === item.operationalStatus);
    });
    const scopedIds = new Set(states.map((item) => item.device.id));
    const categoryCounts = Object.fromEntries(EQUIPMENT_CATEGORY_IDS.map((category) => [category, 0]));
    const manufacturerCounts = new Map();
    const modelCounts = new Map();
    const scopedLocationIds = new Set();
    for (const item of states) {
      categoryCounts[item.device.category] += 1;
      incrementDistribution(manufacturerCounts, item.device.manufacturerRaw || item.device.manufacturerNormalized);
      incrementDistribution(modelCounts, item.device.modelRaw);
      if (item.device.locationId) scopedLocationIds.add(item.device.locationId);
    }
    const latestRunResultIds = new Set(candidateState.pollingResults.filter((result) => result.runId === latestRun?.id && result.deviceId).map((result) => result.deviceId));
    for (const id of latestRun?.deviceIds || []) latestRunResultIds.add(id);
    const scopedChanges = activeChanges.filter((change) => scopedIds.has(change.deviceId));
    const changedDeviceIds = new Set(scopedChanges.map((change) => change.deviceId));
    const periodResults = candidateState.pollingResults.filter((result) => period.includes(result.capturedAt) && (!result.deviceId || scopedIds.has(result.deviceId)));
    const periodChanges = scopedChanges.filter((change) => period.includes(change.detectedAt));
    const issueTime = (issue) => issue.timestamp || issue.createdAt || candidateState.pollingResults.find((result) => result.id === issue.sourceId)?.importedAt;
    const periodIssues = candidateState.inventoryIssues.filter((issue) => issue.status !== "closed" && period.includes(issueTime(issue)) && (!issue.deviceId || scopedIds.has(issue.deviceId)));
    const dataIssueKinds = new Set(["malformed_json", "invalid_filename_ip", "unmatched_ip", "ambiguous_ip", "polling_ip_conflict", "classification_conflict", "invalid_ip", "missing_identity", "ambiguous_identity", "identity_collision", "duplicate_sr_row", "unknown_category"]);
    const openDataIssues = candidateState.inventoryIssues.filter((issue) => issue.status !== "closed" && dataIssueKinds.has(issue.kind) && (!issue.deviceId || scopedIds.has(issue.deviceId)));
    const unmatchedResults = candidateState.pollingResults.filter((result) => result.matchStatus === "unmatched" && (period.kind === "all" || result.runId === latestRun?.id || period.includes(result.capturedAt)));
    const locationAgg = new Map();
    for (const item of states) {
      if (!item.location) continue;
      if (!locationAgg.has(item.location.id)) locationAgg.set(item.location.id, { locationId: item.location.id, name: item.location.name || "Без названия", address: item.location.address || "", vip: Boolean(item.location.vip), totalDevices: 0, problemDevices: 0, pingFailures: 0, failures: 0, changedDevices: 0, noData: 0 });
      const row = locationAgg.get(item.location.id);
      row.totalDevices += 1;
      if (item.isProblem) row.problemDevices += 1;
      if (item.hasCurrentPingFailure) row.pingFailures += 1;
      if (item.operationalStatus === "FAILED") row.failures += 1;
      if (item.hasChanges) row.changedDevices += 1;
      if (["NOT_POLLED", "UNSUPPORTED", "UNKNOWN"].includes(item.operationalStatus)) row.noData += 1;
    }
    const locations = [...locationAgg.values()].filter((row) => row.problemDevices || row.changedDevices || row.noData).sort((left, right) => right.problemDevices - left.problemDevices || Number(right.vip) - Number(left.vip) || left.name.localeCompare(right.name, "ru")).slice(0, limit);
    const deviceById = new Map(states.map((item) => [item.device.id, item]));
    const equipmentProblems = states.filter((item) => item.isProblem).map((item) => ({ timestamp: item.latestResult?.capturedAt, kind: item.hasCurrentPingFailure ? "ping_failure" : "polling_failure", scope: "equipment", severity: "critical", deviceId: item.device.id, category: item.device.category, locationId: item.device.locationId, location: item.location?.name || "—", device: item.device.nameRaw || item.device.modelRaw || "Устройство", ip: item.device.ipNormalized || item.device.ipRaw || "—", description: item.hasCurrentPingFailure ? "Нет ответа по сети по результатам последнего опроса" : "Последний опрос завершился ошибкой" }));
    const dataProblems = openDataIssues.map((issue) => { const linkedResult = candidateState.pollingResults.find((result) => result.id === issue.sourceId); const item = deviceById.get(issue.deviceId || linkedResult?.deviceId); return { timestamp: issueTime(issue), kind: issue.kind, scope: "data", severity: "warning", deviceId: item?.device.id || null, category: item?.device.category || null, locationId: item?.device.locationId || null, location: item?.location?.name || "—", device: item?.device.nameRaw || linkedResult?.filename || "Файл импорта", ip: item?.device.ipNormalized || linkedResult?.filenameIp || "—", description: formatInventoryIssue(issue, linkedResult) }; });
    const recentChanges = scopedChanges.map((change) => { const item = deviceById.get(change.deviceId); return { timestamp: change.detectedAt, deviceId: change.deviceId, category: item?.device.category || null, location: item?.location?.name || "—", device: item?.device.nameRaw || item?.device.modelRaw || "Устройство", manufacturer: item?.device.manufacturerRaw || "—", model: item?.device.modelRaw || "—", path: change.path || "—", oldValue: safeDashboardValue(change.oldValue, change.path), newValue: safeDashboardValue(change.newValue, change.path) }; }).sort((left, right) => timeValue(right.timestamp) - timeValue(left.timestamp)).slice(0, limit);
    const latestProblems = [...equipmentProblems, ...dataProblems].sort((left, right) => timeValue(right.timestamp) - timeValue(left.timestamp)).slice(0, limit);
    const latestSr = [...candidateState.srImports].sort((left, right) => compareTimedEntities(right, left, "importedAt"))[0] || null;
    const vipStates = states.filter((item) => item.isVip);
    const latestTimestamp = [...latestResults.values()].filter((result) => scopedIds.has(result.deviceId)).sort((left, right) => compareTimedEntities(right, left, "capturedAt"))[0]?.capturedAt || null;
    const runStatus = latestRun ? latestRun.status || (latestRun.errorCount ? (latestRun.successCount ? "partial" : "failed") : latestRun.kind === "plan" ? "planned" : "completed") : null;
    const latestRunCategories = new Set((latestRun?.deviceIds || []).map((id) => currentDevices.find((device) => device.id === id)?.category).filter(Boolean));
    const drilldownByCategory = Object.fromEntries(EQUIPMENT_CATEGORY_IDS.map((category) => {
      const rows = states.filter((item) => item.device.category === category);
      return [category, {
        total: rows.length,
        success: rows.filter((item) => item.operationalStatus === "SUCCESS").length,
        failed: rows.filter((item) => item.operationalStatus === "FAILED").length,
        notPolled: rows.filter((item) => item.operationalStatus === "NOT_POLLED").length,
        unsupported: rows.filter((item) => item.operationalStatus === "UNSUPPORTED").length,
        pingFailures: rows.filter((item) => item.hasCurrentPingFailure).length,
        changed: rows.filter((item) => item.hasChanges).length,
        vipProblems: rows.filter((item) => item.isVip && item.isProblem).length
      }];
    }));
    return {
      valid: true, errors: [], filters, period: { kind: period.kind, from: period.from === null ? null : new Date(period.from).toISOString(), to: period.to === null ? null : new Date(period.to).toISOString(), label: period.label },
      emptyState: candidateState.srImports.length ? (candidateState.pollingResults.length ? null : "no_polling") : "no_sr",
      context: { sr: latestSr ? { id: latestSr.id, filename: latestSr.filename, importedAt: latestSr.importedAt, status: latestSr.status, rowCount: latestSr.rowCount } : null, latestRun: latestRun ? { id: latestRun.id, kind: latestRun.kind, capturedAt: latestRun.capturedAt, status: runStatus, deviceCount: latestRun.deviceIds?.length || latestRun.fileCount || 0, successCount: latestRun.successCount || 0, errorCount: latestRun.errorCount || 0, categories: [...latestRunCategories], manufacturer: latestRun.selectionSummary?.manufacturer || null } : null, lastPollingAt: latestTimestamp },
      inventory: { total: states.length, byCategory: categoryCounts, locations: scopedLocationIds.size, vipDevices: vipStates.length, vipLocations: new Set(vipStates.map((item) => item.device.locationId).filter(Boolean)).size },
      coverage: { everPolled: states.filter((item) => everPolledIds.has(item.device.id)).length, notPolled: states.filter((item) => item.operationalStatus === "NOT_POLLED").length, success: states.filter((item) => item.operationalStatus === "SUCCESS").length, failed: states.filter((item) => item.operationalStatus === "FAILED").length, unsupported: states.filter((item) => item.operationalStatus === "UNSUPPORTED").length, unknown: states.filter((item) => item.operationalStatus === "UNKNOWN").length, inLatestRun: states.filter((item) => latestRunResultIds.has(item.device.id)).length },
      health: { normal: states.filter((item) => item.operationalStatus === "SUCCESS" && !item.hasChanges).length, warning: states.filter((item) => item.operationalStatus === "SUCCESS" && item.hasChanges).length, error: states.filter((item) => item.operationalStatus === "FAILED").length, noData: states.filter((item) => item.operationalStatus === "NOT_POLLED").length, unsupported: states.filter((item) => item.operationalStatus === "UNSUPPORTED").length, unknown: states.filter((item) => item.operationalStatus === "UNKNOWN").length },
      problems: { currentPingFailures: states.filter((item) => item.hasCurrentPingFailure).length, currentFailures: states.filter((item) => item.operationalStatus === "FAILED").length, unmatched: unmatchedResults.length, dataErrors: openDataIssues.length },
      periodMetrics: { results: periodResults.length, failedResults: periodResults.filter((result) => ["authorization_error", "network_unreachable", "processing_error", "error"].includes(result.operationalStatus || result.pollStatus)).length, pingFailures: new Set(periodResults.filter((result) => result.pingStatus === "failed").map((result) => result.deviceId || result.id)).size, changedDevices: new Set(periodChanges.map((change) => change.deviceId)).size, changes: periodChanges.length, dataErrors: periodIssues.filter((issue) => dataIssueKinds.has(issue.kind)).length },
      changes: { changedDevices: changedDeviceIds.size, total: scopedChanges.length, recent: recentChanges, newInLatestSr: latestSr ? states.filter((item) => item.device.firstSeenAt === latestSr.importedAt).length : 0, missingFromLatestSr: candidateState.inventoryDevices.filter((device) => device.inCurrentSr === false && EQUIPMENT_CATEGORY_IDS.includes(device.category)).length },
      vip: { devices: vipStates.length, locations: new Set(vipStates.map((item) => item.device.locationId).filter(Boolean)).size, problems: vipStates.filter((item) => item.isProblem).length, noData: vipStates.filter((item) => ["NOT_POLLED", "UNSUPPORTED", "UNKNOWN"].includes(item.operationalStatus)).length },
      locations, latestProblems, recentChanges,
      drilldown: { byCategory: drilldownByCategory },
      distributions: { categories: distributionRows(new Map(EQUIPMENT_CATEGORY_IDS.map((category) => [formatCategoryLabel(category), categoryCounts[category]])), EQUIPMENT_CATEGORY_IDS.length), manufacturers: distributionRows(manufacturerCounts, limit), models: distributionRows(modelCounts, limit) },
      freshness: { latestTimestamp, noData: states.filter((item) => !item.latestResult).length, outdated: null },
      blockedAnalytics: { authorization: null, reboots: "available", gcPlus: null, freshnessThreshold: null }
    };
  }

  function getInventoryAnalytics(candidateState, category) {
    const devices = candidateState.inventoryDevices.filter((device) => device.inCurrentSr !== false && (!category || device.category === category));
    const latest = devices.map((device) => candidateState.pollingResults.filter((result) => result.deviceId === device.id).sort(comparePollingResultsNewest)[0]).filter(Boolean);
    const deviceIds = new Set(devices.map((device) => device.id));
    const changes = candidateState.deviceChanges.filter((change) => change.status === "active" && deviceIds.has(change.deviceId));
    const changedDeviceIds = new Set(changes.map((change) => change.deviceId));
    return {
      total: devices.length, polled: latest.length, unpolled: devices.length - latest.length,
      success: latest.filter((result) => result.pollStatus === "success").length,
      errors: latest.filter((result) => ["authorization_error", "network_unreachable", "processing_error", "error"].includes(result.operationalStatus || result.pollStatus)).length,
      pingFailures: latest.filter((result) => result.pingStatus === "failed").length,
      changedDevices: changedDeviceIds.size, changes: changes.length,
      authorizationFailures: null, rebootCount: null, gcPlusLocations: null
    };
  }

  function filterInventoryDevices(candidateState, category, inputFilters) {
    const filters = inputFilters || {};
    const currentScope = filters.current || DEFAULT_INVENTORY_FILTERS.current;
    return candidateState.inventoryDevices.filter((device) => {
      if (device.category !== category) return false;
      const location = candidateState.locations.find((item) => item.id === device.locationId);
      const latest = candidateState.pollingResults.filter((item) => item.deviceId === device.id).sort(comparePollingResultsNewest)[0];
      const hasChanges = candidateState.deviceChanges.some((item) => item.deviceId === device.id && item.status === "active");
      const support = dashboardCapability(device);
      const haystack = [device.nameRaw, device.modelRaw, device.manufacturerRaw, device.ipRaw, device.serialNumber, device.inventoryNumber, location?.name, location?.address].map((item) => normalizeText(item) || "").join(" ");
      return (!filters.search || haystack.includes(normalizeText(filters.search)))
        && (!filters.manufacturer || device.manufacturerNormalized === normalizeManufacturer(filters.manufacturer))
        && (currentScope === "all" || (currentScope === "yes" ? device.inCurrentSr !== false : device.inCurrentSr === false))
        && (!filters.pollStatus || (latest?.operationalStatus || latest?.pollStatus || "never") === filters.pollStatus)
        && (!filters.vip || String(Boolean(device.deviceVip || location?.vip)) === filters.vip)
        && (!filters.ping || (latest?.pingStatus || "unknown") === filters.ping)
        && (!filters.changed || String(hasChanges) === filters.changed)
        && (!filters.support || support === filters.support)
        && (!filters.model || normalizeText(device.modelRaw) === normalizeText(filters.model))
        && (!filters.locationId || device.locationId === filters.locationId);
    });
  }

  function buildVcsSiteNameRows(candidateState, inputFilters, prefilteredDevices) {
    const devices = prefilteredDevices || filterInventoryDevices(candidateState, "vcs", inputFilters);
    const deviceIds = new Set(devices.map((device) => device.id));
    const latestByDevice = new Map();
    for (const result of candidateState.pollingResults) {
      if (!deviceIds.has(result.deviceId)) continue;
      const previous = latestByDevice.get(result.deviceId);
      if (!previous || comparePollingResultsNewest(result, previous) < 0) latestByDevice.set(result.deviceId, result);
    }
    const locations = new Map(candidateState.locations.map((location) => [location.id, location]));
    return devices.map((device) => {
      const latest = latestByDevice.get(device.id);
      const hasCurrentReading = latest?.parseStatus === "parsed" && (latest.operationalStatus || latest.pollStatus) === "success";
      const location = locations.get(device.locationId);
      return {
        deviceName: device.nameRaw || null,
        siteName: hasCurrentReading ? siteNameFromPollingData(latest.normalizedData, device) : null,
        ip: device.ipNormalized || device.ipRaw || null,
        mac: device.macNormalized || device.macRaw || null,
        address: location?.address || null,
        locationName: location?.name || null,
        domain: device.domain || null
      };
    });
  }

  function buildVcsSiteNameXlsx(rows) {
    if (!global.XLSX) return { ok: false, errors: ["Локальная библиотека XLSX не загружена"] };
    try {
      const columns = ["deviceName", "siteName", "ip", "mac", "address", "locationName", "domain"];
      const matrix = [VCS_SITE_NAME_HEADERS, ...rows.map((row) => columns.map((column) => row[column] == null ? "" : String(row[column])))];
      const sheet = global.XLSX.utils.aoa_to_sheet(matrix);
      for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
          const cell = sheet[global.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
          if (cell) { cell.t = "s"; delete cell.f; }
        }
      }
      sheet["!cols"] = [32, 32, 19, 20, 34, 30, 24].map((wch) => ({ wch }));
      sheet["!autofilter"] = { ref: `A1:G${matrix.length}` };
      const workbook = global.XLSX.utils.book_new();
      global.XLSX.utils.book_append_sheet(workbook, sheet, "Site name");
      return { ok: true, bytes: global.XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }), errors: [] };
    } catch (_error) {
      return { ok: false, errors: ["Не удалось сформировать XLSX с Site name"] };
    }
  }

  function buildAccountedVcsXlsx(analytics, kind) {
    if (!global.XLSX || !["reboot", "power"].includes(kind)) return { ok: false, errors: ["Локальный XLSX-экспорт недоступен"] };
    try {
      const selected = (analytics?.rows || []).filter((row) => kind === "reboot" ? row.rebootCount > 0
        : row.powerConfirmedCount > 0 || row.powerSuspectedCount > 0);
      selected.sort((left, right) => (kind === "reboot" ? right.rebootCount - left.rebootCount
        : right.powerConfirmedCount + right.powerSuspectedCount - left.powerConfirmedCount - left.powerSuspectedCount)
        || left.deviceName.localeCompare(right.deviceName, "ru") || left.deviceId.localeCompare(right.deviceId));
      const commonHeaders = ["Устройство", "Модель", "IP", "MAC", "Домен", "VIP", "Локация", "Адрес"];
      const headers = kind === "reboot" ? [...commonHeaders, "Перезагрузки", "Первое событие", "Последнее событие", "Основание", "Статус SR"]
        : [...commonHeaders, "Штатные выключения", "Предполагаемые паузы", "Первое штатное", "Последнее штатное", "Первая пауза", "Последняя пауза", "Достоверность", "Статус SR"];
      const text = (value) => value == null ? "" : String(value);
      const common = (row) => [text(row.deviceName), text(row.model), text(row.ip), text(row.mac), text(row.domain), row.vip ? "Да" : "Нет", text(row.locationName), text(row.address)];
      const matrix = [headers, ...selected.map((row) => kind === "reboot"
        ? [...common(row), row.rebootCount, text(row.firstReboot), text(row.lastReboot), "Подтверждено логом", "Учёт"]
        : [...common(row), row.powerConfirmedCount, row.powerSuspectedCount, text(row.firstPowerConfirmed), text(row.lastPowerConfirmed),
          text(row.firstPowerSuspected), text(row.lastPowerSuspected),
          [row.powerConfirmedCount ? "штатное выключение: подтверждено" : "", row.powerSuspectedCount ? "пауза: предположение" : ""].filter(Boolean).join("; "), "Учёт"])];
      const sheet = global.XLSX.utils.aoa_to_sheet(matrix);
      for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
          const cell = sheet[global.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
          if (!cell) continue;
          if (columnIndex === 8 || (kind === "power" && columnIndex === 9)) cell.t = "n";
          else { cell.t = "s"; delete cell.f; }
        }
      }
      sheet["!autofilter"] = { ref: `A1:${global.XLSX.utils.encode_col(headers.length - 1)}${matrix.length}` };
      sheet["!cols"] = headers.map((_, index) => ({ wch: [32, 24, 18, 20, 22, 8, 30, 36][index] || 22 }));
      const workbook = global.XLSX.utils.book_new();
      global.XLSX.utils.book_append_sheet(workbook, sheet, kind === "reboot" ? "Перезагрузки" : "Питание");
      return { ok: true, bytes: global.XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }), errors: [] };
    } catch {
      return { ok: false, errors: ["Не удалось сформировать XLSX для терминалов в учёте"] };
    }
  }

  function auditModelToken(value) {
    const model = (normalizeText(value) || "").replace(/\b(?:huawei|polycom|cloudlink|cloudlinc)\b/g, " ").replace(/\s+/g, " ").trim();
    const te = model.match(/\bte\s*(20|30|40|50|60)\b/);
    if (te) return `te${te[1]}`;
    const cloud = model.match(/\b(bar|box)\s*(300|310|600|610)\b/);
    if (cloud) return `${cloud[1]}${cloud[2]}`;
    const group = model.match(/\brealpresence\s+group\s*(300|310|500|700)\b/);
    return group ? `group${group[1]}` : null;
  }

  function auditFact(field, result) {
    if (!result) return "Нет данных";
    const setting = getCaseInsensitive(getCaseInsensitive(result.normalizedData, "deviceSettings")?.fields, field);
    const status = normalizeText(getCaseInsensitive(setting, "status"));
    if (status === "not_exposed") {
      if (field === "snmpV2" && setting.reason === "version_not_supported") return "Не поддерживается (не используется)";
      if (field === "wifi" && setting.reason === "capability_absent") return "Отсутствует (отключено)";
      return "Не предоставлено интерфейсом";
    }
    if (getCaseInsensitive(setting, "validationStatus") === "provisional_user_validation") return "Требует проверки";
    if (status !== "read") return "Нет данных";
    const value = getCaseInsensitive(setting, "value");
    if (field === "ssh" && getCaseInsensitive(setting, "basis") === "legacy_api_fallback"
      && getCaseInsensitive(setting, "ruleVersion") === "polycom-ssh-source-priority-v1"
      && ["enabled", "disabled"].includes(value)) {
      return `${value === "enabled" ? "Включено" : "Выключено"} (по Legacy API over SSH)`;
    }
    if (value === "enabled") return "Включено";
    if (value === "disabled") return "Отключено";
    if (field === "ntp" && isPlainObject(value) && typeof value.enabled === "boolean" && [0, 1].includes(value.modeCode) && typeof value.server === "string") {
      return `${value.enabled ? "Включено" : "Отключено"}; тип: ${value.modeCode === 1 ? "Вручную" : "Автоматически"}; сервер: ${value.server || "не указан"}`;
    }
    if (field === "ntp" && isPlainObject(value) && value.enabled === true && value.mode === "manual" && value.modeCode === "Manual"
      && (typeof value.primaryServer === "string" || value.primaryServer === null)
      && (typeof value.secondaryServer === "string" || value.secondaryServer === null)) {
      return `Включено; режим: Вручную; основной сервер: ${value.primaryServer || "не указан"}; дополнительный: ${value.secondaryServer || "не указан"}`;
    }
    if (field === "autoAnswer" && isPlainObject(value) && ["enabled", "disabled", null].includes(value.pointToPoint)
      && ["enabled", "disabled", null].includes(value.multipoint)) {
      const label = (mode) => mode === "enabled" ? "включено" : mode === "disabled" ? "отключено" : "нет данных";
      return `Одноточечные: ${label(value.pointToPoint)}; многоточечные: ${label(value.multipoint)}`;
    }
    if (field === "ssh" && isPlainObject(value) && typeof value.legacyApiOverSshEnabled === "boolean" && value.sshServiceEnabled === null) {
      return `Legacy API over SSH: ${value.legacyApiOverSshEnabled ? "включено" : "отключено"}; служба SSH: нет данных`;
    }
    if (field === "powerManagement" && isPlainObject(value) && value.hangupLongPressAction === "power_off" && value.sleepMode === null) {
      return "Длительное нажатие: выключение; спящий режим: нет данных";
    }
    if (field === "wifi" && isPlainObject(value) && typeof value.clientEnabled === "boolean" && typeof value.accessPointEnabled === "boolean") {
      return `Клиент: ${value.clientEnabled ? "включён" : "отключён"}; точка доступа: ${value.accessPointEnabled ? "включена" : "отключена"}${typeof value.preferredNetworkEnabled === "boolean" ? `; приоритет Wi-Fi: ${value.preferredNetworkEnabled ? "включён" : "отключён"}` : ""}`;
    }
    return typeof value === "string" && value.trim() ? value.trim() : "Нет данных";
  }

  function buildDeviceSettingsAuditRows(targetList, candidateState) {
    const headers = Array.isArray(targetList?.headers) ? targetList.headers : [];
    const originalRows = Array.isArray(targetList?.rows) ? targetList.rows : [];
    const devices = Array.isArray(targetList?.devices) ? targetList.devices : [];
    if (!headers.length || originalRows.length !== devices.length) return { ok: false, errors: ["Список устройств нужно загрузить заново"] };
    const factByHeader = new Map([
      ["snmp v2", [["SNMP v2, факт", "snmpV2"]]],
      ["ssh", [["SSH, факт", "ssh"]]],
      ["автообновление", [["Автообновление, факт", "autoUpdate"]]],
      ["автодозвон", [["Автодозвон, факт", "autoAnswer"]]],
      ["ntp", [["NTP, факт", "ntp"]]],
      ["wi-fi", [["Wi-Fi, факт", "wifi"]]],
      ["wifi", [["Wi-Fi, факт", "wifi"]]]
    ]);
    const outputHeaders = [];
    const outputKeys = [];
    const seenFacts = new Set();
    for (const header of headers) {
      outputHeaders.push(header);
      outputKeys.push({ source: header });
      const key = normalizeSrHeader(header).replace(/\s*\/\s*/g, "/");
      const facts = ["telnet/http", "http/telnet"].includes(key)
        ? [["Telnet, факт", "telnet"], ["HTTP, факт", "http"]]
        : key === "telnet" ? [["Telnet, факт", "telnet"]]
          : key === "http" ? [["HTTP, факт", "http"]] : factByHeader.get(key) || [];
      for (const [label, field] of facts) {
        if (seenFacts.has(label)) continue;
        seenFacts.add(label);
        outputHeaders.push(label);
        outputKeys.push({ field });
      }
    }
    if (!seenFacts.size) return { ok: false, errors: ["В списке не найдены колонки настроек Telnet/HTTP, SNMP v2, Автообновление, Автодозвон, NTP или Wi-Fi"] };
    outputHeaders.push("Статус сверки", "Файл опроса", "Дата опроса");
    const indexed = new Map();
    for (const result of candidateState?.pollingResults || []) {
      if (!result?.filenameIp) continue;
      if (!indexed.has(result.filenameIp)) indexed.set(result.filenameIp, []);
      indexed.get(result.filenameIp).push(result);
    }
    let withFacts = 0;
    const matrixRows = originalRows.map((sourceRow, index) => {
      const target = devices[index];
      const candidates = (indexed.get(target.ipNormalized) || []).sort(comparePollingResultsNewest);
      const latest = candidates[0] || null;
      const observedModel = getCaseInsensitive(getCaseInsensitive(latest?.normalizedData?.webBlocks, "Device Info"), "Model");
      const exactIp = latest && latest.internalIp === target.ipNormalized && !["ip_conflict", "ambiguous", "category_conflict"].includes(latest.matchStatus);
      const modelMatches = auditModelToken(target.modelRaw || target.modelNormalized) && auditModelToken(target.modelRaw || target.modelNormalized) === auditModelToken(observedModel);
      const adapterMatches = latest?.normalizedData?.adapterKey === target.pollingCapability?.key;
      const valid = exactIp && modelMatches && adapterMatches && latest.parseStatus === "parsed" && (latest.operationalStatus || latest.pollStatus) === "success";
      const usable = valid ? latest : null;
      if (outputKeys.some((key) => key.field && !["Нет данных", "Не предоставлено интерфейсом", "Требует проверки"].includes(auditFact(key.field, usable)))) withFacts += 1;
      const status = !latest ? "Нет файла опроса" : !exactIp ? "IP не подтверждён" : !modelMatches ? "Модель не совпадает" : !adapterMatches ? "Контракт опроса не подтверждён" : !valid ? "Опрос неуспешен" : "Сопоставлено";
      return [...outputKeys.map((key) => key.source !== undefined ? String(sourceRow[key.source] ?? "") : auditFact(key.field, usable)), status, latest?.filename || "", latest?.capturedAt || ""];
    });
    return { ok: true, headers: outputHeaders, rows: matrixRows, total: matrixRows.length, withFacts, errors: [] };
  }

  function buildDeviceSettingsAuditXlsx(targetList, candidateState) {
    if (!global.XLSX) return { ok: false, errors: ["Локальная библиотека XLSX не загружена"] };
    const report = buildDeviceSettingsAuditRows(targetList, candidateState);
    if (!report.ok) return report;
    try {
      const matrix = [report.headers, ...report.rows];
      const sheet = global.XLSX.utils.aoa_to_sheet(matrix);
      for (let rowIndex = 1; rowIndex < matrix.length; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < report.headers.length; columnIndex += 1) {
          const cell = sheet[global.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
          if (cell) { cell.t = "s"; delete cell.f; }
        }
      }
      sheet["!autofilter"] = { ref: `A1:${global.XLSX.utils.encode_col(report.headers.length - 1)}${matrix.length}` };
      sheet["!cols"] = report.headers.map((header) => ({ wch: Math.min(42, Math.max(16, String(header).length + 2)) }));
      const workbook = global.XLSX.utils.book_new();
      global.XLSX.utils.book_append_sheet(workbook, sheet, "Фактические настройки");
      return { ...report, bytes: global.XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) };
    } catch (_error) {
      return { ok: false, errors: ["Не удалось сформировать XLSX с фактическими настройками"] };
    }
  }

  function diagnoseSrCategoryPipeline(rows, candidateState) {
    const categories = EQUIPMENT_CATEGORY_CATALOG.map((item) => item.id);
    const emptyCounts = () => Object.fromEntries(categories.map((category) => [category, 0]));
    const report = {
      ruleRows: emptyCounts(), normalizedRows: emptyCounts(), classifiedRows: emptyCounts(),
      identityRows: emptyCounts(), inventoryRows: emptyCounts(), tableRows: emptyCounts()
    };
    for (const rawRow of Array.isArray(rows) ? rows : []) {
      const normalized = normalizedSrRow(rawRow);
      for (const descriptor of EQUIPMENT_CATEGORY_CATALOG) {
        if (matchesSrCategoryRule(rawRow, descriptor)) report.ruleRows[descriptor.id] += 1;
        const normalizedValue = normalizeSrHeader(descriptor.srField) === normalizeSrHeader("Класс оборудования")
          ? normalized.equipmentTypeNormalized : normalized.modelTypeNormalized;
        if (normalizedValue === normalizeSrCategoryValue(descriptor.srValue)) report.normalizedRows[descriptor.id] += 1;
      }
      if (categories.includes(normalized.category)) report.classifiedRows[normalized.category] += 1;
    }
    if (candidateState) {
      for (const category of categories) {
        const inventoryCount = candidateState.inventoryDevices.filter((device) => device.inCurrentSr !== false && device.category === category).length;
        report.identityRows[category] = inventoryCount;
        report.inventoryRows[category] = inventoryCount;
        report.tableRows[category] = filterInventoryDevices(candidateState, category, DEFAULT_INVENTORY_FILTERS).length;
      }
    }
    return report;
  }

  function rebuildDeviceChanges(next, deviceId) {
    next.deviceChanges = next.deviceChanges.filter((item) => item.deviceId !== deviceId);
    const device = next.inventoryDevices.find((item) => item.id === deviceId);
    const results = next.pollingResults.filter((item) => item.deviceId === deviceId && item.parseStatus === "parsed" && normalizeDate(item.capturedAt))
      .sort(pollingResultOrder);
    for (let index = 1; index < results.length; index += 1) {
      const differences = diffAnalyzedParameters(device, results[index - 1].normalizedData, results[index].normalizedData);
      differences.forEach((difference) => next.deviceChanges.push({ id: createId("device-change"), deviceId, fromPollingResultId: results[index - 1].id, toPollingResultId: results[index].id, detectedAt: results[index].capturedAt, status: "active", ...difference }));
    }
  }

  async function ingestPollingResultText(currentState, input) {
    let next = deepClone(currentState);
    const runTimestamp = input.runCapturedAt || input.capturedAt ? { ok: true, capturedAt: normalizeDate(input.runCapturedAt || input.capturedAt), source: input.runCapturedAtSource || input.capturedAtSource || "manual" } : parseRunFolderTimestamp(input.folderName || "");
    if (!runTimestamp.ok || !runTimestamp.capturedAt) return { ok: false, outcome: "failed", state: next, errors: [runTimestamp.error || "Некорректная дата запуска"] };
    const resultTimestamp = resolvePollingResultTimestamp(input);
    const run = ensurePollingRun(next, input, runTimestamp.capturedAt);
    if (!run) return { ok: false, outcome: "failed", state: next, errors: ["Polling run не найден"] };
    const rawText = String(input.text || "");
    const rawSha256 = await sha256Text(rawText);
    const ipInfo = parsePollingFilenameIp(input.name || "");
    if (next.pollingResults.some((item) => item.runId === run.id && item.rawSha256 === rawSha256 && item.filename === input.name)) return { ok: true, outcome: "duplicate", state: next, errors: [] };
    let payload = null;
    let parseError = null;
    try { payload = JSON.parse(rawText); } catch (error) { parseError = error.message || String(error); }
    const detectedCategory = payload ? detectExtronJsonDeviceType(payload) : "unknown";
    const { currentInventoryByIp, historicalInventoryByIp } = createPollingInventoryIndexes(next.inventoryDevices);
    const match = resolvePollingInventoryMatch({
      filenameIp: ipInfo.ip,
      payload,
      detectedCategory,
      currentCandidates: ipInfo.ip ? (currentInventoryByIp.get(ipInfo.ip) || []) : [],
      historicalCandidates: ipInfo.ip ? (historicalInventoryByIp.get(ipInfo.ip) || []) : []
    });
    const device = match.device;
    const status = payload ? scopePollingStatusToInventory(derivePollingStatus(payload), device) : { pollStatus: "processing_error", pingStatus: "unknown", authorizationStatus: "unknown", authorizationEvidence: null, rebootCount: null, gcPlus: null };
    const observationTimestamp = resolvePollingObservationTimestamp(payload, resultTimestamp);
    const result = {
      id: createId("polling-result"), runId: run.id, filename: input.name || "unknown.json", filenameIp: ipInfo.ip,
      sourceRelativePath: normalizePollingRelativePath(input.relativePath || input.name || "unknown.json"),
      deviceId: device?.id || null, capturedAt: resultTimestamp.capturedAt, capturedAtSource: resultTimestamp.source, sourceLastModified: resultTimestamp.sourceLastModified, importedAt: input.importedAt || nowIso(),
      observationAt: observationTimestamp.observationAt, observationAtSource: observationTimestamp.source, observationConfidence: observationTimestamp.confidence, observationUncertaintyMs: observationTimestamp.uncertaintyMs,
      rawText, rawSha256, parseStatus: parseError ? "malformed" : "parsed", parseError,
      detectedCategory, matchStatus: match.matchStatus,
      classificationConflict: match.matchStatus === "category_conflict",
      internalIp: match.internalIp, internalIpEvidence: match.internalIpEvidence,
      historicalCandidateDeviceIds: match.historicalCandidateDeviceIds,
      normalizedData: payload ? pollingPayloadProjection(payload) : {}, ...status
    };
    result.operationalStatus = parseError ? "processing_error" : !device ? "unmatched" : status.pollStatus;
    next.pollingResults.push(result);
    run.fileCount += 1;
    if (result.operationalStatus === "success") run.successCount += 1; else run.errorCount += 1;
    if (parseError) next.inventoryIssues.push(createInventoryIssue({ kind: "malformed_json", sourceType: "polling_result", sourceId: result.id, message: `JSON не прочитан: ${parseError}` }));
    if (!ipInfo.ok) next.inventoryIssues.push(createInventoryIssue({ kind: "invalid_filename_ip", sourceType: "polling_result", sourceId: result.id, message: ipInfo.error }));
    const matchIssue = pollingMatchIssueInput(match, ipInfo.ip);
    if (matchIssue) next.inventoryIssues.push(createInventoryIssue({ ...matchIssue, sourceType: "polling_result", sourceId: result.id }));
    if (device) rebuildDeviceChanges(next, device.id);
    next = appendHistory(next, { actorId: input.actorId || "system", action: "Импортирован результат опроса", entityType: "polling_result", entityId: result.id, details: `${result.filename}: ${result.matchStatus}` });
    return { ok: true, outcome: parseError ? "failed" : result.matchStatus, state: next, pollingResultId: result.id, runId: run.id, errors: parseError ? [parseError] : [] };
  }

  async function ingestPollingRunFiles(currentState, input) {
    const folderTimestamp = input.capturedAt ? { ok: true, capturedAt: normalizeDate(input.capturedAt), source: "manual" } : parseRunFolderTimestamp(input.folderName || "");
    if (!folderTimestamp.ok || !folderTimestamp.capturedAt) return { ok: false, outcome: "failed", state: deepClone(currentState), errors: [folderTimestamp.error || "Некорректная дата запуска"] };
    let next = deepClone(currentState);
    const run = ensurePollingRun(next, { ...input, capturedAtSource: folderTimestamp.source }, folderTimestamp.capturedAt);
    const results = [];
    for (const file of input.files || []) {
      const imported = await ingestPollingResultText(next, { ...input, ...file, runId: run.id, runCapturedAt: folderTimestamp.capturedAt, runCapturedAtSource: folderTimestamp.source });
      next = imported.state;
      results.push({ name: file.name, relativePath: file.relativePath || file.name, outcome: imported.outcome, errors: imported.errors });
    }
    return { ok: true, outcome: results.some((item) => item.outcome === "failed") ? "partial" : "processed", state: next, runId: run.id, results, errors: [] };
  }

  async function ingestPollingFolderTree(currentState, input) {
    const grouping = groupPollingFilesByRunFolder(input.files || []);
    if (!grouping.batches.length) {
      return {
        ok: false,
        outcome: "failed",
        state: deepClone(currentState),
        folderResults: [],
        rejected: grouping.rejected,
        ignored: grouping.ignored,
        readErrors: [],
        errors: ["В выбранной папке не найдено JSON в папках формата YYYY-MM-DD_HH-MM-SS"]
      };
    }
    let next = deepClone(currentState);
    const folderResults = [];
    const readErrors = [];
    let importedFileCount = 0;
    let parseErrorCount = 0;
    for (const batch of grouping.batches) {
      const readableFiles = [];
      const batchReadErrors = [];
      batch.files.forEach((file) => {
        if (file.readError) {
          const issue = { name: file.name, relativePath: file.relativePath, reason: String(file.readError) };
          batchReadErrors.push(issue);
          readErrors.push(issue);
        } else {
          readableFiles.push(file);
        }
      });
      if (!readableFiles.length) {
        folderResults.push({ folderName: batch.folderName, folderPath: batch.folderPath, capturedAt: batch.capturedAt, outcome: "failed", fileCount: batch.files.length, importedCount: 0, errorCount: batchReadErrors.length, fileErrors: batchReadErrors });
        continue;
      }
      const imported = await ingestPollingRunFiles(next, {
        folderName: batch.folderName,
        folderPath: batch.folderPath,
        actorId: input.actorId || "system",
        importedAt: input.importedAt,
        files: readableFiles
      });
      if (!imported.ok) {
        folderResults.push({ folderName: batch.folderName, folderPath: batch.folderPath, capturedAt: batch.capturedAt, outcome: "failed", fileCount: batch.files.length, importedCount: 0, errorCount: batch.files.length, fileErrors: [{ relativePath: batch.folderPath, reason: imported.errors.join("; ") }] });
        continue;
      }
      next = imported.state;
      importedFileCount += imported.results.length;
      const parseErrors = imported.results.filter((item) => item.outcome === "failed").map((item) => ({ name: item.name, relativePath: item.relativePath, reason: "JSON не удалось разобрать" }));
      parseErrorCount += parseErrors.length;
      const fileErrors = [...batchReadErrors, ...parseErrors];
      folderResults.push({
        folderName: batch.folderName,
        folderPath: batch.folderPath,
        capturedAt: batch.capturedAt,
        runId: imported.runId,
        outcome: fileErrors.length || imported.outcome === "partial" ? "partial" : "processed",
        fileCount: batch.files.length,
        importedCount: imported.results.length,
        errorCount: fileErrors.length,
        fileErrors
      });
    }
    const successfulFolders = folderResults.filter((item) => item.runId).length;
    const hasPartial = grouping.rejected.length || readErrors.length || parseErrorCount || folderResults.some((item) => item.outcome !== "processed");
    return {
      ok: successfulFolders > 0,
      outcome: successfulFolders > 0 ? (hasPartial ? "partial" : "processed") : "failed",
      state: successfulFolders > 0 ? next : deepClone(currentState),
      folderResults,
      rejected: grouping.rejected,
      ignored: grouping.ignored,
      readErrors,
      importedFolderCount: successfulFolders,
      importedFileCount,
      errorCount: grouping.rejected.length + readErrors.length + parseErrorCount,
      errors: successfulFolders > 0 ? [] : ["Ни одна папка опроса не была импортирована"]
    };
  }

  const DEFAULT_POLLING_IMPORT_BATCH_SIZE = 32;
  const MAX_POLLING_READ_CONCURRENCY = 6;

  function monotonicNow() {
    return global.performance?.now ? global.performance.now() : Date.now();
  }

  function pollingResultOrder(left, right) {
    const leftTime = normalizeDate(left?.capturedAt) ? new Date(left.capturedAt).getTime() : null;
    const rightTime = normalizeDate(right?.capturedAt) ? new Date(right.capturedAt).getTime() : null;
    if (leftTime !== null && rightTime !== null) return leftTime - rightTime || String(left.id).localeCompare(String(right.id));
    if (leftTime !== null) return -1;
    if (rightTime !== null) return 1;
    return timeValue(left?.importedAt) - timeValue(right?.importedAt) || String(left?.id || "").localeCompare(String(right?.id || ""));
  }

  function comparePollingResultsNewest(left, right) {
    const leftKnown = Boolean(normalizeDate(left?.capturedAt));
    const rightKnown = Boolean(normalizeDate(right?.capturedAt));
    if (leftKnown && rightKnown) return pollingResultOrder(right, left);
    if (leftKnown) return -1;
    if (rightKnown) return 1;
    return timeValue(right?.importedAt) - timeValue(left?.importedAt) || String(right?.id || "").localeCompare(String(left?.id || ""));
  }

  function pollingPairKey(deviceId, fromResultId, toResultId) {
    return `${deviceId}|${fromResultId}|${toResultId}`;
  }

  function pollingDuplicateKey(runId, filename, rawSha256) {
    return `${runId}|${filename}|${rawSha256}`;
  }

  async function selectNewPollingFiles(files, previousResults, readPrefixHash) {
    const byPath = new Map();
    for (const result of previousResults || []) {
      const path = normalizePollingRelativePath(result.sourceRelativePath || "");
      if (!path || !Number.isSafeInteger(result.sourceFileSize) || !Number.isSafeInteger(result.sourceFileLastModified)
        || !/^[0-9a-f]{64}$/i.test(String(result.sourcePrefixSha256 || ""))) continue;
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path).push(result);
    }
    const decorated = await mapWithBoundedConcurrency(files || [], 6, async (file) => {
      let prefix = null;
      try { prefix = await readPrefixHash(file); } catch { /* full read will report the failure */ }
      return { ...file, sourcePrefixSha256: prefix };
    });
    const pending = [], skipped = [];
    for (const file of decorated) {
      const path = normalizePollingRelativePath(file.relativePath || file.name || "");
      const matches = (byPath.get(path) || []).some((prior) => prior.sourceFileSize === file.size
        && prior.sourceFileLastModified === file.lastModified && prior.sourcePrefixSha256 === file.sourcePrefixSha256);
      (matches ? skipped : pending).push(file);
    }
    return { pending, skipped };
  }

  function createPollingImportContext(candidateState) {
    const { currentInventoryByIp, historicalInventoryByIp } = createPollingInventoryIndexes(candidateState.inventoryDevices);
    const runByIdentity = new Map(candidateState.pollingRuns.filter((run) => run.identityKey).map((run) => [run.identityKey, run]));
    const duplicateKeys = new Set(candidateState.pollingResults.map((result) => pollingDuplicateKey(result.runId, result.filename, result.rawSha256)));
    const historyByDevice = new Map();
    for (const result of candidateState.pollingResults) {
      if (!result.deviceId || result.parseStatus !== "parsed" || !normalizeDate(result.capturedAt)) continue;
      if (!historyByDevice.has(result.deviceId)) historyByDevice.set(result.deviceId, []);
      historyByDevice.get(result.deviceId).push(result);
    }
    historyByDevice.forEach((history) => history.sort(pollingResultOrder));
    const changesByPair = new Map();
    for (const change of candidateState.deviceChanges) {
      const key = pollingPairKey(change.deviceId, change.fromPollingResultId, change.toPollingResultId);
      if (!changesByPair.has(key)) changesByPair.set(key, []);
      changesByPair.get(key).push(change);
    }
    return { state: candidateState, currentInventoryByIp, historicalInventoryByIp,inventoryById:new Map(candidateState.inventoryDevices.map((row)=>[row.id,row])), runByIdentity, duplicateKeys, historyByDevice, changesByPair, removedChangeIds: new Set(), removedPairs:new Map() };
  }

  function defaultPollingReadConcurrency() {
    const hardware = Number(global.navigator?.hardwareConcurrency) || 4;
    return Math.max(2, Math.min(MAX_POLLING_READ_CONCURRENCY, Math.ceil(hardware / 2)));
  }

  async function cooperativeBrowserYield() {
    if (global.scheduler && typeof global.scheduler.yield === "function") {
      await global.scheduler.yield();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function mapWithBoundedConcurrency(items, limit, mapper) {
    const output = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        output[index] = await mapper(items[index], index);
      }
    }));
    return output;
  }

  function ensureIndexedPollingRun(context, input, capturedAt) {
    const folderIdentity = input.folderPath || input.folderName || "manual";
    const identityKey = `${capturedAt}|${folderIdentity}`;
    let run = context.runByIdentity.get(identityKey);
    if (!run) {
      run = ensurePollingRun(context.state, input, capturedAt);
      if (run) context.runByIdentity.set(identityKey, run);
    }
    return run;
  }

  function removeIndexedPollingPair(context, deviceId, fromResult, toResult) {
    if (!fromResult || !toResult) return;
    const key = pollingPairKey(deviceId, fromResult.id, toResult.id);
    context.removedPairs?.set(key,[deviceId,fromResult.id,toResult.id]);
    const existing = context.changesByPair.get(key) || [];
    existing.forEach((change) => context.removedChangeIds.add(change.id));
    context.changesByPair.delete(key);
  }

  function addIndexedPollingPair(context, deviceId, fromResult, toResult, metrics) {
    if (!fromResult || !toResult) return;
    const device = context.inventoryById?.get(deviceId)||context.state.inventoryDevices.find((item) => item.id === deviceId);
    const differences = diffAnalyzedParameters(device, fromResult.normalizedData, toResult.normalizedData);
    const changes = differences.map((difference) => ({
      id: createId("device-change"),
      deviceId,
      fromPollingResultId: fromResult.id,
      toPollingResultId: toResult.id,
      detectedAt: toResult.capturedAt,
      status: "active",
      ...difference
    }));
    context.state.deviceChanges.push(...changes);
    context.changesByPair.set(pollingPairKey(deviceId, fromResult.id, toResult.id), changes);
    metrics.diffPairs += 1;
  }

  function insertIndexedPollingHistory(context, result, metrics) {
    if (!result.deviceId || result.parseStatus !== "parsed" || !normalizeDate(result.capturedAt)) return;
    let history = context.historyByDevice.get(result.deviceId);
    if (!history) {
      history = [];
      context.historyByDevice.set(result.deviceId, history);
    }
    let low = 0;
    let high = history.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (pollingResultOrder(history[middle], result) <= 0) low = middle + 1;
      else high = middle;
    }
    const previous = history[low - 1] || null;
    const next = history[low] || null;
    removeIndexedPollingPair(context, result.deviceId, previous, next);
    history.splice(low, 0, result);
    addIndexedPollingPair(context, result.deviceId, previous, result, metrics);
    addIndexedPollingPair(context, result.deviceId, result, next, metrics);
  }

  function compactRemovedPollingChanges(context) {
    if (!context.removedChangeIds.size) return;
    context.state.deviceChanges = context.state.deviceChanges.filter((change) => !context.removedChangeIds.has(change.id));
    context.removedChangeIds.clear();
  }

  async function ingestIndexedPollingFile(context, input, metrics) {
    const rawText = String(input.text || "");
    const hashStarted = monotonicNow();
    const rawSha256 = await sha256Text(rawText);
    metrics.stagesMs.hash += monotonicNow() - hashStarted;
    const duplicateKey = pollingDuplicateKey(input.run.id, input.name, rawSha256);
    if (context.duplicateKeys.has(duplicateKey)) return { outcome: "duplicate", errors: [] };

    const parseStarted = monotonicNow();
    let payload = null;
    let parseError = null;
    try { payload = JSON.parse(rawText); } catch (error) { parseError = error.message || String(error); }
    metrics.parses += 1;
    metrics.stagesMs.parsing += monotonicNow() - parseStarted;

    const ipInfo = parsePollingFilenameIp(input.name || "");
    const matchingStarted = monotonicNow();
    const currentCandidates = ipInfo.ip ? (context.currentInventoryByIp.get(ipInfo.ip) || []) : [];
    const historicalCandidates = ipInfo.ip ? (context.historicalInventoryByIp.get(ipInfo.ip) || []) : [];
    if (ipInfo.ip) metrics.srLookups += 1;
    const detectedCategory = payload ? detectExtronJsonDeviceType(payload) : "unknown";
    const match = resolvePollingInventoryMatch({ filenameIp: ipInfo.ip, payload, detectedCategory, currentCandidates, historicalCandidates });
    const device = match.device;
    metrics.stagesMs.srMatching += monotonicNow() - matchingStarted;

    const normalizationStarted = monotonicNow();
    const status = payload ? scopePollingStatusToInventory(derivePollingStatus(payload), device) : { pollStatus: "processing_error", pingStatus: "unknown", authorizationStatus: "unknown", authorizationEvidence: null, rebootCount: null, gcPlus: null };
    const normalizedData = payload ? pollingPayloadProjection(payload) : {};
    const timestamp = resolvePollingResultTimestamp(input);
    const observationTimestamp = resolvePollingObservationTimestamp(payload, timestamp);
    metrics.normalized += 1;
    metrics.stagesMs.normalization += monotonicNow() - normalizationStarted;

    const result = {
      id: input.indexedResultId || createId("polling-result"), runId: input.run.id, filename: input.name || "unknown.json", filenameIp: ipInfo.ip,
      sourceRelativePath: normalizePollingRelativePath(input.relativePath || input.name || "unknown.json"),
      deviceId: device?.id || null, capturedAt: timestamp.capturedAt, capturedAtSource: timestamp.source, sourceLastModified: timestamp.sourceLastModified, importedAt: input.importedAt || nowIso(),
      sourceFileSize: Number.isSafeInteger(input.size) ? input.size : null,
      sourceFileLastModified: Number.isSafeInteger(input.lastModified) ? input.lastModified : null,
      sourcePrefixSha256: /^[0-9a-f]{64}$/i.test(String(input.sourcePrefixSha256 || "")) ? input.sourcePrefixSha256 : null,
      observationAt: observationTimestamp.observationAt, observationAtSource: observationTimestamp.source, observationConfidence: observationTimestamp.confidence, observationUncertaintyMs: observationTimestamp.uncertaintyMs,
      rawText, rawSha256, parseStatus: parseError ? "malformed" : "parsed", parseError,
      detectedCategory, matchStatus: match.matchStatus,
      classificationConflict: match.matchStatus === "category_conflict",
      internalIp: match.internalIp, internalIpEvidence: match.internalIpEvidence,
      historicalCandidateDeviceIds: match.historicalCandidateDeviceIds,
      normalizedData, ...status
    };
    result.operationalStatus = parseError ? "processing_error" : !device ? "unmatched" : status.pollStatus;

    if(input.seedHistory) {
      const seed=await input.seedHistory(result);
      if(seed.duplicate) {context.duplicateKeys.add(duplicateKey);return {outcome:"duplicate",errors:[]};}
      if(result.deviceId) {
        const history=context.historyByDevice.get(result.deviceId)||[];
        const ids=new Set(history.map((row)=>row.id));
        for(const row of seed.rows||[])if(!ids.has(row.id)){history.push(row);ids.add(row.id);}
        history.sort(pollingResultOrder);
        context.historyByDevice.set(result.deviceId,history);
      }
    }
    context.state.pollingResults.push(result);
    input.run.fileCount += 1;
    if (result.operationalStatus === "success") input.run.successCount += 1; else input.run.errorCount += 1;
    if (parseError) context.state.inventoryIssues.push(createInventoryIssue({ kind: "malformed_json", sourceType: "polling_result", sourceId: result.id, message: `JSON не прочитан: ${parseError}` }));
    if (!ipInfo.ok) context.state.inventoryIssues.push(createInventoryIssue({ kind: "invalid_filename_ip", sourceType: "polling_result", sourceId: result.id, message: ipInfo.error }));
    const matchIssue = pollingMatchIssueInput(match, ipInfo.ip);
    if (matchIssue) context.state.inventoryIssues.push(createInventoryIssue({ ...matchIssue, sourceType: "polling_result", sourceId: result.id }));
    const changesStarted = monotonicNow();
    insertIndexedPollingHistory(context, result, metrics);
    metrics.stagesMs.changeDetection += monotonicNow() - changesStarted;
    context.state.history.push(makeHistoryEntry({ actorId: input.actorId || "system", action: "Импортирован результат опроса", entityType: "polling_result", entityId: result.id, details: `${result.filename}: ${result.matchStatus}` }));
    context.duplicateKeys.add(duplicateKey);
    return { outcome: parseError ? "failed" : result.matchStatus, result, errors: parseError ? [parseError] : [] };
  }

  async function processPollingImportBatches(currentState, input) {
    const startedAt = monotonicNow();
    const groupingStarted = monotonicNow();
    const grouping = groupPollingFilesByRunFolder(input.files || []);
    const metrics = {
      reads: 0, parses: 0, srLookups: 0, normalized: 0, diffPairs: 0, yields: 0, batches: 0, maxBatchRetainedTexts: 0,
      stagesMs: { discoveryAndGrouping: 0, reading: 0, hash: 0, parsing: 0, srMatching: 0, normalization: 0, changeDetection: 0, storage: 0, analytics: 0, uiOverhead: 0 }
    };
    metrics.stagesMs.discoveryAndGrouping = monotonicNow() - groupingStarted;
    let context = input.context?.state === currentState ? input.context : createPollingImportContext(currentState);
    const batchSize = Math.max(1, Number(input.batchSize) || DEFAULT_POLLING_IMPORT_BATCH_SIZE);
    const concurrency = Math.max(1, Math.min(MAX_POLLING_READ_CONCURRENCY, Number(input.concurrency) || defaultPollingReadConcurrency()));
    const readText = input.readText || (async (file) => {
      if (file.readError) throw new Error(String(file.readError));
      if (file.text !== undefined) return String(file.text);
      if (file.sourceFile && typeof file.sourceFile.text === "function") return file.sourceFile.text();
      throw new Error("Не удалось прочитать файл");
    });
    const yieldControl = input.yieldControl || cooperativeBrowserYield;
    const shouldCancel = typeof input.shouldCancel === "function" ? input.shouldCancel : () => false;
    const onProgress = typeof input.onProgress === "function" ? input.onProgress : () => {};
    const summary = { total: grouping.batches.reduce((sum, batch) => sum + batch.files.length, 0) + grouping.rejected.length, processed: grouping.rejected.length, succeeded: 0, errors: grouping.rejected.length, duplicates: 0, runs: 0 };
    const folderResults = [];
    const readErrors = [];

    const emitProgress = (stage, currentRun, status) => {
      const progressStarted = monotonicNow();
      const elapsedSeconds = Math.max((monotonicNow() - startedAt) / 1000, 0.001);
      const filesPerSecond = summary.processed / elapsedSeconds;
      onProgress({
        stage, total: summary.total, processed: summary.processed, succeeded: summary.succeeded, errors: summary.errors,
        duplicates: summary.duplicates, currentRun: currentRun || null, filesPerSecond,
        etaSeconds: filesPerSecond > 0 ? Math.max(0, (summary.total - summary.processed) / filesPerSecond) : null,
        status: status || "running", cancelRequested: shouldCancel()
      });
      metrics.stagesMs.uiOverhead += monotonicNow() - progressStarted;
    };

    emitProgress("Поиск файлов", null);
    emitProgress("Подготовка запусков опроса", null);
    if (!grouping.batches.length) {
      return { ok: false, cancelled: false, outcome: "failed", state: currentState, context, summary, metrics, folderResults, rejected: grouping.rejected, ignored: grouping.ignored, readErrors, errors: ["В выбранной папке не найдено JSON в папках формата YYYY-MM-DD_HH-MM-SS"] };
    }

    let cancelled = false;
    for (const runGroup of grouping.batches) {
      if (shouldCancel()) { cancelled = true; break; }
      const fileOutcomes = [];
      let run = null;
      for (let offset = 0; offset < runGroup.files.length; offset += batchSize) {
        if (shouldCancel()) { cancelled = true; break; }
        const descriptors = runGroup.files.slice(offset, offset + batchSize);
        emitProgress("Чтение файлов", runGroup.folderName);
        const readingStarted = monotonicNow();
        const prepared = await mapWithBoundedConcurrency(descriptors, concurrency, async (descriptor) => {
          try {
            const text = await readText(descriptor);
            metrics.reads += 1;
            return { descriptor, text: String(text) };
          } catch (error) {
            return { descriptor, readError: error?.message || String(error) };
          }
        });
        metrics.stagesMs.reading += monotonicNow() - readingStarted;
        metrics.maxBatchRetainedTexts = Math.max(metrics.maxBatchRetainedTexts, prepared.filter((item) => item.text !== undefined).length);
        if(input.seedBatch && prepared.some((item)=>item.text!==undefined)) {
          if(!run){
            run=ensureIndexedPollingRun(context,{...runGroup,actorId:input.actorId||"system",importedAt:input.importedAt,capturedAtSource:runGroup.capturedAtSource},runGroup.capturedAt);
            if(run)summary.runs+=1;
          }
          const metadata=await mapWithBoundedConcurrency(prepared.filter((item)=>item.text!==undefined),6,async(item)=>{
            item.descriptor={...item.descriptor,indexedResultId:createId("polling-result")};
            const ip=parsePollingFilenameIp(item.descriptor.name).ip;
            const candidates=ip?context.currentInventoryByIp.get(ip)||[]:[];
            return {id:item.descriptor.indexedResultId,deviceId:candidates.length===1?candidates[0].id:null,
              capturedAt:resolvePollingResultTimestamp({...item.descriptor,run}).capturedAt,runId:run.id,
              filename:item.descriptor.name,rawSha256:await sha256Text(item.text),parseStatus:"parsed"};
          });
          await input.seedBatch(metadata);
        }
        emitProgress("Обработка результатов", runGroup.folderName);
        for (const preparedFile of prepared) {
          if (preparedFile.readError) {
            const issue = { name: preparedFile.descriptor.name, relativePath: preparedFile.descriptor.relativePath, reason: preparedFile.readError };
            readErrors.push(issue);
            fileOutcomes.push({ ...issue, outcome: "failed", errors: [issue.reason] });
            summary.errors += 1;
            summary.processed += 1;
            continue;
          }
          if (!run) {
            run = ensureIndexedPollingRun(context, { ...runGroup, actorId: input.actorId || "system", importedAt: input.importedAt, capturedAtSource: runGroup.capturedAtSource }, runGroup.capturedAt);
            if (run) summary.runs += 1;
          }
          const imported = await ingestIndexedPollingFile(context, {
            ...preparedFile.descriptor,
            text: preparedFile.text,
            run,
            seedHistory:input.seedHistory,
            importedAt: input.importedAt,
            actorId: input.actorId || "system"
          }, metrics);
          fileOutcomes.push({ name: preparedFile.descriptor.name, relativePath: preparedFile.descriptor.relativePath, outcome: imported.outcome, errors: imported.errors });
          if (imported.outcome === "duplicate") summary.duplicates += 1;
          else if (imported.outcome === "failed") summary.errors += 1;
          else summary.succeeded += 1;
          summary.processed += 1;
          preparedFile.text = null;
        }
        compactRemovedPollingChanges(context);
        metrics.batches += 1;
        emitProgress("Сохранение данных", runGroup.folderName);
        if(input.onBatch) {
          const compacted = await input.onBatch(context.state,context,run);
          if (compacted) context = {...context,state:currentState,duplicateKeys:new Set(),historyByDevice:new Map(),
            changesByPair:new Map(),removedChangeIds:new Set(),removedPairs:new Map()};
        }
        await yieldControl();
        metrics.yields += 1;
      }
      const fileErrors = fileOutcomes.filter((item) => item.outcome === "failed").map((item) => ({ name: item.name, relativePath: item.relativePath, reason: item.errors?.join("; ") || "Ошибка обработки" }));
      folderResults.push({
        folderName: runGroup.folderName, folderPath: runGroup.folderPath, capturedAt: runGroup.capturedAt, runId: run?.id,
        outcome: run ? (fileErrors.length ? "partial" : "processed") : "failed", fileCount: runGroup.files.length,
        importedCount: fileOutcomes.length - fileErrors.length, errorCount: fileErrors.length, fileErrors
      });
      if (cancelled) break;
    }
    compactRemovedPollingChanges(context);
    emitProgress("Обновление аналитики", null, cancelled ? "cancelled" : "running");
    emitProgress(cancelled ? "Загрузка остановлена" : "Готово", null, cancelled ? "cancelled" : "completed");
    const successfulFolders = folderResults.filter((item) => item.runId).length;
    const hasPartial = cancelled || grouping.rejected.length || readErrors.length || summary.errors > grouping.rejected.length || folderResults.some((item) => item.outcome !== "processed");
    return {
      ok: successfulFolders > 0,
      cancelled,
      outcome: cancelled ? "cancelled" : successfulFolders > 0 ? (hasPartial ? "partial" : "processed") : "failed",
      state: currentState,
      context,
      summary,
      metrics,
      folderResults,
      rejected: grouping.rejected,
      ignored: grouping.ignored,
      readErrors,
      importedFolderCount: successfulFolders,
      importedFileCount: summary.succeeded,
      errorCount: summary.errors,
      errors: successfulFolders > 0 ? [] : ["Ни одна папка опроса не была импортирована"]
    };
  }

  function detectSnapshotProfile(payload) {
    if (!isPlainObject(payload)) return "unsupported";
    if (Object.prototype.hasOwnProperty.call(payload, "schemaVersion")) {
      return payload.schemaVersion === "1.0" ? "extron-v1" : "unsupported";
    }
    const blocks = payload.webBlocks;
    const projectInfo = isPlainObject(blocks) ? blocks["Project Info"] : null;
    const hasShape = typeof payload.ip === "string"
      && typeof payload.ok === "boolean"
      && isPlainObject(payload.webInterface)
      && isPlainObject(blocks)
      && isPlainObject(blocks.Firmware)
      && isPlainObject(projectInfo)
      && Array.isArray(projectInfo["Connected Devices"])
      && isPlainObject(blocks["LAN Settings"]);
    if (!hasShape) return "unsupported";
    const evidence = `${payload.webInterface.evidence || ""} ${(payload.webInterface.markers || []).join(" ")}`;
    const extronMarker = /extron/i.test(evidence) || isPlainObject(projectInfo["TLP Project"]);
    return extronMarker ? "extron-legacy-v1" : "unsupported";
  }

  function validateExtronV1(payload) {
    const errors = [];
    if (!isPlainObject(payload)) return { ok: false, errors: ["Root должен быть object"] };
    const required = ["schemaVersion", "snapshotId", "capturedAt", "collectorVersion", "sourceSystem", "completeness", "ip", "ok", "webBlocks"];
    required.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) errors.push(`Отсутствует обязательное поле ${key}`);
    });
    if (payload.schemaVersion !== "1.0") errors.push("Поддерживается только schemaVersion 1.0");
    if (typeof payload.snapshotId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.snapshotId)) {
      errors.push("snapshotId должен быть UUID");
    }
    if (!normalizeDate(payload.capturedAt)) errors.push("capturedAt должен быть корректной date-time");
    if (typeof payload.collectorVersion !== "string" || !payload.collectorVersion.trim()) errors.push("collectorVersion обязателен");
    if (typeof payload.sourceSystem !== "string" || !payload.sourceSystem.trim()) errors.push("sourceSystem обязателен");
    if (typeof payload.ip !== "string" || !payload.ip.trim()) errors.push("ip обязателен");
    if (typeof payload.ok !== "boolean") errors.push("ok должен быть boolean");
    if (!isPlainObject(payload.completeness)) {
      errors.push("completeness должен быть object");
    } else {
      COMPLETENESS_SECTIONS.forEach((section) => {
        if (!COMPLETENESS_STATUSES.includes(payload.completeness[section])) {
          errors.push(`completeness.${section} имеет неподдерживаемый status`);
        }
      });
    }
    const blocks = payload.webBlocks;
    if (!isPlainObject(blocks)) {
      errors.push("webBlocks должен быть object");
    } else {
      if (!isPlainObject(blocks.Firmware)) errors.push("webBlocks.Firmware обязателен");
      if (!isPlainObject(blocks["Project Info"])) errors.push("webBlocks['Project Info'] обязателен");
      if (!isPlainObject(blocks["LAN Settings"])) errors.push("webBlocks['LAN Settings'] обязателен");
      if (isPlainObject(blocks["Project Info"]) && !Array.isArray(blocks["Project Info"]["Connected Devices"])) {
        errors.push("Connected Devices должен быть массивом");
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function deriveLegacyMetadata(payload) {
    const path = String(payload && payload.outputFile || "");
    const match = path.match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
    if (!match) {
      return { ok: false, capturedAt: null, source: "manual", error: "timestamp_ambiguous" };
    }
    const localWithOffset = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+03:00`;
    const capturedAt = normalizeDate(localWithOffset);
    return capturedAt
      ? { ok: true, capturedAt, source: "legacy_output_path" }
      : { ok: false, capturedAt: null, source: "manual", error: "timestamp_ambiguous" };
  }

  function buildCompleteness(profile, payload) {
    const result = {};
    if (profile === "extron-v1") {
      COMPLETENESS_SECTIONS.forEach((section) => {
        result[section] = { status: payload.completeness[section], source: "collector", details: null };
      });
      return result;
    }
    const defaults = {
      project: "partial",
      controller: "partial",
      devices: "unknown",
      network: "partial",
      firmware: "partial",
      gui: "unknown",
      runtime: "partial",
      diagnostics: "partial"
    };
    COMPLETENESS_SECTIONS.forEach((section) => {
      result[section] = { status: defaults[section], source: "legacy_inference", details: "Legacy format не объявляет полноту раздела" };
    });
    return result;
  }

  function safeIssue(code, category, severity, sourcePaths, details) {
    return {
      id: createId("issue"),
      code,
      category,
      severity,
      sourcePaths: Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths].filter(Boolean),
      safeDetails: details || "",
      status: "open",
      detectedAt: nowIso(),
      resolvedAt: null
    };
  }

  function detectSecrets(payload) {
    const issues = [];
    const secretKey = /(password|passwd|token|secret|credential|api.?key|authorization)/i;
    function visit(value, path) {
      if (!value || typeof value !== "object") return;
      Object.entries(value).forEach(([key, child]) => {
        const childPath = `${path}.${key}`;
        if (secretKey.test(key) && child !== null && child !== "") {
          issues.push(safeIssue("secret_detected", "security", "critical", childPath, "Обнаружено поле, похожее на секрет; значение скрыто"));
          return;
        }
        visit(child, childPath);
      });
    }
    visit(payload, "$");
    return issues;
  }

  function extractGuiUuid(device) {
    const entries = Array.isArray(device && device.vtlpweb) ? device.vtlpweb : [];
    for (const entry of entries) {
      const match = String(entry && entry.url || "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
      if (match) return match[0].toLowerCase();
    }
    return null;
  }

  function deviceRecordKey(device) {
    const stable = device.inventoryId || device.serialNumber || extractGuiUuid(device);
    if (stable) return `stable:${normalizeText(stable)}`;
    return `composite:${[
      normalizeText(device.modelname),
      normalizeText(device.partnum || device.partnumber),
      normalizeIp(device.addr),
      normalizeText(device.name)
    ].join("|")}`;
  }

  function reconcileDeviceRecords(projectInfo) {
    const connected = Array.isArray(projectInfo["Connected Devices"]) ? projectInfo["Connected Devices"] : [];
    const systemdevs = Array.isArray(projectInfo["TLP Project"] && projectInfo["TLP Project"].systemdevs)
      ? projectInfo["TLP Project"].systemdevs
      : [];
    const records = new Map();
    const issues = [];
    const comparableKeys = ["inventoryId", "serialNumber", "addr", "macAddress", "modelname", "name", "partnum", "partnumber"];

    function add(record, path) {
      if (!isPlainObject(record)) return;
      const key = deviceRecordKey(record);
      if (!records.has(key)) {
        records.set(key, { value: deepClone(record), sourcePaths: [path] });
        return;
      }
      const existing = records.get(key);
      comparableKeys.forEach((field) => {
        const left = existing.value[field];
        const right = record[field];
        if ((left === null || left === undefined || left === "") && right !== undefined) {
          existing.value[field] = deepClone(right);
        } else if (right !== null && right !== undefined && right !== "" && normalizeComparable(left) !== normalizeComparable(right)) {
          issues.push(safeIssue(
            "duplicate_source_conflict",
            "data_quality",
            "high",
            [existing.sourcePaths[0], path],
            `Дублирующие источники расходятся по полю ${field}`
          ));
        }
      });
      if ((!existing.value.vtlpweb || !existing.value.vtlpweb.length) && Array.isArray(record.vtlpweb)) {
        existing.value.vtlpweb = deepClone(record.vtlpweb);
      }
      existing.sourcePaths.push(path);
    }

    connected.forEach((record, index) => add(record, `$.webBlocks['Project Info']['Connected Devices'][${index}]`));
    systemdevs.forEach((record, index) => add(record, `$.webBlocks['Project Info']['TLP Project'].systemdevs[${index}]`));
    return { records: Array.from(records.values()), issues };
  }

  function buildIdentifiers(record) {
    const result = [];
    function add(kind, value, strength) {
      const normalized = kind === "mac" ? normalizeMac(value) : normalizeText(value);
      if (normalized && !result.some((item) => item.kind === kind && item.valueNormalized === normalized)) {
        result.push({ kind, valueNormalized: normalized, strength, verified: strength === "stable" });
      }
    }
    add("inventory_id", record.inventoryId, "stable");
    add("serial", record.serialNumber, "stable");
    add("gui_uuid", extractGuiUuid(record), "stable");
    add("mac", record.macAddress, "strong");
    return result;
  }

  function normalizeDeviceObservation(record, sourcePaths) {
    const basePath = sourcePaths[0];
    const guiUuid = extractGuiUuid(record);
    return {
      id: createId("observation"),
      assetId: null,
      sourceLocalKey: deviceRecordKey(record),
      kind: /tlp|panel/i.test(String(record.modelname || "")) ? "touch_panel" : "other",
      identifiers: buildIdentifiers(record),
      matchConfidence: "unmatched",
      matchCandidates: [],
      quality: "valid",
      sourcePaths: deepClone(sourcePaths),
      fields: {
        name: makeField(record.name, `${basePath}.name`, normalizeText),
        ipAddress: makeField(record.addr, `${basePath}.addr`, normalizeIp),
        macAddress: makeField(record.macAddress, `${basePath}.macAddress`, normalizeMac),
        model: makeField(record.modelname, `${basePath}.modelname`, normalizeText),
        partNumber: makeField(record.partnum || record.partnumber, `${basePath}.partnum`, normalizeText),
        guiUuid: makeField(guiUuid, `${basePath}.vtlpweb[*].url`, normalizeText)
      }
    };
  }

  function normalizeControllerObservation(projectInfo, lan, firmware) {
    const tlp = isPlainObject(projectInfo["TLP Project"]) ? projectInfo["TLP Project"] : {};
    const source = "$.webBlocks";
    const controllerRecord = {
      serialNumber: tlp.serialNumber || tlp.serialnumber,
      macAddress: lan["MAC Address"]
    };
    return {
      id: createId("observation"),
      assetId: null,
      sourceLocalKey: "controller",
      kind: "controller",
      identifiers: buildIdentifiers(controllerRecord),
      matchConfidence: "unmatched",
      matchCandidates: [],
      quality: "valid",
      sourcePaths: ["$.webBlocks['Project Info']['TLP Project']", "$.webBlocks['LAN Settings']"],
      fields: {
        hostname: makeField(lan["Host Name"], `${source}['LAN Settings']['Host Name']`, normalizeText),
        ipAddress: makeField(lan["IP Address"], `${source}['LAN Settings']['IP Address']`, normalizeIp),
        macAddress: makeField(lan["MAC Address"], `${source}['LAN Settings']['MAC Address']`, normalizeMac),
        subnet: makeField(lan["Subnet Mask"], `${source}['LAN Settings']['Subnet Mask']`, normalizeIp),
        gateway: makeField(lan.Gateway, `${source}['LAN Settings'].Gateway`, normalizeIp),
        dnsServers: makeField(lan["DNS Server"], `${source}['LAN Settings']['DNS Server']`, normalizeUnordered),
        dhcp: makeField(lan.DHCP, `${source}['LAN Settings'].DHCP`, normalizeBoolean),
        model: makeField(tlp.modelname, `${source}['Project Info']['TLP Project'].modelname`, normalizeText),
        partNumber: makeField(tlp.partnumber, `${source}['Project Info']['TLP Project'].partnumber`, normalizeText),
        firmwareVersion: makeField(firmware.Version, `${source}.Firmware.Version`, normalizeText)
      }
    };
  }

  function normalizeSnapshot(payload, profile) {
    const blocks = payload.webBlocks || {};
    const firmware = blocks.Firmware || {};
    const projectInfo = blocks["Project Info"] || {};
    const lan = blocks["LAN Settings"] || {};
    const reconciliation = reconcileDeviceRecords(projectInfo);
    const assetObservations = [normalizeControllerObservation(projectInfo, lan, firmware)];
    reconciliation.records.forEach((entry) => {
      assetObservations.push(normalizeDeviceObservation(entry.value, entry.sourcePaths));
    });
    return {
      projectObservation: {
        fields: {
          projectName: makeField(projectInfo.Project, "$.webBlocks['Project Info'].Project", normalizeText),
          projectVersion: makeField(projectInfo.Version, "$.webBlocks['Project Info'].Version", normalizeText),
          projectRevision: makeField(projectInfo["Revision Date"], "$.webBlocks['Project Info']['Revision Date']", normalizeDate)
        }
      },
      assetObservations,
      qualityIssues: reconciliation.issues,
      completeness: buildCompleteness(profile, payload)
    };
  }

  // SHA-256 fallback is kept dependency-free for browsers without SubtleCrypto.
  function sha256Fallback(bytes) {
    const k = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const bitLength = bytes.length * 8;
    const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
    view.setUint32(paddedLength - 4, bitLength >>> 0, false);
    const w = new Uint32Array(64);
    const rotr = (value, shift) => (value >>> shift) | (value << (32 - shift));
    for (let offset = 0; offset < paddedLength; offset += 64) {
      for (let index = 0; index < 16; index += 1) w[index] = view.getUint32(offset + index * 4, false);
      for (let index = 16; index < 64; index += 1) {
        const s0 = rotr(w[index - 15], 7) ^ rotr(w[index - 15], 18) ^ (w[index - 15] >>> 3);
        const s1 = rotr(w[index - 2], 17) ^ rotr(w[index - 2], 19) ^ (w[index - 2] >>> 10);
        w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let index = 0; index < 64; index += 1) {
        const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const temp1 = (hh + s1 + ch + k[index] + w[index]) >>> 0;
        const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const temp2 = (s0 + maj) >>> 0;
        hh = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0;
      h[1] = (h[1] + b) >>> 0;
      h[2] = (h[2] + c) >>> 0;
      h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0;
      h[5] = (h[5] + f) >>> 0;
      h[6] = (h[6] + g) >>> 0;
      h[7] = (h[7] + hh) >>> 0;
    }
    return h.map((value) => value.toString(16).padStart(8, "0")).join("");
  }

  async function sha256Text(text) {
    const bytes = new TextEncoder().encode(String(text));
    if (global.crypto && global.crypto.subtle && typeof global.crypto.subtle.digest === "function") {
      const digest = await global.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return sha256Fallback(bytes);
  }

  // ---------------------------------------------------------------------------
  // Project identity, asset matching and deterministic diff
  // ---------------------------------------------------------------------------

  function projectDisplayName(normalized, fallback) {
    return normalizeDisplay(normalized.projectObservation.fields.projectName.rawValue) || fallback || "Безымянный проект";
  }

  function stableProjectReference(payload) {
    if (payload.projectId !== null && payload.projectId !== undefined && String(payload.projectId).trim()) {
      return { kind: "project_id", valueNormalized: normalizeText(payload.projectId) };
    }
    if (payload.roomId !== null && payload.roomId !== undefined && String(payload.roomId).trim()) {
      return { kind: "room_id", valueNormalized: normalizeText(payload.roomId) };
    }
    return null;
  }

  function ensureStableProject(state, payload, normalized, actorId) {
    const reference = stableProjectReference(payload);
    if (!reference) return { state, projectId: null };
    const existing = state.projects.find((project) => (project.references || []).some((item) =>
      item.sourceSystem === String(payload.sourceSystem || "local-file-import")
      && item.kind === reference.kind
      && item.valueNormalized === reference.valueNormalized
    ));
    if (existing) return { state, projectId: existing.id };
    const next = deepClone(state);
    const project = {
      id: createId("project"),
      displayName: projectDisplayName(normalized, String(payload.projectId || payload.roomId)),
      status: "active",
      references: [{
        sourceSystem: String(payload.sourceSystem || "local-file-import"),
        kind: reference.kind,
        valueNormalized: reference.valueNormalized,
        verified: true,
        createdById: actorId || "system",
        createdAt: nowIso()
      }],
      createdAt: nowIso()
    };
    next.projects.push(project);
    return { state: next, projectId: project.id };
  }

  function identifiersMatch(left, right, strengths) {
    const allowed = strengths || ["stable"];
    return left.some((a) => allowed.includes(a.strength) && right.some((b) => a.kind === b.kind && a.valueNormalized === b.valueNormalized));
  }

  function observationLabel(observation) {
    return normalizeDisplay(observation.fields.name?.rawValue)
      || normalizeDisplay(observation.fields.hostname?.rawValue)
      || normalizeDisplay(observation.fields.model?.rawValue)
      || observation.kind;
  }

  function createAsset(projectId, observation, snapshotId) {
    return {
      id: createId("asset"),
      projectId,
      kind: observation.kind,
      displayName: observationLabel(observation),
      status: "active",
      identifiers: observation.identifiers.map((item) => Object.assign({}, item, {
        validFromSnapshotId: snapshotId,
        validToSnapshotId: null
      })),
      createdAt: nowIso(),
      retiredAt: null,
      replacementAssetId: null
    };
  }

  function matchAndApplyObservations(state, snapshot) {
    const next = deepClone(state);
    const observations = deepClone(snapshot.assetObservations);
    const projectAssets = next.assets.filter((asset) => asset.projectId === snapshot.projectId);

    observations.forEach((observation) => {
      const sameKind = projectAssets.filter((asset) => asset.kind === observation.kind);
      const exact = sameKind.filter((asset) => identifiersMatch(observation.identifiers, asset.identifiers, ["stable"]));
      const strong = sameKind.filter((asset) => identifiersMatch(observation.identifiers, asset.identifiers, ["strong"]));
      let selected = null;
      let confidence = "unmatched";
      let candidates = [];

      if (exact.length === 1) {
        selected = exact[0];
        confidence = "exact";
      } else if (exact.length > 1) {
        confidence = "ambiguous";
        candidates = exact;
      } else if (strong.length === 1) {
        selected = strong[0];
        confidence = "high";
      } else if (strong.length > 1) {
        confidence = "ambiguous";
        candidates = strong;
      } else if (!observation.identifiers.some((identifier) => identifier.strength === "stable")) {
        const scored = sameKind.map((asset) => {
          const previous = [...next.snapshots]
            .filter((item) => item.projectId === snapshot.projectId && item.assetObservations)
            .flatMap((item) => item.assetObservations)
            .filter((item) => item.assetId === asset.id)
            .at(-1);
          let score = 0;
          const signals = [];
          if (previous) {
            ["model", "partNumber", "name", "ipAddress"].forEach((field) => {
              const left = observation.fields[field]?.normalizedValue;
              const right = previous.fields[field]?.normalizedValue;
              if (left !== null && left !== undefined && left === right) {
                score += field === "model" || field === "partNumber" ? 2 : 1;
                signals.push(field);
              }
            });
          }
          return { asset, score, signals };
        }).filter((item) => item.score >= 3).sort((a, b) => b.score - a.score);
        if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) {
          selected = scored[0].asset;
          confidence = "probable";
        } else if (scored.length) {
          confidence = "ambiguous";
          candidates = scored.filter((item) => item.score === scored[0].score).map((item) => item.asset);
        }
      }

      if (!selected && confidence !== "ambiguous") {
        selected = createAsset(snapshot.projectId, observation, snapshot.id);
        next.assets.push(selected);
        projectAssets.push(selected);
      }

      observation.assetId = selected ? selected.id : null;
      observation.matchConfidence = confidence === "unmatched" && selected ? "unmatched" : confidence;
      observation.matchCandidates = candidates.map((asset) => ({
        candidateAssetId: asset.id,
        confidence: "ambiguous",
        matchedSignals: observation.identifiers.flatMap((identifier) => asset.identifiers
          .filter((candidateIdentifier) => candidateIdentifier.kind === identifier.kind && candidateIdentifier.valueNormalized === identifier.valueNormalized)
          .map(() => `${identifier.kind}:${identifier.valueNormalized}`)),
        conflictingSignals: observation.identifiers.flatMap((identifier) => asset.identifiers
          .filter((candidateIdentifier) => candidateIdentifier.kind === identifier.kind && candidateIdentifier.valueNormalized !== identifier.valueNormalized)
          .map((candidateIdentifier) => `${identifier.kind}:${identifier.valueNormalized}≠${candidateIdentifier.valueNormalized}`)),
        rulesetVersion: snapshot.normalizerVersion,
        status: "proposed"
      }));

      if (selected) {
        const asset = next.assets.find((item) => item.id === selected.id);
        asset.displayName = observationLabel(observation);
        observation.identifiers.forEach((identifier) => {
          if (!asset.identifiers.some((item) => item.kind === identifier.kind && item.valueNormalized === identifier.valueNormalized)) {
            asset.identifiers.push(Object.assign({}, identifier, { validFromSnapshotId: snapshot.id, validToSnapshotId: null }));
          }
        });
      }
    });

    return { state: next, observations };
  }

  function compareTimelineSnapshots(left, right) {
    const capturedDifference = new Date(left.capturedAt).getTime() - new Date(right.capturedAt).getTime();
    if (capturedDifference) return capturedDifference;
    const hashDifference = String(left.rawSha256 || "").localeCompare(String(right.rawSha256 || ""));
    if (hashDifference) return hashDifference;
    return String(left.id).localeCompare(String(right.id));
  }

  function getProjectTimeline(state, projectId) {
    return state.snapshots
      .filter((item) => item.projectId === projectId && ["processed", "partial"].includes(item.status) && item.capturedAt && !item.expiredAt)
      .sort(compareTimelineSnapshots);
  }

  function getProjectCurrentSnapshot(state, projectId) {
    return getProjectTimeline(state, projectId).at(-1) || null;
  }

  function getProjectCurrentState(state, projectId) {
    const project = state.projects.find((item) => item.id === projectId) || null;
    const snapshot = getProjectCurrentSnapshot(state, projectId);
    const observations = new Map((snapshot?.assetObservations || []).filter((item) => item.assetId).map((item) => [item.assetId, item]));
    const assets = state.assets
      .filter((item) => item.projectId === projectId)
      .map((asset) => ({ asset, observation: observations.get(asset.id) || null }));
    return { project, snapshot, projectObservation: snapshot?.projectObservation || null, assets };
  }

  function getActivePreviousChangeSets(state, projectId) {
    const timeline = getProjectTimeline(state, projectId);
    const positions = new Map(timeline.map((snapshot, index) => [snapshot.id, index]));
    return state.changeSets
      .filter((item) => item.projectId === projectId && item.mode === "previous" && item.status === "active")
      .sort((left, right) => (positions.get(left.fromSnapshotId) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right.fromSnapshotId) ?? Number.MAX_SAFE_INTEGER));
  }

  const FIELD_EVENT_RULES = Object.freeze({
    projectName: { eventType: "project_name_changed", severity: "medium", category: "configuration" },
    projectVersion: { eventType: "project_version_changed", severity: "medium", category: "configuration" },
    name: { eventType: "name_changed", severity: "medium", category: "configuration" },
    ipAddress: { eventType: "ip_changed", severity: "medium", category: "configuration" },
    macAddress: { eventType: "mac_changed", severity: "high", category: "configuration" },
    hostname: { eventType: "hostname_changed", severity: "medium", category: "configuration" },
    subnet: { eventType: "network_setting_changed", severity: "medium", category: "configuration" },
    gateway: { eventType: "network_setting_changed", severity: "medium", category: "configuration" },
    dnsServers: { eventType: "network_setting_changed", severity: "medium", category: "configuration" },
    dhcp: { eventType: "network_setting_changed", severity: "medium", category: "configuration" },
    model: { eventType: "model_or_part_changed", severity: "high", category: "configuration" },
    partNumber: { eventType: "model_or_part_changed", severity: "high", category: "configuration" },
    firmwareVersion: { eventType: "firmware_changed", severity: "medium", category: "configuration" },
    guiUuid: { eventType: "gui_identity_changed", severity: "high", category: "configuration" }
  });

  function safeEvidence(field, snapshotId) {
    if (!field) return [];
    return [{
      snapshotId,
      sourcePath: field.sourcePath,
      rawValue: field.rawValue,
      normalizedValue: field.normalizedValue,
      quality: field.quality
    }];
  }

  function createChangeEvent(input) {
    return {
      id: createId("event"),
      changeSetId: input.changeSetId,
      projectId: input.projectId,
      entityType: input.entityType,
      entityId: input.entityId || null,
      entityLabel: input.entityLabel || input.entityType,
      eventType: input.eventType,
      category: input.category,
      severity: input.severity,
      fromSnapshotId: input.fromSnapshotId,
      toSnapshotId: input.toSnapshotId,
      field: input.field || null,
      oldValue: input.oldValue === undefined ? null : deepClone(input.oldValue),
      newValue: input.newValue === undefined ? null : deepClone(input.newValue),
      matchConfidence: input.matchConfidence || "unmatched",
      ruleId: input.ruleId,
      rulesetVersion: input.rulesetVersion,
      evidence: input.evidence || [],
      reviewStatus: "unreviewed",
      createdAt: nowIso()
    };
  }

  function compareSnapshots(state, previous, current, options) {
    const settings = Object.assign({ mode: "previous", supersedesId: null }, options || {});
    const events = [];
    const rulesetVersion = current.normalizerVersion || "1.0.0";
    const changeSetId = createId("changeset");
    const base = {
      changeSetId,
      projectId: current.projectId,
      fromSnapshotId: previous.id,
      toSnapshotId: current.id,
      rulesetVersion
    };

    Object.entries(FIELD_EVENT_RULES).forEach(([fieldName, rule]) => {
      if (!fieldName.startsWith("project")) return;
      const oldField = previous.projectObservation?.fields[fieldName];
      const newField = current.projectObservation?.fields[fieldName];
      if (!oldField || !newField || oldField.normalizedValue === newField.normalizedValue) return;
      events.push(createChangeEvent(Object.assign({}, base, rule, {
        entityType: "project",
        entityId: current.projectId,
        entityLabel: state.projects.find((item) => item.id === current.projectId)?.displayName,
        field: fieldName,
        oldValue: oldField.rawValue,
        newValue: newField.rawValue,
        matchConfidence: "exact",
        ruleId: `project.${fieldName}.changed`,
        evidence: [...safeEvidence(oldField, previous.id), ...safeEvidence(newField, current.id)]
      })));
    });

    const previousByAsset = new Map((previous.assetObservations || []).filter((item) => item.assetId).map((item) => [item.assetId, item]));
    const currentByAsset = new Map((current.assetObservations || []).filter((item) => item.assetId).map((item) => [item.assetId, item]));
    const ambiguousAssets = new Set((current.assetObservations || []).flatMap((item) => (item.matchCandidates || [])
      .filter((candidate) => candidate.status === "proposed")
      .map((candidate) => candidate.candidateAssetId)));

    for (const observation of current.assetObservations || []) {
      if (!observation.assetId) {
        events.push(createChangeEvent(Object.assign({}, base, {
          entityType: observation.kind === "controller" ? "controller" : "device",
          entityId: null,
          entityLabel: observationLabel(observation),
          eventType: "match_review_required",
          category: "data_quality",
          severity: "high",
          matchConfidence: "ambiguous",
          ruleId: "identity.match.review_required",
          evidence: observation.sourcePaths.map((sourcePath) => ({ snapshotId: current.id, sourcePath, rawValue: null, normalizedValue: null, quality: "conflict" }))
        })));
        continue;
      }
      const oldObservation = previousByAsset.get(observation.assetId);
      if (!oldObservation) {
        events.push(createChangeEvent(Object.assign({}, base, {
          entityType: observation.kind === "controller" ? "controller" : "device",
          entityId: observation.assetId,
          entityLabel: observationLabel(observation),
          eventType: "device_added",
          category: "configuration",
          severity: "medium",
          matchConfidence: observation.matchConfidence,
          ruleId: "asset.lifecycle.added",
          evidence: observation.sourcePaths.map((sourcePath) => ({ snapshotId: current.id, sourcePath, rawValue: null, normalizedValue: null, quality: "valid" }))
        })));
        continue;
      }
      Object.entries(FIELD_EVENT_RULES).forEach(([fieldName, rule]) => {
        if (fieldName.startsWith("project")) return;
        const oldField = oldObservation.fields[fieldName];
        const newField = observation.fields[fieldName];
        if (!oldField || !newField || JSON.stringify(oldField.normalizedValue) === JSON.stringify(newField.normalizedValue)) return;
        events.push(createChangeEvent(Object.assign({}, base, rule, {
          entityType: observation.kind === "controller" ? "controller" : "device",
          entityId: observation.assetId,
          entityLabel: observationLabel(observation),
          field: fieldName,
          oldValue: oldField.rawValue,
          newValue: newField.rawValue,
          matchConfidence: observation.matchConfidence,
          ruleId: `${observation.kind}.${fieldName}.changed`,
          evidence: [...safeEvidence(oldField, previous.id), ...safeEvidence(newField, current.id)]
        })));
      });
    }

    for (const [assetId, oldObservation] of previousByAsset.entries()) {
      if (currentByAsset.has(assetId) || ambiguousAssets.has(assetId)) continue;
      const section = oldObservation.kind === "controller" ? "controller" : "devices";
      const complete = current.completeness?.[section]?.status === "complete";
      const eventType = complete ? "confirmed_removal" : "possible_removal";
      events.push(createChangeEvent(Object.assign({}, base, {
        entityType: oldObservation.kind === "controller" ? "controller" : "device",
        entityId: assetId,
        entityLabel: observationLabel(oldObservation),
        eventType,
        category: complete ? "configuration" : "data_quality",
        severity: complete ? "high" : "medium",
        matchConfidence: oldObservation.matchConfidence,
        ruleId: complete ? "asset.lifecycle.confirmed_removal" : "asset.lifecycle.possible_removal",
        evidence: oldObservation.sourcePaths.map((sourcePath) => ({ snapshotId: previous.id, sourcePath, rawValue: null, normalizedValue: null, quality: complete ? "valid" : "missing" }))
      })));
    }

    return {
      id: changeSetId,
      projectId: current.projectId,
      fromSnapshotId: previous.id,
      toSnapshotId: current.id,
      mode: settings.mode,
      rulesetVersion,
      status: "active",
      events,
      computedAt: nowIso(),
      supersedesId: settings.supersedesId
    };
  }

  function refreshProjectAssetLifecycle(state, projectId) {
    const current = getProjectCurrentSnapshot(state, projectId);
    if (!current) return state;
    const observedIds = new Set((current.assetObservations || []).map((item) => item.assetId).filter(Boolean));
    const unresolvedCandidateIds = new Set((current.assetObservations || []).flatMap((item) => (item.matchCandidates || [])
      .filter((candidate) => candidate.status === "proposed")
      .map((candidate) => candidate.candidateAssetId)));
    state.assets.filter((asset) => asset.projectId === projectId).forEach((asset) => {
      if (observedIds.has(asset.id)) {
        const currentObservation = (current.assetObservations || []).find((item) => item.assetId === asset.id);
        if (currentObservation) asset.displayName = observationLabel(currentObservation);
        asset.status = "active";
        asset.retiredAt = null;
        return;
      }
      if (unresolvedCandidateIds.has(asset.id)) return;
      if (asset.status === "replaced") return;
      const section = asset.kind === "controller" ? "controller" : "devices";
      if (current.completeness?.[section]?.status === "complete") {
        asset.status = "retired";
        asset.retiredAt = current.capturedAt;
      }
    });
    return state;
  }

  function reconcilePreviousComparisons(state, projectId) {
    const next = deepClone(state);
    const timeline = getProjectTimeline(next, projectId);
    const desired = new Map();
    for (let index = 1; index < timeline.length; index += 1) {
      const from = timeline[index - 1];
      const to = timeline[index];
      desired.set(`${from.id}>${to.id}`, { from, to });
    }

    const retainedKeys = new Set();
    const superseded = [];
    next.changeSets
      .filter((item) => item.projectId === projectId && item.mode === "previous" && item.status === "active")
      .forEach((changeSet) => {
        const key = `${changeSet.fromSnapshotId}>${changeSet.toSnapshotId}`;
        if (desired.has(key) && !retainedKeys.has(key)) {
          retainedKeys.add(key);
        } else {
          changeSet.status = "superseded";
          superseded.push(changeSet);
        }
      });

    const positions = new Map(timeline.map((snapshot, index) => [snapshot.id, index]));
    desired.forEach(({ from, to }, key) => {
      if (retainedKeys.has(key)) return;
      const replaced = superseded.find((old) => {
        const oldFrom = positions.get(old.fromSnapshotId);
        const oldTo = positions.get(old.toSnapshotId);
        const newFrom = positions.get(from.id);
        const newTo = positions.get(to.id);
        return oldFrom !== undefined && oldTo !== undefined && oldFrom <= newFrom && oldTo >= newTo;
      });
      next.changeSets.push(compareSnapshots(next, from, to, {
        mode: "previous",
        supersedesId: replaced?.id || null
      }));
    });
    refreshProjectAssetLifecycle(next, projectId);
    return next;
  }

  function createSelectedComparison(state, projectId, firstSnapshotId, secondSnapshotId) {
    if (firstSnapshotId === secondSnapshotId) return { ok: false, state: deepClone(state), errors: ["Выберите два разных снимка"] };
    const timeline = getProjectTimeline(state, projectId);
    const first = timeline.find((item) => item.id === firstSnapshotId);
    const second = timeline.find((item) => item.id === secondSnapshotId);
    if (!first || !second) return { ok: false, state: deepClone(state), errors: ["Оба снимка должны принадлежать выбранному Project"] };
    const [from, to] = compareTimelineSnapshots(first, second) <= 0 ? [first, second] : [second, first];
    const existing = state.changeSets.find((item) => item.projectId === projectId
      && item.mode === "selected"
      && item.status === "active"
      && item.fromSnapshotId === from.id
      && item.toSnapshotId === to.id);
    if (existing) return { ok: true, state: deepClone(state), changeSetId: existing.id, reused: true, errors: [] };
    const next = deepClone(state);
    const changeSet = compareSnapshots(next, from, to, { mode: "selected" });
    next.changeSets.push(changeSet);
    return { ok: true, state: next, changeSetId: changeSet.id, reused: false, errors: [] };
  }

  function getActiveBaselineAssignment(state, projectId) {
    return state.baselineAssignments
      .filter((item) => item.projectId === projectId && ["active", "expiration_pending"].includes(item.status))
      .sort((left, right) => {
        const timeDifference = new Date(left.assignedAt).getTime() - new Date(right.assignedAt).getTime();
        return timeDifference || String(left.id).localeCompare(String(right.id));
      })
      .at(-1) || null;
  }

  function reconcileBaselineComparison(state, projectId) {
    const next = deepClone(state);
    const assignment = getActiveBaselineAssignment(next, projectId);
    const current = getProjectCurrentSnapshot(next, projectId);
    const activeChangeSets = next.changeSets.filter((item) => item.projectId === projectId && item.mode === "baseline" && item.status === "active");
    if (!assignment || !current) {
      activeChangeSets.forEach((item) => { item.status = "superseded"; });
      return next;
    }
    const baseline = getProjectTimeline(next, projectId).find((item) => item.id === assignment.snapshotId);
    if (!baseline) return next;
    const existing = activeChangeSets.find((item) => item.fromSnapshotId === baseline.id && item.toSnapshotId === current.id);
    activeChangeSets.forEach((item) => {
      if (!existing || item.id !== existing.id) item.status = "superseded";
    });
    if (!existing) {
      const replaced = activeChangeSets.at(-1) || null;
      next.changeSets.push(compareSnapshots(next, baseline, current, {
        mode: "baseline",
        supersedesId: replaced?.id || null
      }));
    }
    return next;
  }

  function getBaselineDrift(state, projectId) {
    const assignment = getActiveBaselineAssignment(state, projectId);
    const currentSnapshot = getProjectCurrentSnapshot(state, projectId);
    const baselineSnapshot = assignment ? state.snapshots.find((item) => item.id === assignment.snapshotId) || null : null;
    const changeSet = assignment && currentSnapshot
      ? state.changeSets.find((item) => item.projectId === projectId
        && item.mode === "baseline"
        && item.status === "active"
        && item.fromSnapshotId === assignment.snapshotId
        && item.toSnapshotId === currentSnapshot.id) || null
      : null;
    return {
      assignment,
      baselineSnapshot,
      currentSnapshot,
      changeSet,
      events: changeSet?.events || []
    };
  }

  function baselineActor(state, actorId) {
    const user = state.users.find((item) => item.id === actorId);
    return { actorId: actorId || "system", actorName: user?.name || "System" };
  }

  function assignBaseline(state, projectId, snapshotId, input) {
    const options = input || {};
    if (!state.projects.some((item) => item.id === projectId)) return { ok: false, state: deepClone(state), errors: ["Project не найден"] };
    const snapshot = getProjectTimeline(state, projectId).find((item) => item.id === snapshotId);
    if (!snapshot) return { ok: false, state: deepClone(state), errors: ["Baseline должен ссылаться на обработанный snapshot выбранного Project"] };
    const active = getActiveBaselineAssignment(state, projectId);
    if (active?.snapshotId === snapshotId && active.status === "active") {
      return { ok: true, state: deepClone(state), assignmentId: active.id, reused: true, errors: [] };
    }
    if (active && !options.confirmReplace) {
      return { ok: false, state: deepClone(state), errors: ["Замена baseline требует явного подтверждения"] };
    }
    let next = deepClone(state);
    const endedAt = nowIso();
    if (active) {
      const previous = next.baselineAssignments.find((item) => item.id === active.id);
      previous.status = "replaced";
      previous.endedAt = endedAt;
      previous.endReason = normalizeDisplay(options.reason) || "Baseline replaced";
    }
    const assignment = {
      id: createId("baseline"),
      projectId,
      snapshotId,
      assignedById: options.actorId || "system",
      assignedAt: nowIso(),
      status: "active",
      endedAt: null,
      reason: normalizeDisplay(options.reason) || "Baseline assigned",
      endReason: null,
      supersedesId: active?.id || null
    };
    next.baselineAssignments.push(assignment);
    next = reconcileBaselineComparison(next, projectId);
    next = appendHistory(next, Object.assign(baselineActor(next, options.actorId), {
      action: active ? "Baseline проекта заменён" : "Baseline проекта назначен",
      entityType: "baseline",
      entityId: assignment.id,
      projectId,
      details: `${snapshot.filename}: ${assignment.reason}`
    }));
    return { ok: true, state: next, assignmentId: assignment.id, reused: false, errors: [] };
  }

  function markBaselineExpirationPending(state, projectId, input) {
    const options = input || {};
    const active = getActiveBaselineAssignment(state, projectId);
    if (!active) return { ok: false, state: deepClone(state), errors: ["Активный baseline не найден"] };
    if (active.status === "expiration_pending") return { ok: true, state: deepClone(state), assignmentId: active.id, reused: true, errors: [] };
    let next = deepClone(state);
    const assignment = next.baselineAssignments.find((item) => item.id === active.id);
    assignment.status = "expiration_pending";
    assignment.expirationReason = normalizeDisplay(options.reason) || "Snapshot reached retention boundary";
    next = appendHistory(next, Object.assign(baselineActor(next, options.actorId), {
      action: "Baseline ожидает решения перед retention",
      entityType: "baseline",
      entityId: assignment.id,
      projectId,
      details: assignment.expirationReason
    }));
    return { ok: true, state: next, assignmentId: assignment.id, reused: false, errors: [] };
  }

  function endBaseline(state, projectId, input) {
    const options = input || {};
    const active = getActiveBaselineAssignment(state, projectId);
    if (!active) return { ok: false, state: deepClone(state), errors: ["Активный baseline не найден"] };
    if (active.status === "expiration_pending" && !options.confirmExpiration) {
      return { ok: false, state: deepClone(state), errors: ["Завершение expiration-pending baseline требует явного подтверждения"] };
    }
    let next = deepClone(state);
    const assignment = next.baselineAssignments.find((item) => item.id === active.id);
    assignment.status = "ended";
    assignment.endedAt = nowIso();
    assignment.endReason = normalizeDisplay(options.reason) || "Baseline ended";
    next.changeSets
      .filter((item) => item.projectId === projectId && item.mode === "baseline" && item.status === "active")
      .forEach((item) => { item.status = "superseded"; });
    next = appendHistory(next, Object.assign(baselineActor(next, options.actorId), {
      action: "Baseline проекта завершён",
      entityType: "baseline",
      entityId: assignment.id,
      projectId,
      details: assignment.endReason
    }));
    return { ok: true, state: next, assignmentId: assignment.id, errors: [] };
  }

  // ---------------------------------------------------------------------------
  // Retention (startup/manual only; never an equipment change)
  // ---------------------------------------------------------------------------

  function applyRetention(state, input) {
    const options = input || {};
    const validation = validateState(state);
    if (!validation.ok) {
      return { ok: false, state: deepClone(state), changed: false, expiredCount: 0, pendingBaselineCount: 0, errors: validation.errors };
    }

    const appliedAt = options.now ? new Date(options.now) : new Date();
    if (Number.isNaN(appliedAt.getTime())) {
      return { ok: false, state: deepClone(state), changed: false, expiredCount: 0, pendingBaselineCount: 0, errors: ["Retention now должен быть корректной date-time"] };
    }
    const policyDays = state.settings.retentionDays;
    const cutoffTime = appliedAt.getTime() - policyDays * 24 * 60 * 60 * 1000;
    const candidates = state.snapshots.filter((snapshot) => {
      const sourceTime = new Date(snapshot.capturedAt || snapshot.uploadedAt || "").getTime();
      return Number.isFinite(sourceTime) && sourceTime < cutoffTime;
    });
    if (!candidates.length) {
      return { ok: true, state: deepClone(state), changed: false, expiredCount: 0, pendingBaselineCount: 0, errors: [] };
    }

    let next = deepClone(state);
    let pendingBaselineCount = 0;
    const protectedSnapshotIds = new Set();
    candidates.forEach((snapshot) => {
      const assignment = next.baselineAssignments.find((item) => item.snapshotId === snapshot.id && ["active", "expiration_pending"].includes(item.status));
      if (!assignment) return;
      protectedSnapshotIds.add(snapshot.id);
      if (assignment.status === "active") {
        const pending = markBaselineExpirationPending(next, assignment.projectId, {
          actorId: options.actorId || "system",
          reason: options.reason || `Snapshot старше retention ${policyDays} дней`
        });
        if (pending.ok && !pending.reused) {
          next = pending.state;
          pendingBaselineCount += 1;
        }
      }
    });

    const expiredSnapshots = candidates.filter((snapshot) => !protectedSnapshotIds.has(snapshot.id));
    if (!expiredSnapshots.length) {
      return { ok: true, state: next, changed: pendingBaselineCount > 0, expiredCount: 0, pendingBaselineCount, errors: [] };
    }

    const expiredIds = new Set(expiredSnapshots.map((snapshot) => snapshot.id));
    const removedChangeSets = next.changeSets.filter((item) => expiredIds.has(item.fromSnapshotId) || expiredIds.has(item.toSnapshotId));
    const removedChangeSetIds = new Set(removedChangeSets.map((item) => item.id));
    const removedEventIds = new Set(removedChangeSets.flatMap((item) => (item.events || []).map((event) => event.id)));
    const removedObservationIds = new Set(expiredSnapshots.flatMap((snapshot) => (snapshot.assetObservations || []).map((item) => item.id)));
    const removedReviews = next.reviewDecisions.filter((item) => removedEventIds.has(item.changeEventId));
    const removedMatches = next.matchDecisions.filter((item) => expiredIds.has(item.snapshotId) || removedObservationIds.has(item.observationId));
    const removedBaselines = next.baselineAssignments.filter((item) => expiredIds.has(item.snapshotId));
    const reason = normalizeDisplay(options.reason) || `Snapshot older than ${policyDays} days`;
    const expiredAt = appliedAt.toISOString();

    expiredSnapshots.forEach((snapshot) => {
      const relatedChangeSets = removedChangeSets.filter((item) => item.fromSnapshotId === snapshot.id || item.toSnapshotId === snapshot.id);
      const relatedEventIds = new Set(relatedChangeSets.flatMap((item) => (item.events || []).map((event) => event.id)));
      const observationIds = new Set((snapshot.assetObservations || []).map((item) => item.id));
      next.retentionAudits.push({
        id: createId("retention"),
        formerSnapshotId: snapshot.id,
        formerRawSha256: snapshot.rawSha256 || null,
        projectId: snapshot.projectId || null,
        uploadedAt: snapshot.uploadedAt || null,
        capturedAt: snapshot.capturedAt || null,
        expiredAt,
        policyDays,
        reason,
        actorId: options.actorId || "system",
        removedCounts: {
          snapshots: 1,
          observations: (snapshot.assetObservations || []).length,
          changeSets: relatedChangeSets.length,
          changeEvents: relatedChangeSets.reduce((sum, item) => sum + (item.events || []).length, 0),
          reviewDecisions: removedReviews.filter((item) => relatedEventIds.has(item.changeEventId)).length,
          matchDecisions: removedMatches.filter((item) => item.snapshotId === snapshot.id || observationIds.has(item.observationId)).length,
          baselineAssignments: removedBaselines.filter((item) => item.snapshotId === snapshot.id).length
        }
      });
    });

    next.snapshots = next.snapshots.filter((item) => !expiredIds.has(item.id));
    next.changeSets = next.changeSets.filter((item) => !removedChangeSetIds.has(item.id));
    next.reviewDecisions = next.reviewDecisions.filter((item) => !removedEventIds.has(item.changeEventId));
    next.matchDecisions = next.matchDecisions.filter((item) => !expiredIds.has(item.snapshotId) && !removedObservationIds.has(item.observationId));
    next.baselineAssignments = next.baselineAssignments.filter((item) => !expiredIds.has(item.snapshotId));
    next = appendHistory(next, {
      timestamp: expiredAt,
      actorId: options.actorId || "system",
      actorName: baselineActor(next, options.actorId).actorName,
      action: "Применён локальный retention",
      entityType: "retention",
      details: `Удалено snapshots: ${expiredSnapshots.length}; policy: ${policyDays} дней. Это очистка данных, не изменение оборудования.`
    });

    const nextValidation = validateState(next);
    if (!nextValidation.ok) {
      return { ok: false, state: deepClone(state), changed: false, expiredCount: 0, pendingBaselineCount: 0, errors: nextValidation.errors };
    }
    return { ok: true, state: next, changed: true, expiredCount: expiredSnapshots.length, pendingBaselineCount, errors: [] };
  }

  function findChangeEvent(state, eventId) {
    for (const changeSet of state.changeSets) {
      const event = (changeSet.events || []).find((item) => item.id === eventId);
      if (event) return { changeSet, event };
    }
    return null;
  }

  function getLatestReviewDecision(state, eventId) {
    return state.reviewDecisions.filter((item) => item.changeEventId === eventId).at(-1) || null;
  }

  function getChangeEvents(state, filters) {
    const criteria = filters || {};
    const fromTime = criteria.dateFrom ? new Date(criteria.dateFrom).getTime() : null;
    const toTime = criteria.dateTo ? new Date(criteria.dateTo).getTime() : null;
    const results = [];
    state.changeSets
      .filter((changeSet) => criteria.includeSuperseded || changeSet.status === "active")
      .forEach((changeSet) => {
        const toSnapshot = state.snapshots.find((item) => item.id === changeSet.toSnapshotId);
        const capturedTime = toSnapshot?.capturedAt ? new Date(toSnapshot.capturedAt).getTime() : null;
        (changeSet.events || []).forEach((event) => {
          const reviewDecision = getLatestReviewDecision(state, event.id);
          const reviewStatus = reviewDecision?.decision || event.reviewStatus || "unreviewed";
          if (criteria.projectId && event.projectId !== criteria.projectId) return;
          if (Number.isFinite(fromTime) && (!Number.isFinite(capturedTime) || capturedTime < fromTime)) return;
          if (Number.isFinite(toTime) && (!Number.isFinite(capturedTime) || capturedTime > toTime)) return;
          if (criteria.entityType && event.entityType !== criteria.entityType) return;
          if (criteria.category && event.category !== criteria.category) return;
          if (criteria.eventType && event.eventType !== criteria.eventType) return;
          if (criteria.severity && event.severity !== criteria.severity) return;
          if (criteria.matchConfidence && event.matchConfidence !== criteria.matchConfidence) return;
          if (criteria.reviewStatus && reviewStatus !== criteria.reviewStatus) return;
          results.push(Object.assign({}, deepClone(event), {
            reviewStatus,
            reviewDecision: reviewDecision ? deepClone(reviewDecision) : null,
            changeSetMode: changeSet.mode,
            changeSetStatus: changeSet.status,
            comparisonCapturedAt: toSnapshot?.capturedAt || null
          }));
        });
      });
    return results.sort((left, right) => new Date(right.comparisonCapturedAt) - new Date(left.comparisonCapturedAt));
  }

  function addReviewDecision(state, eventId, input) {
    const options = input || {};
    const allowed = ["expected", "needs_attention", "false_match"];
    const located = findChangeEvent(state, eventId);
    if (!located) return { ok: false, state: deepClone(state), errors: ["Change Event не найден"] };
    if (!allowed.includes(options.decision)) return { ok: false, state: deepClone(state), errors: ["Review decision не поддерживается"] };
    const comment = normalizeDisplay(options.comment);
    if (!comment) return { ok: false, state: deepClone(state), errors: ["Комментарий обязателен"] };
    let next = deepClone(state);
    const previous = getLatestReviewDecision(next, eventId);
    const decision = {
      id: createId("review"),
      changeEventId: eventId,
      decision: options.decision,
      comment,
      userId: options.actorId || "system",
      createdAt: nowIso(),
      supersedesId: previous?.id || null
    };
    next.reviewDecisions.push(decision);
    next = appendHistory(next, Object.assign(baselineActor(next, options.actorId), {
      action: "Сохранено review-решение",
      entityType: "change_event",
      entityId: eventId,
      projectId: located.event.projectId,
      details: `${options.decision}: ${comment}`
    }));
    return { ok: true, state: next, decisionId: decision.id, errors: [] };
  }

  function getUnresolvedMatches(state, projectId) {
    const results = [];
    state.snapshots
      .filter((snapshot) => ["processed", "partial"].includes(snapshot.status) && (!projectId || snapshot.projectId === projectId))
      .forEach((snapshot) => {
        (snapshot.assetObservations || []).filter((observation) => !observation.assetId).forEach((observation) => {
          results.push({
            projectId: snapshot.projectId,
            snapshotId: snapshot.id,
            snapshot,
            observation,
            latestDecision: state.matchDecisions.filter((item) => item.observationId === observation.id).at(-1) || null
          });
        });
      });
    return results.sort((left, right) => compareTimelineSnapshots(left.snapshot, right.snapshot));
  }

  function recalculateProjectComparisons(state, projectId) {
    const next = deepClone(state);
    const timeline = getProjectTimeline(next, projectId);
    const oldPrevious = next.changeSets.filter((item) => item.projectId === projectId && item.mode === "previous" && item.status === "active");
    oldPrevious.forEach((item) => { item.status = "superseded"; });
    for (let index = 1; index < timeline.length; index += 1) {
      const from = timeline[index - 1];
      const to = timeline[index];
      const replaced = oldPrevious.find((item) => item.fromSnapshotId === from.id && item.toSnapshotId === to.id);
      next.changeSets.push(compareSnapshots(next, from, to, { mode: "previous", supersedesId: replaced?.id || null }));
    }
    const oldSelected = next.changeSets.filter((item) => item.projectId === projectId && item.mode === "selected" && item.status === "active");
    oldSelected.forEach((item) => {
      item.status = "superseded";
      const from = timeline.find((snapshot) => snapshot.id === item.fromSnapshotId);
      const to = timeline.find((snapshot) => snapshot.id === item.toSnapshotId);
      if (from && to) next.changeSets.push(compareSnapshots(next, from, to, { mode: "selected", supersedesId: item.id }));
    });
    const oldBaseline = next.changeSets.filter((item) => item.projectId === projectId && item.mode === "baseline" && item.status === "active");
    oldBaseline.forEach((item) => { item.status = "superseded"; });
    const assignment = getActiveBaselineAssignment(next, projectId);
    const current = getProjectCurrentSnapshot(next, projectId);
    const baseline = assignment ? timeline.find((snapshot) => snapshot.id === assignment.snapshotId) : null;
    if (baseline && current) next.changeSets.push(compareSnapshots(next, baseline, current, { mode: "baseline", supersedesId: oldBaseline.at(-1)?.id || null }));
    refreshProjectAssetLifecycle(next, projectId);
    return next;
  }

  function resolveMatchDecision(state, snapshotId, observationId, input) {
    const options = input || {};
    const allowed = ["choose", "create_new", "replace", "unmatched"];
    if (!allowed.includes(options.action)) return { ok: false, state: deepClone(state), errors: ["Match action не поддерживается"] };
    let next = deepClone(state);
    const snapshot = next.snapshots.find((item) => item.id === snapshotId);
    const observation = snapshot?.assetObservations?.find((item) => item.id === observationId);
    if (!snapshot || !observation || !snapshot.projectId) return { ok: false, state: deepClone(state), errors: ["Наблюдение не найдено"] };
    let selectedAsset = options.selectedAssetId ? next.assets.find((item) => item.id === options.selectedAssetId && item.projectId === snapshot.projectId) : null;
    if (["choose", "replace"].includes(options.action) && !selectedAsset) return { ok: false, state: deepClone(state), errors: ["Выберите Asset того же Project"] };
    let resolvedAsset = null;
    if (options.action === "choose") {
      resolvedAsset = selectedAsset;
      observation.assetId = selectedAsset.id;
      observation.matchConfidence = "exact";
      observation.matchCandidates.forEach((candidate) => { candidate.status = candidate.candidateAssetId === selectedAsset.id ? "selected" : "rejected"; });
      observation.identifiers.forEach((identifier) => {
        if (!selectedAsset.identifiers.some((item) => item.kind === identifier.kind && item.valueNormalized === identifier.valueNormalized)) {
          selectedAsset.identifiers.push(Object.assign({}, identifier, { validFromSnapshotId: snapshot.id, validToSnapshotId: null }));
        }
      });
    } else if (options.action === "create_new") {
      resolvedAsset = createAsset(snapshot.projectId, observation, snapshot.id);
      next.assets.push(resolvedAsset);
      observation.assetId = resolvedAsset.id;
      observation.matchConfidence = "exact";
      observation.matchCandidates.forEach((candidate) => { candidate.status = "rejected"; });
    } else if (options.action === "replace") {
      resolvedAsset = createAsset(snapshot.projectId, observation, snapshot.id);
      next.assets.push(resolvedAsset);
      selectedAsset.status = "replaced";
      selectedAsset.replacementAssetId = resolvedAsset.id;
      observation.assetId = resolvedAsset.id;
      observation.matchConfidence = "exact";
      observation.matchCandidates.forEach((candidate) => { candidate.status = candidate.candidateAssetId === selectedAsset.id ? "selected" : "rejected"; });
    } else {
      observation.assetId = null;
      observation.matchConfidence = "unmatched";
      observation.matchCandidates.forEach((candidate) => { candidate.status = "proposed"; });
    }
    const previous = next.matchDecisions.filter((item) => item.observationId === observationId).at(-1) || null;
    const decision = {
      id: createId("match-decision"),
      projectId: snapshot.projectId,
      snapshotId,
      observationId,
      action: options.action,
      selectedAssetId: selectedAsset?.id || null,
      resolvedAssetId: resolvedAsset?.id || null,
      confidence: observation.matchConfidence,
      actorId: options.actorId || "system",
      reason: normalizeDisplay(options.reason) || "Manual match decision",
      createdAt: nowIso(),
      supersedesId: previous?.id || null
    };
    next.matchDecisions.push(decision);
    next = recalculateProjectComparisons(next, snapshot.projectId);
    next = appendHistory(next, Object.assign(baselineActor(next, options.actorId), {
      action: "Сохранено решение сопоставления",
      entityType: "asset_observation",
      entityId: observationId,
      projectId: snapshot.projectId,
      details: `${options.action}: ${decision.reason}`
    }));
    return { ok: true, state: next, decisionId: decision.id, resolvedAssetId: resolvedAsset?.id || null, errors: [] };
  }

  function finalizeSnapshotForProject(state, snapshot, projectId) {
    let next = deepClone(state);
    const current = deepClone(snapshot);
    current.projectId = projectId;
    const matched = matchAndApplyObservations(next, current);
    next = matched.state;
    current.assetObservations = matched.observations;
    current.status = current.schemaProfile === "extron-legacy-v1" || current.qualityIssues.some((issue) => issue.severity === "critical") ? "partial" : "processed";
    const existingIndex = next.snapshots.findIndex((item) => item.id === current.id);
    if (existingIndex >= 0) next.snapshots[existingIndex] = current;
    else next.snapshots.push(current);
    next = reconcilePreviousComparisons(next, projectId);
    next = reconcileBaselineComparison(next, projectId);
    const timeline = getProjectTimeline(next, projectId);
    const currentIndex = timeline.findIndex((item) => item.id === current.id);
    const previous = currentIndex > 0 ? timeline[currentIndex - 1] : null;
    return { state: next, snapshot: current, previous };
  }

  function quotaGuardIngest(originalState, result) {
    const bytes = measureStateBytes(result.state);
    if (bytes <= DEFAULT_MAX_STATE_BYTES) return result;
    return {
      outcome: "quota_rejected",
      state: deepClone(originalState),
      snapshotId: null,
      errors: [`Новый state ${formatBytes(bytes)} превышает лимит ${formatBytes(DEFAULT_MAX_STATE_BYTES)}`]
    };
  }

  async function ingestSnapshotText(currentState, input) {
    const original = deepClone(currentState);
    let next = deepClone(currentState);
    const text = String(input && input.text || "");
    const filename = String(input && input.name || "snapshot.json");
    const uploadedById = String(input && input.uploadedById || "system");
    const rawSizeBytes = measureTextBytes(text);
    const retainedRawBytes = next.snapshots
      .filter((item) => !item.expiredAt)
      .reduce((total, item) => total + Number(item.rawSizeBytes || 0), 0);
    if (retainedRawBytes + rawSizeBytes > DEFAULT_MAX_RAW_INPUT_BYTES) {
      return {
        outcome: "quota_rejected",
        state: original,
        snapshotId: null,
        errors: [`Суммарный raw input превышает контрольный лимит ${formatBytes(DEFAULT_MAX_RAW_INPUT_BYTES)}`]
      };
    }
    const rawSha256 = await sha256Text(text);
    const duplicate = next.snapshots.find((item) => item.rawSha256 === rawSha256 && !item.expiredAt);
    if (duplicate) {
      return { outcome: "duplicate", state: next, snapshotId: duplicate.id, duplicateOf: duplicate.id, errors: [] };
    }

    let payload = null;
    let parseError = null;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      parseError = error;
    }
    const profile = parseError ? "unsupported" : detectSnapshotProfile(payload);
    const legacyMetadata = profile === "extron-legacy-v1" ? deriveLegacyMetadata(payload) : null;
    const capturedAt = profile === "extron-v1" ? normalizeDate(payload.capturedAt) : legacyMetadata && legacyMetadata.capturedAt;
    const snapshot = {
      id: createId("snapshot"),
      projectId: null,
      externalSnapshotId: profile === "extron-v1" ? payload.snapshotId : null,
      filename,
      rawText: text,
      rawSha256,
      rawSizeBytes,
      schemaProfile: profile,
      schemaVersion: profile === "extron-v1" ? payload.schemaVersion : profile === "extron-legacy-v1" ? "legacy-1" : payload && payload.schemaVersion || null,
      collectorVersion: profile === "extron-v1" ? payload.collectorVersion : null,
      sourceSystem: profile === "extron-v1" ? payload.sourceSystem : "legacy-extron-local",
      capturedAt: capturedAt || null,
      capturedAtSource: profile === "extron-v1" ? "payload" : legacyMetadata && legacyMetadata.ok ? "legacy_output_path" : "manual",
      uploadedAt: nowIso(),
      uploadedById,
      status: "received",
      completeness: {},
      projectObservation: null,
      assetObservations: [],
      qualityIssues: [],
      normalizerVersion: null,
      expiredAt: null
    };

    if (parseError) {
      snapshot.status = "failed";
      snapshot.qualityIssues.push(safeIssue("malformed_json", "data_quality", "high", "$", "Файл содержит некорректный JSON"));
      next.snapshots.push(snapshot);
      next = appendHistory(next, { actorId: uploadedById, action: "Отклонён malformed JSON snapshot", entityType: "snapshot", entityId: snapshot.id, details: filename });
      return quotaGuardIngest(original, { outcome: "failed", state: next, snapshotId: snapshot.id, errors: ["Некорректный JSON"] });
    }

    if (profile === "unsupported") {
      snapshot.status = "unsupported";
      snapshot.qualityIssues.push(safeIssue("unsupported_schema", "data_quality", "high", "$.schemaVersion", "Формат или версия snapshot не поддерживается"));
      next.snapshots.push(snapshot);
      next = appendHistory(next, { actorId: uploadedById, action: "Сохранён unsupported snapshot", entityType: "snapshot", entityId: snapshot.id, details: filename });
      return quotaGuardIngest(original, { outcome: "unsupported", state: next, snapshotId: snapshot.id, errors: [] });
    }

    if (profile === "extron-v1") {
      const validation = validateExtronV1(payload);
      if (!validation.ok) {
        snapshot.status = "failed";
        snapshot.qualityIssues.push(...validation.errors.map((error) => safeIssue("schema_validation_failed", "data_quality", "high", "$", error)));
        next.snapshots.push(snapshot);
        next = appendHistory(next, { actorId: uploadedById, action: "Отклонён невалидный Extron v1 snapshot", entityType: "snapshot", entityId: snapshot.id, details: filename });
        return quotaGuardIngest(original, { outcome: "failed", state: next, snapshotId: snapshot.id, errors: validation.errors });
      }
    }

    if (profile === "extron-legacy-v1" && !legacyMetadata.ok) {
      snapshot.qualityIssues.push(safeIssue("timestamp_ambiguous", "data_quality", "high", "$.outputFile", "capturedAt требует ручного ввода"));
    }
    if (profile === "extron-legacy-v1") {
      snapshot.qualityIssues.push(safeIssue("collector_version_missing", "data_quality", "informational", "$", "Legacy snapshot не содержит collectorVersion"));
    }
    snapshot.qualityIssues.push(...detectSecrets(payload));
    const normalized = normalizeSnapshot(payload, profile);
    snapshot.projectObservation = normalized.projectObservation;
    snapshot.assetObservations = normalized.assetObservations;
    snapshot.qualityIssues.push(...normalized.qualityIssues);
    snapshot.completeness = normalized.completeness;
    snapshot.normalizerVersion = next.settings.normalizerVersion;

    const resolved = ensureStableProject(next, payload, normalized, uploadedById);
    next = resolved.state;
    if (!resolved.projectId || !snapshot.capturedAt) {
      snapshot.status = "needs_project_mapping";
      next.snapshots.push(snapshot);
      next = appendHistory(next, { actorId: uploadedById, action: "Snapshot ожидает ручной связи", entityType: "snapshot", entityId: snapshot.id, details: filename });
      return quotaGuardIngest(original, { outcome: "needs_mapping", state: next, snapshotId: snapshot.id, errors: [] });
    }

    const finalized = finalizeSnapshotForProject(next, snapshot, resolved.projectId);
    next = appendHistory(finalized.state, {
      actorId: uploadedById,
      action: "Обработан snapshot",
      entityType: "snapshot",
      entityId: snapshot.id,
      projectId: resolved.projectId,
      details: `${filename}: ${finalized.snapshot.status}`
    });
    return quotaGuardIngest(original, {
      outcome: finalized.snapshot.status,
      state: next,
      snapshotId: snapshot.id,
      changeSetId: next.changeSets.at(-1)?.toSnapshotId === snapshot.id ? next.changeSets.at(-1).id : null,
      errors: []
    });
  }

  function mapSnapshotToProject(currentState, snapshotId, input) {
    let next = deepClone(currentState);
    const index = next.snapshots.findIndex((item) => item.id === snapshotId);
    if (index < 0) return { ok: false, errors: ["Snapshot не найден"] };
    const snapshot = next.snapshots[index];
    if (snapshot.status !== "needs_project_mapping") return { ok: false, errors: ["Snapshot не ожидает mapping"] };
    if (!snapshot.capturedAt) return { ok: false, errors: ["Сначала требуется корректный capturedAt"] };

    let project = input.existingProjectId ? next.projects.find((item) => item.id === input.existingProjectId) : null;
    if (input.existingProjectId && !project) return { ok: false, errors: ["Выбранный Project не найден"] };
    if (!project) {
      const displayName = normalizeDisplay(input.displayName);
      if (!displayName) return { ok: false, errors: ["Название нового Project обязательно"] };
      project = { id: createId("project"), displayName, status: "active", references: [], createdAt: nowIso() };
      next.projects.push(project);
    }
    if (next.projects.some((item) => item.id !== project.id && (item.references || []).some((reference) => reference.kind === "manual" && reference.valueNormalized === snapshot.rawSha256))) {
      return { ok: false, errors: ["Manual reference конфликтует с другим Project"] };
    }
    project.references = project.references || [];
    project.references.push({
      sourceSystem: snapshot.sourceSystem,
      kind: "manual",
      valueNormalized: snapshot.rawSha256,
      verified: true,
      createdById: input.actorId || "system",
      createdAt: nowIso()
    });
    const finalized = finalizeSnapshotForProject(next, snapshot, project.id);
    next = appendHistory(finalized.state, {
      actorId: input.actorId || "system",
      action: "Snapshot вручную связан с Project",
      entityType: "snapshot",
      entityId: snapshot.id,
      projectId: project.id,
      details: project.displayName
    });
    return { ok: true, state: next, projectId: project.id, snapshotId: snapshot.id };
  }

  function resolveLaunchMode({ protocol, fileMarker, secureMarker } = {}) {
    if (protocol === "file:" && fileMarker) return Object.freeze({ kind: "file", persistent: false, credentialsAvailable: false });
    if ((protocol === "http:" || protocol === "https:") && secureMarker) return Object.freeze({ kind: "local", persistent: false, credentialsAvailable: true });
    return null;
  }

  function formatPollingRunFolderName(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("Некорректное время запуска");
    const pad = (part) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  }

  function chooseUniquePollingRunFolderName(existingNames, startedAt) {
    const occupied = new Set(Array.from(existingNames || [], (item) => String(item)));
    const base = new Date(startedAt);
    if (Number.isNaN(base.getTime())) throw new Error("Некорректное время запуска");
    for (let offset = 0; offset < 86400; offset += 1) {
      const candidate = formatPollingRunFolderName(new Date(base.getTime() + offset * 1000));
      if (!occupied.has(candidate)) return candidate;
    }
    throw new Error("Не удалось подобрать имя папки запуска");
  }

  function createVolatileStorage(initialValues) {
    const values = new Map(Object.entries(initialValues || {}).map(([key, value]) => [String(key), String(value)]));
    return Object.freeze({
      getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
      setItem(key, value) { values.set(String(key), String(value)); },
      removeItem(key) { values.delete(String(key)); }
    });
  }

  function createNavigationState(input = {}) {
    const requestedRoute = typeof input.route === "string" ? input.route : "dashboard";
    const route = MODULE_CATALOG.some((item) => item.route === requestedRoute) ? requestedRoute : "dashboard";
    return Object.freeze({
      route,
      equipmentExpanded: input.equipmentExpanded === true
    });
  }

  function reduceNavigationState(current, action = {}) {
    const state = createNavigationState(current);
    if (action.type === "toggle_equipment") {
      return createNavigationState({ route: state.route, equipmentExpanded: !state.equipmentExpanded });
    }
    if (action.type === "navigate") {
      return createNavigationState({ route: action.route, equipmentExpanded: state.equipmentExpanded });
    }
    return state;
  }

  function resolveNavigationAction(target) {
    if (!target || typeof target.closest !== "function") return null;
    if (target.closest("[data-equipment-toggle]")) return Object.freeze({ type: "toggle_equipment" });
    const routeButton = target.closest("[data-route]");
    if (!routeButton) return null;
    return Object.freeze({ type: "navigate", route: routeButton.dataset.route });
  }

  function renderEquipmentNavigationGroup(item, navigationState) {
    const navigation = createNavigationState(navigationState);
    const childActive = item.children.some((child) => child.route === navigation.route);
    const expanded = navigation.equipmentExpanded;
    const childrenId = `nav-children-${item.route}`;
    return `<div class="nav-group"><button class="nav-button nav-parent${childActive || navigation.route === item.route ? " active" : ""}" type="button" data-equipment-toggle aria-expanded="${expanded}" aria-controls="${childrenId}"><span>${escapeHtml(item.title)}</span><span aria-hidden="true">${expanded ? "▾" : "▸"}</span></button><div id="${childrenId}" class="nav-children${expanded ? "" : " hidden"}"${expanded ? "" : " hidden"}>${item.children.map((child) => `<button class="nav-button nav-child${navigation.route === child.route ? " active" : ""}" type="button" data-route="${child.route}">${escapeHtml(child.title)}</button>`).join("")}</div></div>`;
  }

  // ---------------------------------------------------------------------------
  // Public test surface (pure foundational primitives only)
  // ---------------------------------------------------------------------------

  const api = Object.freeze({
    STORAGE_KEY,
    LEGACY_STORAGE_KEY,
    SESSION_KEY,
    BACKUP_SCHEMA,
    STATE_VERSION,
    DEFAULT_MAX_STATE_BYTES,
    DEFAULT_MAX_RAW_INPUT_BYTES,
    DASHBOARD_LIST_LIMIT,
    DEFAULT_INVENTORY_FILTERS,
    VCS_SITE_NAME_HEADERS,
    PRODUCT_CATALOG,
    MODULE_CATALOG,
    UI_TERMS,
    EQUIPMENT_CATEGORY_CATALOG,
    EQUIPMENT_CATEGORY_IDS,
    ANALYZED_PARAMETER_RULES,
    HELP_SECTIONS,
    HELP_TOPIC_BY_ROUTE,
    STATE_ARRAY_KEYS,
    ROLE_NAMES,
    POLLING_ADAPTERS,
    POLLING_ALL,
    POLLING_MISSING,
    POLLING_SELECTION_MODE_FILTERS,
    POLLING_SELECTION_MODE_SINGLE_IP,
    MANAGEMENT_TASK_DISABLE_INSECURE_SERVICES,
    SR_CANONICAL_HEADERS,
    SR_FIELD_ALIASES,
    SR_REQUIRED_HEADERS,
    appendHistory,
    addReviewDecision,
    applyRetention,
    assignBaseline,
    canPerformAction,
    clearPersistedUserSession,
    clearSessionUserId,
    createBackup,
    createDemoState,
    buildWorkspaceProjection,
    workspaceParts,
    restoreWorkspacePart,
    buildPollingPlanExport,
    selectNewPollingFiles,
    buildDeviceLogImportRows,
    prepareDeviceLogImport,
    logImportBlockReason,
    importProgressDisplay,
    createImportActivity,
    advanceImportActivity,
    importActivityView,
    buildHuaweiTeLogEventIndex,
    createHuaweiTeLogEventIndex,
    buildHuawei300LogEventIndex,
    createHuawei300LogEventIndex,
    classifyDeviceLogPrefix,
    writeDeviceLogFile,
    createPollingPlan,
    isZeroIntervalRange,
    pollingStartEnabled,
    deriveAutomaticPollingPlan,
    resolvePollingIpTarget,
    normalizePollingSelection,
    sortPollingDevices,
    createSelectedComparison,
    deepClone,
    deriveLegacyMetadata,
    derivePollingStatus,
    diagnoseSrCategoryPipeline,
    extractPollingInternalIpEvidence,
    resolvePollingInventoryMatch,
    resolvePollingResultTimestamp,
    resolvePollingObservationTimestamp,
    detectExtronJsonDeviceType,
    detectSecrets,
    detectSnapshotProfile,
    endBaseline,
    escapeHtml,
    formatBytes,
    formatCategoryLabel,
    formatPollStatus,
    formatPingStatus,
    formatCapabilityStatus,
    formatRunStatus,
    formatImportOutcome,
    filterInventoryDevices,
    buildVcsSiteNameRows,
    buildVcsSiteNameXlsx,
    buildAccountedVcsXlsx,
    buildDeviceSettingsAuditRows,
    buildDeviceSettingsAuditXlsx,
    getActivePreviousChangeSets,
    getActiveBaselineAssignment,
    getBaselineDrift,
    getInventoryAnalytics,
    getDashboardSummary,
    extractRebootObservation,
    deriveMinimumReboot,
    buildRebootAnalysisIndex,
    getRebootAnalytics,
    getHuaweiTeLogAnalytics,
    getAccountedVcsAnalytics,
    getAccountedVcsHeatmap,
    getPowerDurationAnalytics,
    getPowerHeatmapAnalytics,
    createRebootAnalyticsCache,
    buildHuawei310LogEventIndex,
    createHuawei310LogEventIndex,
    getVersionAnalysis,
    getConnectionErrorAnalysis,
    getChangeEvents,
    getLatestReviewDecision,
    getProjectCurrentSnapshot,
    getProjectCurrentState,
    getProjectTimeline,
    getUnresolvedMatches,
    groupPollingFilesByRunFolder,
    importBackupText,
    importSrRows,
    importSrWorkbook,
    parseManagementTargetRows,
    parseManagementTargetWorkbook,
    processSrImportRows,
    createSrImportContext,
    ingestPollingResultText,
    ingestPollingFolderTree,
    ingestPollingRunFiles,
    ingestSnapshotText,
    loadState,
    mapSnapshotToProject,
    markBaselineExpirationPending,
    measureStateBytes,
    migrateState,
    normalizeBoolean,
    normalizeIpv4,
    normalizeManufacturer,
    normalizedSrRow,
    normalizeMac,
    normalizeSnapshot,
    normalizeText,
    normalizeSrHeader,
    normalizeUnordered,
    parsePollingFilenameIp,
    parseRunFolderTimestamp,
    pollingPayloadProjection,
    getAnalyzedParameterRules,
    diffAnalyzedParameters,
    processPollingImportBatches,
    createPollingImportContext,
    cooperativeBrowserYield,
    mapWithBoundedConcurrency,
    rebuildDeviceChanges,
    rowsFromWorkbook,
    classifySrDevice,
    resolvePollingCapability,
    resolveLaunchMode,
    formatPollingRunFolderName,
    chooseUniquePollingRunFolderName,
    resolveMatchDecision,
    readSessionUserId,
    saveState,
    searchReferenceEntries,
    sha256Bytes,
    sha256Text,
    createVolatileStorage,
    createNavigationState,
    reduceNavigationState,
    resolveNavigationAction,
    renderEquipmentNavigationGroup,
    validateBackup,
    validateExtronV1,
    validateState,
    writeSessionUserId
  });

  global.MvpSphereSR = api;

  // ---------------------------------------------------------------------------
  // Browser application
  // ---------------------------------------------------------------------------

  if (typeof document === "undefined") return;
  const app = document.getElementById("app");
  if (!app) return;

  const launchMode = resolveLaunchMode({ protocol: global.location && global.location.protocol, fileMarker: Boolean(global.__MVP_FILE_RUNTIME__), secureMarker: Boolean(global.__MVP_SECURE_RUNTIME__) });
  if (!launchMode) {
    app.innerHTML = `<main id="main-content" class="login-shell"><section class="login-card"><div class="brand-mark">SR</div><h1>Запустите локальный инструмент</h1><p>Для автоматического опроса откройте <code>START_MVP_SPHERE_SR.py</code> установленным Python 3.11 или новее. Прямой <code>index.html</code> доступен для ручного анализа.</p></section></main>`;
    return;
  }

  const persistenceStorage = createVolatileStorage();

  const loaded = loadState(persistenceStorage);
  let state = loaded.state;
  let pollingImportContextCache = null;
  let pollingProgressRenderTimer = null;
  let pollingProgressLastRenderAt = 0;
  let logImportLastProgressAt = 0;
  let activeLogScanClient = null;
  let workspaceSaveInFlight = null;
  let workspaceSaveRequested = false;
  let workspacePartDigests = new Set();
  let recovery = loaded.recovery;
  let startupMessage = null;
  const sessionStorageRef = resolveSessionStorage();
  if (!recovery && state.currentUserId !== null) {
    const cleaned = clearPersistedUserSession(state);
    const saved = saveState(cleaned, persistenceStorage);
    state = cleaned;
    if (!saved.ok) {
      startupMessage = { text: `Предыдущая пользовательская сессия не удалена из сохранённых данных: ${saved.errors.join("; ")}`, type: "warning" };
    }
  }
  let sessionUserId = recovery ? null : "user-administrator";
  if (!recovery) {
    const retained = applyRetention(state, { actorId: "system", reason: "Startup retention" });
    if (!retained.ok) {
      startupMessage = { text: `Автоматическая проверка срока хранения не выполнена: ${retained.errors.join("; ")}`, type: "error" };
    } else if (retained.changed) {
      const saved = saveState(retained.state, persistenceStorage);
      if (saved.ok) {
        state = retained.state;
        startupMessage = {
          text: `Проверка срока хранения: удалено результатов ${retained.expiredCount}; согласованные состояния ожидают решения ${retained.pendingBaselineCount}.`,
          type: retained.pendingBaselineCount ? "warning" : "success"
        };
      } else {
        startupMessage = { text: `Проверка срока хранения выполнена, но результат не сохранён: ${saved.errors.join("; ")}`, type: "error" };
      }
    }
  }
  const initialNavigationState = createNavigationState();
  let credentialPoolSession = null;
  let managementTargetListSession = null;
  let pollingOutputRootHandle = null;
  let logOutputRootHandle = null;
  let automaticPollingMonitor = null;
  let selectedPollingRecovery = null;
  const POLLING_RECOVERY = global.MVP_POLLING_RECOVERY || (typeof module === "object" && module.exports ? require("./runtime/polling-recovery") : null);
  const ui = {
    route: initialNavigationState.route,
    message: startupMessage,
    uploadResults: [],
    uploadBusy: false,
    selectedProjectId: null,
    selectedSnapshotId: null,
    selectedChangeSetId: null,
    selectedEventId: null,
    selectedInventoryDeviceId: null,
    eventFilters: {},
    inventoryFilters: { ...DEFAULT_INVENTORY_FILTERS },
    vcsTableView: "devices",
    srImportResults: [],
    srProgress: null,
    pollingImportResults: [],
    pollingImportSummary: null,
    logImportSummary: null,
    logImportRows: [],
    teLogIndex: { events: [], coverage: null, sourceSrSha256: null },
    huawei310LogIndex: { events: [], coverage: null, sourceSrSha256: null },
    huawei300BarLogIndex: { events: [], coverage: null, sourceSrSha256: null },
    huawei300BoxLogIndex: { events: [], coverage: null, sourceSrSha256: null, validationStatus: "confirmed_user_validation" },
    logImportProgress: null,
    logImportFeedback: null,
    logCompletedCheckpoint: null,
    logImportBusy: false,
    logImportCancelRequested: false,
    logFileRegistry: [],
    workspaceStatus: null,
    workspaceSaveStatus: null,
    workspaceSaveError: null,
    workspaceSaveParts: 0,
    dbMode: false,
    dbPrepare: null,
    dbOperationalRevision: null,
    dbOperationLoading: false,
    dbOperationalError: false,
    dbSourcesVisible: false,
    dbPendingWrite: null,
    dbTargetCheck: false,
    pollingProgress: null,
    pollingCancelRequested: false,
    pollingPlanResult: null,
    zeroIntervalAcknowledged: false,
    pollingPlanSelection: { mode: POLLING_SELECTION_MODE_FILTERS, ipAddress: "", domains: [POLLING_ALL], categories: [POLLING_ALL], manufacturers: [POLLING_ALL], models: [POLLING_ALL], scheduledAt: "", intervalMinSeconds: "0", intervalMaxSeconds: "0", allowInsecureTls: true, disableInsecureManagementServices: false, collectLogs: false, collectJson: true, te20AnswerMode: "", teFamilyAnswerMode: "", huawei310AnswerMode: "", huawei300AnswerMode: "", polycomPointToPointAnswerMode: "", polycomMultipointAnswerMode: "", te20HttpMode: "", te20TelnetMode: "", te20AutoUpdateMode: "", te20SshMode: "", te20NtpEnabled: "", te20NtpMode: "", te20NtpServerMode: "", te20NtpServerValue: "", te20ShutdownRestart: "", te20SleepMinutes: "", te20ScheduledRestart: "", te20RestartTime: "" },
    credentialSummary: null,
    adminAccess: launchMode.kind === "local" ? null : { adminConfigured: false, adminUnlocked: false },
    managementTargetListSummary: null,
    pollingOutputFolderName: null,
    logOutputFolderName: null,
    automaticPolling: null,
    pollingRecoverySummary: null,
    inventoryBusy: false,
    inventoryImportKind: null,
    importActivities: {sr:null,json:null,logs:null},
    pendingRequests: {},
    exportActivity: null,
    managementTargetBusy: false,
    lastOperation: null,
    equipmentExpanded: initialNavigationState.equipmentExpanded,
    dashboardFilters: { period: "latest_run" },
    rebootFilters: { period: "all", logSilenceMinutes: "60" },
    rebootView: null,
    rebootSubmodule: "reboots",
    powerDurationBucket: "over_year",
    powerHeatmapKind: "confirmed",
    powerHeatmapCell: null,
    accountedView: "reboot",
    accountedDeviceId: null,
    accountedHeatmapKind: "confirmed_reboot",
    accountedHeatmapCell: null,
    analyticsPage: { rebootEvents: 0, project: 0, firmware: 0, authorization: 0, network: 0 },
    helpQuery: "",
    helpTopicId: null
  };
  const rebootAnalyticsCache = createRebootAnalyticsCache();
  let operationTimer=null,operationSequence=0,importProgressLastRender=0;
  const dbViews = global.MVP_DB_VIEWS?.createController?.({
    request: dbRequest,
    render,
    update: updateDatabasePanel,
    updateFilters: updateDatabaseFilters,
    reload: async()=>{
      try {
        await activateDatabase();
        if(!ui.inventoryBusy&&!ui.logImportBusy)ui.dbPendingWrite=null;
        render();
      }catch{setMessage("Не удалось обновить базу. Проверьте подключённую рабочую папку.","error");render();}
    },
    download: (bytes, name) => downloadBlob(bytes, name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    message: (message) => {ui.lastOperation={message,type:"error"};setMessage(message, "error"); render(); },
    formatStatus:formatPollStatus,
    activity:(value)=>{ui.exportActivity=value?.completed?null:value;if(value?.completed)ui.lastOperation={message:value.detail||"Файл подготовлен и передан браузеру.",type:"info"};refreshOperationStrip();}
  });

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  global.addEventListener?.("beforeunload", (event) => {
    if (ui.logImportBusy || ui.inventoryBusy || workspaceSaveInFlight || ui.workspaceSaveStatus === "error") {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("input", handleInput);
  render();
  if (launchMode.kind === "local") runtimeRequest("/api/session").then((session) => {
    ui.adminAccess = { adminConfigured: session.adminConfigured === true, adminUnlocked: session.adminUnlocked === true };
    if (ui.adminAccess.adminUnlocked) void restoreWorkspaceAfterLogin(); else render();
  }).catch(() => { ui.adminAccess = { error: true }; render(); });

  function currentUser() {
    return state.users.find((user) => user.id === sessionUserId && user.active) || null;
  }

  function setMessage(text, type) {
    ui.message = text ? { text, type: type || "info" } : null;
  }

  async function runtimeRequest(pathname, options = {}) {
    if (launchMode.kind !== "local") throw Object.assign(new Error("runtime_required"), { safeCode: "runtime_required" });
    const method = String(options.method || "GET").toUpperCase();
    const headers = { ...(options.headers || {}) };
    if (!["GET", "HEAD"].includes(method)) headers["X-MVP-CSRF"] = String(global.__MVP_CSRF__ || "");
    const tracked=options.track!==false&&!pathname.startsWith("/api/polling/jobs/")&&!(pathname==="/api/polling/jobs/active");
    const operation=tracked?++operationSequence:null;
    if(tracked){ui.pendingRequests[operation]={label:options.operationLabel||(pathname.startsWith("/api/admin/")?"Проверка доступа":pathname.includes("credentials")?"Подготовка учётных данных":"Запрос к локальному исполнителю"),started:Date.now()};refreshOperationStrip();}
    try {
      const response = await global.fetch(pathname, { method, headers, body: options.body, signal:options.signal, credentials: "same-origin", cache: "no-store" });
      if (response.status === 204) return null;
      let payload = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (!response.ok) throw Object.assign(new Error(payload?.error || "local_runtime_error"), { safeCode: payload?.error || "local_runtime_error", status: response.status });
      return payload;
    }finally{if(tracked){delete ui.pendingRequests[operation];refreshOperationStrip();}}
  }

  function postWorkspace(action, data) {
    return runtimeRequest(`/api/workspace/${action}`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
  }

  function dbRequest(action, data = {}, options = {}) {
    const labels={prepare:"Подготовка индексов БД",bootstrap:"Проверка опубликованных данных",context:"Получение контекста из БД",
      view:"Расчёт выборки и сводок",begin:"Подготовка записи в БД",batch:"Запись порции в БД",finish:"Подтверждение записи в БД",
      files:"Проверка ранее загруженных JSON",latest:"Получение последних фактов", "neighbors-batch":"Подготовка сравнений JSON"};
    return runtimeRequest("/api/workspace/db",{ method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({...data,action,workspace:ui.workspaceStatus?.workspaceId}),operationLabel:labels[action]||"Операция рабочей базы",...options });
  }

  function updateDatabasePanel() {
    const panel=app.querySelector?.("[data-db-panel]");
    if(!panel || typeof document.createElement!=="function")return false;
    let descriptor=MODULE_CATALOG.find((item)=>item.route===ui.route);
    if(ui.route==="upload" && ui.dbSourcesVisible)descriptor={route:"log-sources",renderer:"logs",title:"Метаданные импортированных логов",compact:true};
    else if(!descriptor || !["dashboard","reboots","project-versions","firmware-versions","connection-errors","equipment","inventory"].includes(descriptor.renderer))return false;
    const template=document.createElement("template");
    template.innerHTML=dbViews.render({...descriptor,category:INVENTORY_ROUTE[descriptor.route]?.category});
    const next=template.content.querySelector("[data-db-panel]");
    if(!next)return false;
    panel.replaceWith(next);
    return true;
  }

  function updateDatabaseFilters(markup) {
    const form=app.querySelector?.("[data-db-filters]");
    if(!form||typeof document.createElement!=="function")return false;
    const template=document.createElement("template");template.innerHTML=markup;
    const next=template.content.querySelector("[data-db-filters]");
    if(!next)return false;
    for(const select of next.querySelectorAll("select")){
      const target=form.elements.namedItem(select.name);
      if(target){target.innerHTML=select.innerHTML;target.disabled=select.disabled;target.value=select.value;}
    }
    const status=form.querySelector(".db-filter-state");
    if(status)status.textContent=next.querySelector(".db-filter-state")?.textContent||"";
    const retry=form.querySelector("[data-db-facets-retry]");
    if(retry)retry.hidden=next.querySelector("[data-db-facets-retry]")?.hidden!==false;
    form.setAttribute("aria-busy",next.getAttribute("aria-busy"));
    return true;
  }

  async function activateDatabase() {
    dbViews.deactivate();
    ui.dbPrepare = { processed: 0, total: 0 };
    render();
    try {
      for (;;) {
        const progress = await dbRequest("prepare");
        ui.dbPrepare = progress;
        if (progress.ready) break;
        if(!["reference","poll-sr-comparison"].includes(ui.route))render();
        await cooperativeBrowserYield();
      }
      const info = await dbRequest("bootstrap");
      const fresh = createDemoState();
      if (info.settings && Object.keys(info.settings).length) fresh.settings = { ...fresh.settings, ...info.settings };
      state = fresh;
      ui.teLogIndex = { events: [], coverage: null };
      ui.huawei310LogIndex = { events: [], coverage: null };
      ui.huawei300BarLogIndex = { events: [], coverage: null };
      ui.huawei300BoxLogIndex = { events: [], coverage: null };
      ui.logImportRows = []; ui.logFileRegistry = [];
      ui.dbMode = true; ui.dbOperationalRevision = null; ui.dbOperationalError=false;
      ui.dbPrepare = null; ui.workspaceSaveStatus = "restored";
      dbViews.setRevision(info);
      ui.workspaceStatus.dataRevision=info.revision;
      rebootAnalyticsCache.clear();
      render();
    } catch (error) {
      ui.dbPrepare = null;
      ui.workspaceSaveError = "Подготовка данных базы не завершена. Прежние данные не удалены; повторите подключение.";
      throw error;
    }
  }

  async function loadOperationalContext() {
    if (!ui.dbMode || ui.dbOperationLoading || ui.dbOperationalRevision === dbViews.revision) return;
    ui.dbOperationLoading = true;
    ui.dbOperationalError = false;
    const revision = dbViews.revision;
    try {
      const next = createDemoState();
      next.settings = { ...next.settings, ...state.settings };
      for (const label of ["inventoryDevices", "locations", "srImports", "pollingRuns"]) {
        next[label] = [];
        let after = "";
        do {
          const page = await dbRequest("context", { revision, label, after });
          next[label].push(...page.rows);
          after = page.next;
        } while (after);
      }
      next.srImports.sort((a,b)=>String(a.importedAt||"").localeCompare(String(b.importedAt||"")));
      if (revision !== dbViews.revision) return;
      state = next;
      ui.dbOperationalRevision = revision;
    } catch {
      ui.dbOperationalError = true;
      setMessage("Не удалось получить актуальные цели из базы. План опроса не будет запущен с неполными данными.", "error");
    } finally { ui.dbOperationLoading = false; render(); }
  }

  async function dbContextRows(label) {
    const revision = dbViews.revision, rows=[];
    let after="";
    do {
      const page=await dbRequest("context",{revision,label,after});
      rows.push(...page.rows); after=page.next;
    }while(after);
    return rows;
  }

  async function dbImportBegin(mode) {
    const token=(await dbRequest("begin", { revision: dbViews.revision, mode })).token;
    ui.dbPendingWrite={token,mode};
    return token;
  }

  async function dbSendRows(token, label, rows, onStored) {
    let batch = [], bytes = 0;
    const flush = async () => { if(batch.length){await dbRequest("batch", {token,label,rows:batch});onStored?.(batch.length);}batch=[];bytes=0; };
    for (const row of rows || []) {
      const safe = JSON.parse(JSON.stringify(row, safeWorkspaceField));
      const length = measureTextBytes(JSON.stringify(safe));
      if(batch.length && (batch.length>=500 || bytes+length>1024*1024)) await flush();
      batch.push(safe); bytes+=length;
    }
    await flush();
  }

  async function dbImportFinish(token) {
    const kind=ui.logImportBusy?"logs":ui.inventoryImportKind;
    if(kind)advanceImport(kind,{phase:"publishing",done:0,total:100,caption:"Публикация данных в БД"});
    let stopped=false,timer=null,controller=null;
    const poll=async()=>{
      if(stopped)return;
      controller=new AbortController();
      try{
        const progress=await dbRequest("progress",{token},{signal:controller.signal,track:false});
        if(!stopped&&kind&&progress.status!=="failed"){
          const captions={preparing:"Подготовка публикации",records:"Запись данных и индексов",relations:"Обновление сравнений и событий",cleanup:"Завершение индексов",evidence:"Сохранение ссылок на доказательства",commit:"Подтверждение транзакции",completed:"Проверка сохранённой версии"};
          advanceImport(kind,{phase:"publishing",done:Math.min(100,progress.percent||0),total:100,caption:captions[progress.stage]||"Публикация данных в БД"});
        }
      }catch{/* Progress is advisory; only the finish ACK determines success. */}
      if(!stopped)timer=setTimeout(poll,500);
    };
    timer=setTimeout(poll,300);
    let result;
    try{result=await dbRequest("finish", { token, sourceSr: state.srImports.at(-1)?.rawSha256 || null });}
    finally{stopped=true;if(timer)clearTimeout(timer);controller?.abort();}
    const info = await dbRequest("bootstrap");
    dbViews.setRevision(info);
    ui.dbOperationalRevision = null;
    ui.workspaceStatus.dataRevision=info.revision;
    ui.dbPendingWrite=null;
    ui.workspaceSaveStatus = "saved";
    ui.workspaceSaveError = null;
    return result;
  }

  async function saveDatabaseImport(mode, labels) {
    const total=labels.reduce((sum,label)=>sum+(state[label]?.length||0),0);
    let done=0;
    if(mode==="sr")advanceImport("sr",{phase:"staging",done,total,caption:"Передача SR в рабочую базу"});
    const token = await dbImportBegin(mode);
    for(const label of labels) await dbSendRows(token,label,state[label],(count)=>{
      done+=count;if(mode==="sr")advanceImport("sr",{phase:"staging",done,total,caption:"Сохранено записей SR: "+done+" / "+total});
    });
    await dbImportFinish(token);
  }

  function databaseTargetsReady() {
    return !ui.dbMode || (ui.workspaceStatus?.status==="ready" && ui.dbOperationalRevision===dbViews.revision
      && !ui.dbOperationLoading && !ui.dbPendingWrite && !ui.inventoryBusy && !ui.logImportBusy && !ui.dbPrepare);
  }

  async function confirmDatabaseTargetsCurrent() {
    if(!ui.dbMode)return true;
    if(ui.dbTargetCheck)return false;
    ui.dbTargetCheck=true;
    try{
      const info=await dbRequest("bootstrap");
      if(info.revision!==dbViews.revision){
        dbViews.setRevision(info);ui.workspaceStatus.dataRevision=info.revision;ui.dbOperationalRevision=null;
        setMessage("Данные базы изменились. Проверьте обновлённые цели и повторите запуск плана.","warning");render();return false;
      }
      return databaseTargetsReady();
    }catch(error){
      if(error?.safeCode==="db_preparation_required"){try{await activateDatabase();}catch{/* Existing database is untouched. */}}
      ui.dbOperationalRevision=null;
      setMessage("Актуальность целей не подтверждена. Проверьте рабочую базу и повторите запуск после загрузки контекста.","warning");render();return false;
    }finally{ui.dbTargetCheck=false;}
  }

  function currentLogCheckpointStore() {
    const workspace = ui.workspaceStatus?.workspaceId;
    if (launchMode.kind !== "local" || ui.adminAccess?.adminUnlocked !== true
      || ui.workspaceStatus?.status !== "ready" || !workspace) return null;
    return {
      async list(scope) {
        const result = [];
        let after = "-";
        for (;;) {
          const { value } = await runtimeRequest(`/api/workspace/log-list/${workspace}/${scope}/${after}`);
          result.push(...value);
          if (value.length < 512) return result;
          after = value.at(-1);
        }
      },
      async read(scope, key) {
        return (await runtimeRequest(`/api/workspace/log-file/${workspace}/${scope}/${key}`)).value;
      },
      async write(scope, key, result) {
        const response = await postWorkspace("log-file", { workspace, scope, key, result });
        if (!response?.stored) throw new Error("workspace_checkpoint_write_failed");
        if (ui.workspaceStatus?.workspaceId === workspace) ui.workspaceStatus.pendingLogFiles = Math.max(1, ui.workspaceStatus.pendingLogFiles || 0);
      }
    };
  }

  function workspaceErrorLabel(code) {
    const labels = {
      workspace_revision_conflict: "База изменена в другой вкладке. Не закрывайте текущую вкладку до сверки данных.",
      workspace_selection_changed: "Выбрана другая рабочая база. Текущие результаты не перезаписали её.",
      workspace_part_too_large: "Одна запись превышает размер безопасной порции; данные вкладки не удалены.",
      request_too_large: "Порция запроса превышает допустимый размер. Обновление всей истории не опубликовано.",
      workspace_write_failed: "Ошибка записи в папку базы: проверьте доступ и свободное место.",
      workspace_corrupt: "Проверка целостности базы не пройдена; прежняя версия не заменена.",
      workspace_secret_rejected: "Защита отклонила поле, не разрешённое для постоянного хранения.",
      admin_login_required: "Для сохранения требуется локальный вход администратора."
    };
    return labels[code] || "Сохранение не подтверждено. Прежняя версия базы и данные текущей вкладки не удалены.";
  }

  async function restoreWorkspaceAfterLogin() {
    if (launchMode.kind !== "local" || ui.adminAccess?.adminUnlocked !== true) return;
    if(!dbViews){ui.workspaceSaveStatus="error";ui.workspaceSaveError="Требуется новый запуск Python runtime после обновления файлов. Прежняя база не изменена.";render();return;}
    try {
      const status = await runtimeRequest("/api/workspace/status");
      ui.workspaceStatus = status;
      workspacePartDigests = new Set();
      ui.workspaceSaveStatus = null;
      if (status.status === "ready" && dbViews) { await activateDatabase(); return; }
      if (status.status !== "ready" || !status.hasSnapshot) { render(); return; }
      ui.workspaceSaveStatus = "restoring";
      render();
      let payload = null;
      if (status.partCount > 0) {
        for (let position = 0; position < status.partCount; position += 1) {
          const part = await runtimeRequest(`/api/workspace/part/${status.workspaceId}/${status.revision}/${position}`);
          if (await sha256Text(part.body) !== part.digest) throw new Error("workspace_snapshot_invalid");
          payload = restoreWorkspacePart(payload, JSON.parse(part.body));
          workspacePartDigests.add(part.digest);
        }
      } else {
        const restored = await runtimeRequest("/api/workspace/snapshot");
        if (restored?.revision !== status.revision) throw new Error("workspace_snapshot_invalid");
        payload = restored?.payload;
      }
      if (!payload || !validateState(payload.state).ok || !isPlainObject(payload.log)) {
        throw new Error("workspace_snapshot_invalid");
      }
      state = payload.state;
      ui.teLogIndex = payload.log.indexes?.te || { events: [], coverage: null, sourceSrSha256: null };
      ui.huawei310LogIndex = payload.log.indexes?.huawei310 || { events: [], coverage: null, sourceSrSha256: null };
      ui.huawei300BarLogIndex = payload.log.indexes?.huawei300Bar || { events: [], coverage: null, sourceSrSha256: null };
      ui.huawei300BoxLogIndex = payload.log.indexes?.huawei300Box || { events: [], coverage: null, sourceSrSha256: null, validationStatus: "confirmed_user_validation" };
      ui.logImportRows = Array.isArray(payload.log.rows) ? payload.log.rows : [];
      ui.logImportSummary = payload.log.summary?.files ? payload.log.summary : null;
      ui.logFileRegistry = Array.isArray(payload.log.registry) ? payload.log.registry : [];
      ui.logCompletedCheckpoint = null;
      rebootAnalyticsCache.clear();
      ui.workspaceSaveStatus = "restored";
      render();
    } catch (error) {
      ui.workspaceStatus = { status: "error", code: error?.safeCode || "workspace_restore_failed" };
      ui.workspaceSaveStatus = "error";
      setMessage("Рабочую базу не удалось восстановить. Прежние файлы не удалены; проверьте папку и целостность базы.", "error");
      render();
    }
  }

  function queueWorkspaceSave() {
    if(ui.dbPrepare || ui.workspaceSaveStatus==="restoring" || (dbViews && launchMode.kind==="local" && ui.workspaceStatus?.status==="ready" && !ui.dbMode))return Promise.resolve(false);
    if (ui.dbMode) return Promise.resolve(!ui.dbPendingWrite); // Never replace the DB with lightweight browser state.
    if (launchMode.kind !== "local" || ui.adminAccess?.adminUnlocked !== true || ui.workspaceStatus?.status !== "ready") return Promise.resolve(false);
    workspaceSaveRequested = true;
    if (workspaceSaveInFlight) return workspaceSaveInFlight;
    workspaceSaveInFlight = (async () => {
      while (workspaceSaveRequested) {
        workspaceSaveRequested = false;
        ui.workspaceSaveStatus = "saving";
        ui.workspaceSaveError = null;
        ui.workspaceSaveParts = 0;
        const pages = workspaceParts(state, { rows: ui.logImportRows, summary: ui.logImportSummary,
          indexes: { te: ui.teLogIndex, huawei310: ui.huawei310LogIndex,
            huawei300Bar: ui.huawei300BarLogIndex, huawei300Box: ui.huawei300BoxLogIndex }, registry: ui.logFileRegistry });
        const workspace = ui.workspaceStatus.workspaceId;
        const completedScope = ui.logCompletedCheckpoint;
        const { upload } = await postWorkspace("transfer/begin", { workspace, revision: ui.workspaceStatus.revision });
        let position = 0;
        const newDigests = new Set();
        for (const body of pages) {
          const digest = await sha256Text(body);
          const page = { workspace, upload, position, digest, body };
          let stored = false;
          if (workspacePartDigests.has(digest)) stored = (await postWorkspace("transfer/part", { ...page, body: null })).stored === true;
          if (!stored) stored = (await postWorkspace("transfer/part", page)).stored === true;
          if (!stored) throw new Error("workspace_part_write_failed");
          newDigests.add(digest);
          position += 1;
          ui.workspaceSaveParts = position;
          const progress = app.querySelector("[data-workspace-save-progress]");
          if (progress) progress.textContent = `Сохранение рабочей базы… порций: ${position}`;
        }
        const result = await postWorkspace("transfer/finish", { workspace, upload, parts: position });
        workspacePartDigests = newDigests;
        ui.workspaceStatus = { ...ui.workspaceStatus, revision: result.revision, partCount: result.partCount, hasSnapshot: true, updatedAt: result.updatedAt };
        ui.workspaceSaveStatus = "saved";
        if (completedScope && ui.logCompletedCheckpoint === completedScope) {
          try {
            for (let start = 0; start < completedScope.keys.length; start += 512) {
              const cleared = await postWorkspace("log-finish", { workspace, scope: completedScope.scope,
                revision: result.revision, keys: completedScope.keys.slice(start, start + 512) });
              if (Number.isSafeInteger(cleared.pendingLogFiles)) ui.workspaceStatus.pendingLogFiles = cleared.pendingLogFiles;
            }
            ui.logCompletedCheckpoint = null;
          } catch { /* The published revision is safe; recovery data can be reused if the cleanup failed. */ }
        }
      }
      return true;
    })().catch((error) => {
      workspaceSaveRequested = false;
      ui.workspaceSaveStatus = "error";
      ui.workspaceSaveError = workspaceErrorLabel(error?.safeCode);
      setMessage(error?.safeCode === "workspace_revision_conflict"
        ? "Рабочая база изменена в другой вкладке. Текущие данные не записаны; не закрывайте вкладку до сверки изменений."
        : "Не удалось сохранить рабочую базу. Данные пока есть только в текущей вкладке.", "error");
      if (ui.route === "upload") render();
      return false;
    }).finally(() => { workspaceSaveInFlight = null; if (workspaceSaveRequested) void queueWorkspaceSave(); });
    return workspaceSaveInFlight;
  }

  async function ensurePollingOutputPermission(handle) {
    if (!handle) return false;
    const options = { mode: "readwrite" };
    if (typeof handle.queryPermission === "function" && await handle.queryPermission(options) === "granted") return true;
    return typeof handle.requestPermission === "function" && await handle.requestPermission(options) === "granted";
  }

  async function createPollingRunDirectory(rootHandle, startedAt) {
    const existing = [];
    if (typeof rootHandle.keys === "function") for await (const name of rootHandle.keys()) existing.push(name);
    const name = chooseUniquePollingRunFolderName(existing, startedAt);
    return { name, handle: await rootHandle.getDirectoryHandle(name, { create: true }) };
  }

  async function writePollingResultFile(runDirectory, pending) {
    const filename = String(pending?.filename || "");
    if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\.json$|^unsupported-[0-9]{4}\.json$/.test(filename)) throw new Error("Некорректное имя результата");
    const fileHandle = await runDirectory.handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable({ keepExistingData: false });
    try {
      const payload = { ...pending.payload, outputFile: `.\\${runDirectory.name}\\${filename}` };
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
    } catch (error) {
      try { await writable.abort(); } catch { /* best effort */ }
      throw error;
    }
  }

  async function writeDeviceLogFile(runDirectory, jobId, pending) {
    const filename = String(pending?.filename || "");
    const ip = normalizeIpv4(pending?.ip);
    const format = String(pending?.format || "");
    const xml = ip && filename === `${ip}.xml` && (format === "xml" || !format);
    const tgz = ip && filename === `${ip}.tgz` && format === "polycom_syslog_tgz_v1";
    if (!xml && !tgz) throw new Error("log_filename_invalid");
    const expectedMime = tgz ? "application/gzip" : "application/xml";
    const response = await global.fetch(`/api/polling/jobs/${encodeURIComponent(jobId)}/log/${encodeURIComponent(pending.logId)}`, { credentials: "same-origin", cache: "no-store", headers: { Accept: expectedMime, "X-MVP-CSRF": String(global.__MVP_CSRF__ || "") } });
    if (!response.ok || !response.body) throw new Error("log_stream_unavailable");
    if (String(response.headers?.get("Content-Type") || "").split(";", 1)[0].trim().toLowerCase() !== expectedMime) throw new Error("log_stream_format_invalid");
    const fileHandle = await runDirectory.handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable({ keepExistingData: false });
    const reader = response.body.getReader();
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!(value instanceof Uint8Array)) throw new Error("log_stream_invalid");
        bytes += value.byteLength;
        await writable.write(value);
      }
      if (!bytes) throw new Error("log_empty");
      await writable.close();
    } catch (error) {
      try { await reader.cancel(); } catch { /* best effort */ }
      try { await writable.abort(); } catch { /* best effort */ }
      throw error;
    }
  }

  async function pendingResultAlreadyWritten(runDirectory, pending) {
    try {
      const file = await (await runDirectory.handle.getFileHandle(String(pending.filename))).getFile();
      if (file.size > 32 * 1024 * 1024) return false;
      const existing = JSON.parse(await file.text());
      return existing.ip === pending.payload?.ip && existing.capturedAt === pending.payload?.capturedAt && existing.adapterKey === pending.payload?.adapterKey;
    } catch { return false; }
  }

  async function writePollingRecovery(runDirectory, manifest) {
    POLLING_RECOVERY.validate(manifest);
    const fileHandle = await runDirectory.handle.getFileHandle(POLLING_RECOVERY.FILE, { create: true });
    const writable = await fileHandle.createWritable({ keepExistingData: false });
    try {
      await writable.write(JSON.stringify(manifest, null, 2));
      await writable.close();
    } catch (error) {
      try { await writable.abort(); } catch { /* best effort */ }
      throw error;
    }
  }

  async function findPollingRecovery(rootHandle) {
    const found = [];
    for await (const [name, child] of rootHandle.entries()) {
      if (child.kind !== "directory" || !/^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d(?:-\d+)?$/.test(name)) continue;
      try {
        const fileHandle = await child.getFileHandle(POLLING_RECOVERY.FILE);
        const file = await fileHandle.getFile();
        if (file.size > 16 * 1024 * 1024) continue;
        const manifest = POLLING_RECOVERY.validate(JSON.parse(await file.text()));
        if (manifest.status !== "completed") found.push({ manifest, runDirectory: { name, handle: child } });
      } catch { /* unrelated or incomplete folder */ }
    }
    found.sort((left, right) => String(right.manifest.createdAt).localeCompare(String(left.manifest.createdAt)));
    return found[0] || null;
  }

  async function reattachPollingIfPossible() {
    if (!selectedPollingRecovery?.manifest.jobId || automaticPollingMonitor) return false;
    if (selectedPollingRecovery.manifest.plan.collectLogs && !logOutputRootHandle) return false;
    const active = await runtimeRequest("/api/polling/jobs/active");
    if (active.activeJobId !== selectedPollingRecovery.manifest.jobId) return false;
    const logRunDirectory = selectedPollingRecovery.manifest.plan.collectLogs
      ? { name: selectedPollingRecovery.manifest.logFolderName, handle: await logOutputRootHandle.getDirectoryHandle(selectedPollingRecovery.manifest.logFolderName) }
      : null;
    selectedPollingRecovery.originalIndices = selectedPollingRecovery.manifest.activeOriginalIndices || selectedPollingRecovery.manifest.plan.devices.map((_, index) => index);
    const monitorToken = Symbol("automatic-polling-reattach");
    automaticPollingMonitor = monitorToken;
    void monitorAutomaticPolling(active.activeJobId, monitorToken, selectedPollingRecovery, logRunDirectory);
    return true;
  }

  async function verifySavedResults(recovery) {
    if (recovery.manifest.plan.collectJson === false) return [...recovery.manifest.savedIndices];
    const verified = [];
    for (let index = 0; index < recovery.manifest.plan.devices.length; index += 1) {
      const ip = String(recovery.manifest.plan.devices[index].ipNormalized || recovery.manifest.plan.devices[index].ip || "");
      if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(ip)) continue;
      try {
        const handle = await recovery.runDirectory.handle.getFileHandle(`${ip}.json`);
        const file = await handle.getFile();
        if (file.size > 32 * 1024 * 1024) continue;
        const content = JSON.parse(await file.text());
        if (content.ip === ip && typeof content.capturedAt === "string") verified.push(index);
      } catch { /* missing/invalid result must not count as saved */ }
    }
    return verified;
  }

  function recoveryTargetsMatchCurrentSource(manifest) {
    const dedicated = manifest.plan.targetSource === "port_closure_list";
    if (dedicated && (!managementTargetListSession?.sourceSha256 || managementTargetListSession.sourceSha256 !== manifest.plan.targetSourceSha256)) return false;
    if (!dedicated && (!manifest.plan.targetSourceSha256 || !state.srImports.some((item) => item.rawSha256 === manifest.plan.targetSourceSha256))) return false;
    const source = dedicated ? managementTargetListSession.devices : state.inventoryDevices;
    if (!Array.isArray(source) || !source.length) return false;
    const currentByIp = new Map(source.map((device) => {
      const projected = pollingRuntimeDevice(device);
      return [normalizeIpv4(projected.ip), projected];
    }));
    return manifest.plan.devices.every((device) => {
      const ip = normalizeIpv4(device.ipNormalized || device.ip);
      const current = currentByIp.get(ip);
      return ip && current && String(current.manufacturer || "").trim().toLowerCase() === String(device.manufacturer || "").trim().toLowerCase() && String(current.model || "").trim().toLowerCase() === String(device.model || "").trim().toLowerCase();
    });
  }

  function automaticPollingStatusLabel(status) {
    return ({ scheduled: "Ожидание времени запуска", running: "Опрос устройства", waiting_for_save: "Сохранение результата", waiting_for_log: "Сохранение лога", waiting_interval: "Ожидание интервала", completed: "Завершено", cancelled: "Отменено", failed: "Ошибка" })[status] || "Подготовка";
  }

  function automaticPollingErrorMessage(code) {
    return ({ runtime_required: "Для автоматического опроса откройте START_MVP_SPHERE_SR.py установленным Python 3.11 или новее.", credentials_required: "Введите учётные данные перед запуском опроса.", credential_file_invalid: "Учётные данные не приняты локальным исполнителем.", credential_sha_mismatch: "Учётные данные изменились после формирования плана.", plan_invalid: "Сформированный план не принят локальным исполнителем.", log_folder_required: "Для сбора логов выберите отдельную папку с разрешением на запись.", zero_interval_confirmation_required: "Подтвердите запуск опроса без интервалов.", job_already_active: "В этой локальной сессии уже выполняется опрос.", result_save_failed: "Не удалось сохранить JSON результата; событие записано, опрос других устройств продолжается.", result_save_timeout: "Вкладка перестала подтверждать запись результатов. Опрос остановлен; продолжите его из выбранной папки после повторного ввода учётных данных.", polling_cancelled: "Автоматический опрос отменён.", local_runtime_error: "Локальный исполнитель не завершил операцию." })[code] || "Локальная операция не выполнена.";
  }

  async function monitorAutomaticPolling(jobId, monitorToken, recovery, logRunDirectory = null) {
    const runDirectory = recovery.runDirectory;
    try {
      while (automaticPollingMonitor === monitorToken) {
        const status = await runtimeRequest(`/api/polling/jobs/${encodeURIComponent(jobId)}`);
        ui.automaticPolling = { ...status, runFolderName: runDirectory.name };
        if (status.pendingLog) {
          let saved = false;
          try {
            if (!logRunDirectory) throw new Error("log_folder_unavailable");
            await writeDeviceLogFile(logRunDirectory, jobId, status.pendingLog);
            saved = true;
          } catch {
            setMessage(`Не удалось сохранить лог устройства ${escapeHtml(String(status.pendingLog.ip || "без IP"))}. Опрос продолжается.`, "warning");
          }
          try { await runtimeRequest(`/api/polling/jobs/${encodeURIComponent(jobId)}/log/${encodeURIComponent(status.pendingLog.logId)}/ack`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved }) }); }
          catch (error) { if (error.status !== 409) throw error; }
        }
        if (status.pendingResult) {
          const pending = await runtimeRequest(`/api/polling/jobs/${encodeURIComponent(jobId)}/result`);
          if (pending) {
            let saved = false;
            try {
              if (recovery.manifest.plan.collectJson !== false && !await pendingResultAlreadyWritten(runDirectory, pending)) await writePollingResultFile(runDirectory, pending);
              saved = true;
            } catch {
              setMessage(`Не удалось сохранить JSON для устройства ${escapeHtml(String(pending.payload?.ip || "без IP"))}. Опрос остальных устройств продолжается.`, "warning");
            }
            const originalIndex = recovery.originalIndices[pending.index];
            POLLING_RECOVERY.record(recovery.manifest, originalIndex, saved);
            await writePollingRecovery(runDirectory, recovery.manifest);
            await runtimeRequest(`/api/polling/jobs/${encodeURIComponent(jobId)}/result/${encodeURIComponent(pending.resultId)}/ack`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saved }) });
          }
        }
        if(ui.route==="upload")render();
        if (["completed", "cancelled", "failed"].includes(status.status)) {
          recovery.manifest.status = status.status === "completed" ? (recovery.manifest.saveFailures.length ? "completed_with_errors" : "completed") : "interrupted";
          await writePollingRecovery(runDirectory, recovery.manifest);
          selectedPollingRecovery = recovery.manifest.status === "completed" ? null : recovery;
          ui.pollingRecoverySummary = selectedPollingRecovery ? { folder: runDirectory.name, remaining: recovery.manifest.plan.devices.length - recovery.manifest.savedIndices.length, requiresReview: recovery.manifest.requiresReview?.length || 0 } : null;
          const message = status.status === "completed"
            ? `Автоматический опрос завершён. Папка ${runDirectory.name}. ${status.saveFailed ? `Не сохранено JSON: ${status.saveFailed}; доступно продолжение.` : ""}${status.logsFailed ? ` Ошибки сохранения логов: ${status.logsFailed}.` : ""}`
            : automaticPollingErrorMessage(status.safeError || (status.status === "cancelled" ? "polling_cancelled" : "local_runtime_error"));
          setMessage(message, status.status === "completed" ? (status.saveFailed || status.logsFailed ? "warning" : "success") : status.status === "cancelled" ? "warning" : "error");
          render();
          break;
        }
        await new Promise((resolve) => global.setTimeout(resolve, 250));
      }
    } catch (error) {
      try { await runtimeRequest(`/api/polling/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch { /* runtime may already be gone */ }
      selectedPollingRecovery = recovery;
      ui.pollingRecoverySummary = { folder: recovery.runDirectory.name, remaining: recovery.manifest.plan.devices.length - recovery.manifest.savedIndices.length, requiresReview: recovery.manifest.requiresReview?.length || 0 };
      setMessage(automaticPollingErrorMessage(error.safeCode || "result_save_failed"), "error");
      render();
    } finally {
      if (automaticPollingMonitor === monitorToken) automaticPollingMonitor = null;
      credentialPoolSession = null;
      ui.credentialSummary = null;
    }
  }

  async function startAutomaticPolling(planId, allowInsecureTls) {
    if (launchMode.kind !== "local") throw Object.assign(new Error("runtime_required"), { safeCode: "runtime_required" });
    const exported = buildPollingPlanExport(state, planId);
    if (!exported.ok) throw Object.assign(new Error("plan_invalid"), { safeCode: "plan_invalid" });
    if (isZeroIntervalRange(exported.payload) && !ui.zeroIntervalAcknowledged) throw Object.assign(new Error("zero_interval_confirmation_required"), { safeCode: "zero_interval_confirmation_required" });
    if (exported.payload.collectJson && (!pollingOutputRootHandle || !await ensurePollingOutputPermission(pollingOutputRootHandle))) throw Object.assign(new Error("result_save_failed"), { safeCode: "result_save_failed" });
    if (exported.payload.collectLogs && (!logOutputRootHandle || !await ensurePollingOutputPermission(logOutputRootHandle))) throw Object.assign(new Error("log_folder_required"), { safeCode: "log_folder_required" });
    if (!credentialPoolSession?.sourceSha256) throw Object.assign(new Error("credentials_required"), { safeCode: "credentials_required" });
    const startedAt = new Date().toISOString();
    const logRunDirectory = exported.payload.collectLogs ? await createPollingRunDirectory(logOutputRootHandle, startedAt) : null;
    const runDirectory = exported.payload.collectJson ? await createPollingRunDirectory(pollingOutputRootHandle, startedAt) : logRunDirectory;
    const manifest = POLLING_RECOVERY.create(exported.payload, allowInsecureTls);
    if (logRunDirectory) manifest.logFolderName = logRunDirectory.name;
    const recovery = { manifest, runDirectory, originalIndices: exported.payload.devices.map((_, index) => index) };
    await writePollingRecovery(runDirectory, manifest);
    const started = await runtimeRequest("/api/polling/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, plan: exported.payload, allowInsecureTls: allowInsecureTls === true }) });
    manifest.status = "running";
    manifest.jobId = started.jobId;
    try { await writePollingRecovery(runDirectory, manifest); }
    catch (error) {
      try { await runtimeRequest(`/api/polling/jobs/${encodeURIComponent(started.jobId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch { /* runtime may be unavailable */ }
      throw error;
    }
    ui.automaticPolling = { jobId: started.jobId, status: started.status, total: exported.payload.devices.length, processed: 0, successful: 0, failed: 0, unsupported: 0, collectLogs: exported.payload.collectLogs === true, allowInsecureTls: allowInsecureTls === true };
    const monitorToken = Symbol("automatic-polling-monitor");
    automaticPollingMonitor = monitorToken;
    render();
    void monitorAutomaticPolling(started.jobId, monitorToken, recovery, logRunDirectory);
  }

  async function resumeAutomaticPolling() {
    if (launchMode.kind !== "local" || automaticPollingMonitor || !selectedPollingRecovery) throw Object.assign(new Error("recovery_unavailable"), { safeCode: "recovery_unavailable" });
    const recoveryPlan = selectedPollingRecovery.manifest.plan;
    if (recoveryPlan.collectJson !== false && (!pollingOutputRootHandle || !await ensurePollingOutputPermission(pollingOutputRootHandle))) throw Object.assign(new Error("result_save_failed"), { safeCode: "result_save_failed" });
    if (recoveryPlan.collectLogs && (!logOutputRootHandle || !await ensurePollingOutputPermission(logOutputRootHandle))) throw Object.assign(new Error("log_folder_required"), { safeCode: "log_folder_required" });
    if (!credentialPoolSession?.sourceSha256) throw Object.assign(new Error("credentials_required"), { safeCode: "credentials_required" });
    const recovery = selectedPollingRecovery;
    const logRunDirectory = recoveryPlan.collectLogs ? { name: recovery.manifest.logFolderName, handle: await logOutputRootHandle.getDirectoryHandle(recovery.manifest.logFolderName) } : null;
    if (!recoveryTargetsMatchCurrentSource(recovery.manifest)) throw Object.assign(new Error("recovery_source_required"), { safeCode: "recovery_source_required" });
    const verifiedSaved = await verifySavedResults(recovery);
    recovery.manifest.savedIndices = verifiedSaved;
    const remaining = POLLING_RECOVERY.remaining(recovery.manifest, verifiedSaved);
    if (remaining.skippedForReview.length) {
      recovery.manifest.requiresReview = remaining.skippedForReview;
      await writePollingRecovery(recovery.runDirectory, recovery.manifest);
    }
    if (!remaining.originalIndices.length) {
      throw Object.assign(new Error("recovery_nothing_to_poll"), { safeCode: "recovery_nothing_to_poll" });
    }
    const writeTask = remaining.plan.managementTasks?.length > 0;
    const warning = writeTask
      ? `Продолжить опрос ${remaining.originalIndices.length} устройств из папки ${recovery.runDirectory.name}? ${remaining.skippedForReview.length} устройств с неизвестным исходом операции управления будут пропущены и требуют отдельной проверки. Подтвердите повторное разрешение задачи отключения портов.`
      : `Продолжить опрос ${remaining.originalIndices.length} устройств из папки ${recovery.runDirectory.name}? Уже подтверждённые результаты повторно опрашиваться не будут.`;
    if (!global.confirm(warning)) return;
    if (Number(remaining.plan.intervalMinSeconds) === 0 && Number(remaining.plan.intervalMaxSeconds) === 0 && !global.confirm("Опрос будет продолжен без интервалов между устройствами. Подтвердить?")) return;
    remaining.plan.authenticationInputSha256 = credentialPoolSession.sourceSha256;
    const started = await runtimeRequest("/api/polling/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: remaining.plan, allowInsecureTls: recovery.manifest.allowInsecureTls }) });
    recovery.manifest.status = "running";
    recovery.manifest.jobId = started.jobId;
    recovery.manifest.activeOriginalIndices = remaining.originalIndices;
    try { await writePollingRecovery(recovery.runDirectory, recovery.manifest); }
    catch (error) {
      try { await runtimeRequest(`/api/polling/jobs/${encodeURIComponent(started.jobId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch { /* best effort */ }
      throw error;
    }
    recovery.originalIndices = remaining.originalIndices;
    ui.automaticPolling = { jobId: started.jobId, status: started.status, total: remaining.originalIndices.length, processed: 0, saved: 0, saveFailed: 0, collectJson: recoveryPlan.collectJson !== false, collectLogs: recoveryPlan.collectLogs === true, allowInsecureTls: recovery.manifest.allowInsecureTls, runFolderName: recovery.runDirectory.name };
    const monitorToken = Symbol("automatic-polling-resume");
    automaticPollingMonitor = monitorToken;
    render();
    void monitorAutomaticPolling(started.jobId, monitorToken, recovery, logRunDirectory);
  }

  function commitState(nextState, successMessage) {
    const result = saveState(nextState, persistenceStorage);
    if (!result.ok) {
      setMessage(`Сохранение отменено: ${result.errors.join("; ")}`, "error");
      render();
      return false;
    }
    state = deepClone(nextState);
    pollingImportContextCache = null;
    recovery = null;
    if (successMessage) setMessage(successMessage, "success");
    render();
    void queueWorkspaceSave();
    return true;
  }

  function render() {
    if (recovery && recovery.kind === "corrupt_state") {
      app.innerHTML = renderRecovery();
      return;
    }
    const user = currentUser();
    if (!user) {
      app.innerHTML = renderLogin();
      return;
    }
    try { app.innerHTML = renderShell(user); }
    catch {
      // A failed view must not leave navigation stuck on the previous module.
      const previous = ui.route;
      ui.route = "upload";
      try { app.innerHTML = renderShell(user); }
      catch { app.innerHTML = '<main><h1>Не удалось отобразить раздел</h1><p>Данные в базе не удалены.</p></main>'; }
      ui.route = previous;
      setMessage("Раздел не удалось отобразить. Данные базы не изменены; можно открыть другой модуль.", "error");
    }
    try {global.MVP_SPHERE_BRAND?.mount(app);}catch{/* Optional decoration must not interrupt import or navigation. */}
    refreshOperationStrip();
  }

  function startImport(kind) {
    ui.importActivities[kind]=createImportActivity(kind);
  }

  function advanceImport(kind,update,refresh=true) {
    const previousPhase=ui.importActivities[kind]?.phase;
    ui.importActivities[kind]=advanceImportActivity(ui.importActivities[kind],update);
    const now=Date.now();
    if(refresh&&(previousPhase!==update.phase||now-importProgressLastRender>=250)){importProgressLastRender=now;refreshOperationStrip();}
  }

  function finishImport(kind,status,message) {
    const previous=ui.importActivities[kind];
    if(!previous)return;
    ui.importActivities[kind]={...previous,status,finishedAt:Date.now(),message};
    const labels={completed:"Успешно завершено — 100%",partial:"Завершено с ошибками — 100% обработано",cancelled:"Остановлено пользователем",failed:"Не завершено"};
    ui.lastOperation={message:labels[status]+". "+message,type:status==="completed"?"info":status==="failed"?"error":"warning"};
    refreshOperationStrip();
  }

  function importActivityText(activity) {
    const view=importActivityView(activity);
    const percent=(activity.status==="running"?"≈ ":"")+view.percent+"%";
    const eta=view.etaSeconds===null?"Осталось: рассчитывается":"Осталось примерно "+formatPollingEta(view.etaSeconds);
    return {view,percent,eta,elapsed:"Прошло "+formatPollingEta(view.elapsedSeconds)};
  }

  function importActivityBody(activity) {
    const {view,percent,eta,elapsed}=importActivityText(activity);
    const titles={completed:"Успешно завершено",partial:"Завершено с ошибками",cancelled:"Остановлено пользователем",failed:"Не завершено"};
    const running=activity.status==="running";
    return `<div class="import-live-heading"><strong>${escapeHtml(running?activity.caption:titles[activity.status])}</strong><b>${escapeHtml(percent)}</b></div><progress max="100" value="${view.percent}" aria-label="Примерный общий прогресс импорта"></progress><p>${running?escapeHtml(eta)+" · ":""}${escapeHtml(elapsed)}</p>${!running&&activity.message?`<p>${escapeHtml(activity.message)}</p>`:""}`;
  }

  function renderImportActivity(kind) {
    const activity=ui.importActivities[kind];
    return activity?`<section class="import-live import-live-${activity.status}" data-import-live="${kind}" role="status" aria-busy="${activity.status==="running"}">${importActivityBody(activity)}</section>`:"";
  }

  function refreshImportActivities() {
    for(const element of app.querySelectorAll?.("[data-import-live]")||[]){
      const activity=ui.importActivities[element.dataset.importLive];
      if(activity){element.innerHTML=importActivityBody(activity);element.className="import-live import-live-"+activity.status;element.setAttribute("aria-busy",String(activity.status==="running"));}
    }
  }

  function operationRows() {
    const rows=[];
    if(ui.dbPrepare)rows.push({label:"Подготовка индексов БД",detail:ui.dbPrepare.processed+" / "+ui.dbPrepare.total+" порций"});
    if(ui.dbOperationLoading)rows.push({label:"Загрузка актуального контекста устройств",detail:"Получение данных из БД"});
    if(ui.inventoryBusy){
      const progress=ui.inventoryImportKind==="sr"?ui.srProgress:ui.pollingProgress;
      const activity=ui.importActivities[ui.inventoryImportKind],summary=activity?importActivityText(activity):null;
      rows.push({label:ui.inventoryImportKind==="sr"?"Импорт SR":"Импорт JSON",detail:summary?summary.percent+" · "+activity.caption+" · "+summary.eta+" · "+summary.elapsed:(progress?.stage||"Обработка")+" · "+(progress?.processed||0)+" / "+(progress?.total||0)});
    }
    if(ui.logImportBusy){const activity=ui.importActivities.logs,summary=activity?importActivityText(activity):null;rows.push({label:"Импорт и анализ логов",detail:summary?summary.percent+" · "+activity.caption+" · "+summary.eta+" · "+summary.elapsed:"Подготовка"});}
    if(ui.automaticPolling&&!["completed","cancelled","failed"].includes(ui.automaticPolling.status))rows.push({label:"Опрос устройств",detail:automaticPollingStatusLabel(ui.automaticPolling.status)+" · "+(ui.automaticPolling.processed||0)+" / "+(ui.automaticPolling.total||0)});
    if(ui.managementTargetBusy)rows.push({label:"Загрузка таблицы параметров",detail:"Чтение и проверка XLSX"});
    if(ui.exportActivity)rows.push({label:ui.exportActivity.label,detail:ui.exportActivity.detail||"Выполняется"});
    if(!rows.length){
      const requests=Object.values(ui.pendingRequests);
      if(requests.length)rows.push({label:requests[0].label,detail:"Активных запросов: "+requests.length+" · "+Math.max(0,Math.floor((Date.now()-requests[0].started)/1000))+" с"});
    }
    return rows;
  }

  function refreshOperationStrip() {
    refreshImportActivities();
    const host=app.querySelector?.("[data-operation-strip]");
    if(!host)return;
    const rows=operationRows(),last=ui.lastOperation;
    host.hidden=!rows.length&&!last;
    host.className="operation-strip"+(!rows.length&&last?.type==="error"?" operation-strip-error":"");
    host.innerHTML=rows.length?'<span class="operation-spinner" aria-hidden="true"></span><div>'+rows.map((row)=>'<p><strong>'+escapeHtml(row.label)+'</strong><span>'+escapeHtml(row.detail)+'</span></p>').join("")+'</div>'
      :last?'<div><p><strong>'+escapeHtml(last.type==="error"?"Ошибка операции":last.type==="warning"?"Требуется внимание":"Операция завершена")+'</strong><span>'+escapeHtml(last.message)+'</span></p></div><button type="button" class="text-button" data-dismiss-operation>Скрыть</button>':"";
    if(rows.length&&!operationTimer)operationTimer=global.setInterval(refreshOperationStrip,1000);
    if(!rows.length&&operationTimer){global.clearInterval(operationTimer);operationTimer=null;}
  }

  function updatePollingProgress(snapshot, forceRender) {
    ui.pollingProgress = { ...snapshot };
    advanceImport("json",{phase:snapshot.status==="saving"?"publishing":"analyzing",done:snapshot.status==="saving"?0:snapshot.processed,total:snapshot.status==="saving"?100:snapshot.total,caption:snapshot.stage},false);
    refreshOperationStrip();
    if (ui.route !== "upload") return;
    const current = Date.now();
    const renderNow = forceRender || current - pollingProgressLastRenderAt >= 100;
    if (renderNow) {
      if (pollingProgressRenderTimer) clearTimeout(pollingProgressRenderTimer);
      pollingProgressRenderTimer = null;
      pollingProgressLastRenderAt = current;
      render();
      return;
    }
    if (!pollingProgressRenderTimer) {
      pollingProgressRenderTimer = setTimeout(() => {
        pollingProgressRenderTimer = null;
        pollingProgressLastRenderAt = Date.now();
        if (ui.route === "upload" && ui.inventoryBusy) render();
      }, Math.max(0, 100 - (current - pollingProgressLastRenderAt)));
    }
  }

  function logImportProgressText(progress) {
    const phase = { preparing:"Подготовка импорта и проверка прежних результатов в БД", classifying: "Проверка файлов", analyzing: "Чтение и анализ логов",
      summarizing: "Объединение событий", saving: "Запись аналитики в рабочую базу" }[progress.phase] || "Импорт";
    if (progress.phase === "classifying") return `${phase}: ${progress.processed} из ${progress.total}.`;
    return `${phase}: ${progress.processed} из ${progress.total} файлов · обработано ${formatBytes(progress.bytesRead || 0)} из ${formatBytes(progress.totalBytes || 0)} · перечитывать не пришлось: ${progress.skippedFiles || 0}.`;
  }

  function logImportSpeedText(progress) {
    if (progress.phase === "classifying") return "Скорость появится после начала чтения.";
    const read = progress.physicalBytes || 0;
    const speed = read && Number.isFinite(progress.bytesPerSecond) ? `${formatBytes(progress.bytesPerSecond)}/с` : "—";
    return `Средняя скорость чтения и анализа: ${speed} · фактически прочитано: ${formatBytes(read)} · сохранено по ходу: ${progress.savedFiles || 0} · восстановлено: ${progress.recoveredFiles || 0}.`;
  }

  function updateLogImportProgress(progress, force = false) {
    ui.logImportProgress = progress;
    const phase=progress.phase==="classifying"?"classifying":progress.phase==="analyzing"?"analyzing":progress.phase==="saving"||progress.phase==="summarizing"?"publishing":"preparing";
    advanceImport("logs",{phase,done:phase==="classifying"?progress.processed:phase==="analyzing"?progress.bytesRead:0,total:phase==="classifying"?progress.total:phase==="analyzing"?progress.totalBytes:100,caption:{classifying:"Проверка файлов",analyzing:"Чтение, анализ и сохранение логов",publishing:"Публикация аналитики в БД",preparing:"Подготовка импорта"}[phase]},false);
    const now = Date.now();
    if (!force && now - logImportLastProgressAt < 250) return;
    logImportLastProgressAt = now;
    refreshOperationStrip();
    const label = app.querySelector("[data-log-import-progress]");
    if (label) label.textContent = logImportProgressText(progress);
    const speed = app.querySelector("[data-log-import-speed]");
    if (speed) speed.textContent = logImportSpeedText(progress);
    const meter = app.querySelector("[data-log-import-meter]");
    if (meter) {
      if(["preparing","summarizing","saving"].includes(progress.phase))meter.removeAttribute("value");
      else meter.value=progress.phase==="classifying"?(progress.total?progress.processed/progress.total*100:0):(progress.totalBytes?Math.min(99,progress.bytesRead/progress.totalBytes*100):0);
    }
  }

  function setLogImportFeedback(message,type="info") {
    ui.logImportFeedback=message?{message,type}:null;
    if(message)ui.lastOperation={message,type};
    refreshOperationStrip();
    const element=app.querySelector("[data-log-import-feedback]");
    if(!element)return;
    element.hidden=!message;element.textContent=message||"";
    element.className=type==="error"?"error-panel":type==="warning"?"warning-panel":"info-panel";
  }

  function formatPollingEta(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "рассчитывается";
    if (seconds < 60) return `${Math.ceil(seconds)} с`;
    if(seconds>=86400)return `${Math.floor(seconds/86400)} д ${Math.floor(seconds%86400/3600)} ч`;
    if(seconds>=3600)return `${Math.floor(seconds/3600)} ч ${Math.floor(seconds%3600/60)} мин`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.ceil(seconds % 60);
    return `${minutes} мин ${remainingSeconds} с`;
  }

  function renderRecovery() {
    return `
      <main id="main-content" class="login-shell" tabindex="-1">
        <section class="login-card" aria-labelledby="recovery-title">
          <div class="brand-mark" aria-hidden="true">SR</div>
          <h1 id="recovery-title">Локальное состояние повреждено</h1>
          <p class="muted">Приложение не перезаписало исходное значение. Можно скачать его для диагностики либо явно создать чистое локальное состояние.</p>
          <div class="error-panel" role="alert">${escapeHtml(recovery.reason)}</div>
          <div class="button-row">
            <button class="button secondary" type="button" data-download-corrupt>Скачать исходное значение</button>
            <button class="button danger" type="button" data-reset-corrupt>Создать чистое состояние</button>
          </div>
        </section>
      </main>`;
  }

  function renderLogin() {
    return `
      <main id="main-content" class="login-shell" tabindex="-1">
        <section class="login-card" aria-labelledby="login-title">
          <div class="brand-mark" aria-hidden="true">SR</div>
          <h1 id="login-title">MVP_SPHERE_SR</h1>
          <p class="page-subtitle">Локальный сеанс Администратора МЦТП</p>
          ${renderMessage()}
          <p class="muted">Учётные данные вводятся в модуле «Загрузка данных и опрос устройств» перед автоматическим опросом и действуют только в текущем сеансе.</p>
          <div class="button-row"><button class="button primary" type="button" data-start-local-session>Продолжить</button></div>
        </section>
      </main>`;
  }

  function renderShell(user) {
    return `
      <div class="app-shell">
        <aside class="sidebar">
          <div class="sidebar-brand">MVP_SPHERE_SR</div>
          <nav class="nav-list" aria-label="Основная навигация">
            ${PRODUCT_CATALOG.buildNavigation().map((item) => item.children?.length ? renderNavigationGroup(item) : navButton(item.route, item.title)).join("")}
          </nav>
        </aside>
        <div class="workspace">
          <section data-operation-strip class="operation-strip" role="status" hidden></section>
          <main id="main-content" class="page" tabindex="-1">
            ${renderMessage()}
            ${renderRoute(user)}
          </main>
        </div>
      </div>`;
  }

  function renderRoute(user) {
    const descriptor = MODULE_CATALOG.find((item) => item.route === ui.route) || MODULE_CATALOG.find((item) => item.route === "dashboard");
    if(launchMode.kind==="local" && !dbViews)return '<header class="page-header"><h1>Нужно обновить локальный runtime</h1></header><section class="card warning-panel"><p>Файлы интерфейса обновлены, но локальный процесс не поддерживает новый DB-first экран. Прежняя база не изменена.</p><p>Сначала дождитесь сохранения текущей работы и завершения опросов в старой вкладке. Затем запустите инструмент заново через launcher, а не только обновлением страницы браузера.</p></section>';
    if(dbViews && launchMode.kind==="local" && ui.adminAccess?.adminUnlocked!==true && !["upload","reference","settings"].includes(descriptor.renderer)) {
      return '<section class="db-section db-empty"><h1>Данные рабочей базы защищены</h1><p>Войдите в локальный доступ в модуле загрузки. После входа сохранённая база подключится автоматически.</p><button class="button primary" type="button" data-route="upload">Войти и подключить базу</button></section>';
    }
    if (ui.dbPrepare && !["reference","planned"].includes(descriptor.renderer)) return `<header class="page-header"><h1>Подготовка базы</h1></header><section class="card db-preparation" role="status"><h2>Создаём быстрые индексы</h2><p>Исходные файлы не перечитываются. После этого рабочие экраны будут получать страницы и сводки прямо из SQLite. Справочник доступен уже сейчас.</p><progress max="${Math.max(1,ui.dbPrepare.total)}" value="${ui.dbPrepare.processed}"></progress><p>${ui.dbPrepare.processed} из ${ui.dbPrepare.total || "…"} порций. Если браузер закроется, подготовку можно продолжить.</p></section>`;
    if (ui.dbMode && ["dashboard","reboots","project-versions","firmware-versions","connection-errors","equipment","inventory"].includes(descriptor.renderer)) {
      return dbViews.render({ ...descriptor, category: INVENTORY_ROUTE[descriptor.route]?.category });
    }
    if(ui.dbMode && !(descriptor.renderer==="upload"&&ui.dbSourcesVisible))dbViews.deactivate();
    if (ui.dbMode && descriptor.renderer==="upload" && ui.dbOperationalRevision!==dbViews.revision) {
      if(!ui.dbOperationLoading && !ui.dbOperationalError) void loadOperationalContext();
      return ui.dbOperationalError ? '<section class="card error-panel"><h2>Не удалось получить актуальную SR</h2><p>Запуск с неполным набором целей заблокирован.</p><div class="button-row"><button type="button" class="button secondary" data-db-context-retry>Повторить</button><button type="button" class="button secondary" data-workspace-choose>Подключить рабочую папку</button></div></section>'
        : '<header class="page-header"><h1>Загрузка данных и опрос устройств</h1></header><section class="card" role="status"><h2>Получаем актуальные цели из базы…</h2><p>История JSON и события не загружаются. Сетевые запросы к устройствам не выполняются.</p></section>';
    }
    if (descriptor.renderer === "reference") return renderReference();
    if (descriptor.renderer === "settings" && ui.dbMode) {
      const counts=dbViews.bootstrap?.counts || {};
      return `<header class="page-header"><h1>Локальное хранилище</h1></header><section class="db-section"><h2>Рабочая база SQLite</h2><p class="mono break-word">${escapeHtml(ui.workspaceStatus?.path)}</p><p>Интерфейс получает сводки и страницы. Полная история SR, JSON и событий не восстанавливается в память вкладки.</p><p>Устройств в истории: ${counts.inventoryDevices||0} · JSON: ${counts.pollingResults||0} · логов: ${counts.logRows||0}</p><p class="muted">Оригиналы логов и пароли не копируются. Ранее сохранённые порции остаются в этой же папке.</p></section>`;
    }
    if (descriptor.renderer === "settings") return renderSettings(user);
    if (descriptor.renderer === "upload") return renderUpload() + (ui.dbMode ? `<section class="db-section section-gap"><div class="section-heading"><h2>Источники в базе</h2><button type="button" class="button secondary" data-db-sources>${ui.dbSourcesVisible?"Скрыть":"Показать логи"} · ${dbViews.bootstrap?.counts?.logRows||0}</button></div>${ui.dbSourcesVisible?dbViews.render({route:"log-sources",renderer:"logs",title:"Метаданные импортированных логов",compact:true}):""}</section>` : "");
    if (descriptor.renderer === "reboots") return renderReboots();
    if (descriptor.renderer === "project-versions") return renderVersionModule("project");
    if (descriptor.renderer === "firmware-versions") return renderVersionModule("firmware");
    if (descriptor.renderer === "connection-errors") return renderConnectionErrors();
    if (descriptor.renderer === "planned") return renderPlannedModule(descriptor);
    if (descriptor.renderer === "equipment") return renderEquipmentOverview();
    if (descriptor.renderer === "inventory") return renderInventoryRoute(descriptor.route);
    return renderDashboard();
  }

  function renderPlannedModule(descriptor) {
    return `<header class="page-header"><div><h1>${escapeHtml(descriptor.title)}</h1></div><button class="button secondary" type="button" data-help-topic="${escapeHtml(descriptor.helpId)}">О модуле</button></header><section class="card"><span class="badge warning">${escapeHtml(UI_TERMS.moduleStatuses[descriptor.status])}</span><p>${escapeHtml(descriptor.details)}</p></section>`;
  }

  function navButton(route, label) {
    const active = ui.route === route ? " active" : "";
    return `<button class="nav-button${active}" type="button" data-route="${route}">${escapeHtml(label)}</button>`;
  }

  function renderNavigationGroup(item) {
    return renderEquipmentNavigationGroup(item, ui);
  }

  function renderEquipmentOverview() {
    const counts = Object.fromEntries(EQUIPMENT_CATEGORY_IDS.map((category) => [category, state.inventoryDevices.filter((device) => device.inCurrentSr !== false && device.category === category).length]));
    return `<header class="page-header"><div><h1>Оборудование</h1></div><button class="button secondary" type="button" data-help-topic="${HELP_TOPIC_BY_ROUTE.equipment}">О модуле</button></header><section class="equipment-category-grid">${EQUIPMENT_CATEGORY_CATALOG.map((item) => `<article class="card"><h2>${escapeHtml(item.title)}</h2><strong class="stat-value">${counts[item.id]}</strong><p class="muted">Устройств в актуальной SR</p><button class="button secondary" type="button" data-route="${item.route}">Открыть</button></article>`).join("")}</section>`;
  }

  function renderMessage() {
    if (!ui.message) return "";
    if (ui.route === "upload" && ui.message.type === "success") return "";
    const type = ["error", "success", "warning", "info"].includes(ui.message.type) ? ui.message.type : "info";
    return `<div class="${type}-panel" role="${type === "error" ? "alert" : "status"}" aria-live="${type === "error" ? "assertive" : "polite"}">${escapeHtml(ui.message.text)}</div>`;
  }

  function renderDashboard() {
    const summary = getDashboardSummary(state, ui.dashboardFilters);
    const header = `<header class="page-header dashboard-header"><div><h1>Главный экран</h1></div><div class="button-row"><button class="button primary" type="button" data-route="upload">Запустить опрос</button><button class="button secondary" type="button" data-route="upload">Загрузить данные</button><button class="button secondary" type="button" data-help-topic="${HELP_TOPIC_BY_ROUTE.dashboard}">О модуле</button></div></header>`;
    const filterPanel = renderDashboardFilters(ui.dashboardFilters);
    if (!summary.valid) return `${header}${filterPanel}<div class="error-panel section-gap" role="alert">${escapeHtml(summary.errors.join("; "))}</div>`;
    if (summary.emptyState === "no_sr") return `${header}<section class="empty-state dashboard-empty"><h2>Нет данных SR</h2><p>Для начала работы загрузите локальную выгрузку SR в формате XLSX. Данные останутся на этом компьютере.</p><button class="button primary" type="button" data-route="upload">Загрузить выгрузку SR</button></section>`;
    const sr = summary.context.sr;
    const run = summary.context.latestRun;
    const noPolling = summary.emptyState === "no_polling" ? `<div class="info-panel section-gap"><strong>Данные опросов пока отсутствуют.</strong> Перечень оборудования показан по SR; устройства не считаются ошибочными.</div>` : "";
    return `${header}
      <section class="dashboard-context" aria-label="Контекст данных">
        <div><span class="eyebrow">Актуальная выгрузка SR</span><strong>${escapeHtml(formatDateTime(sr?.importedAt))}</strong><small>${escapeHtml(sr?.filename || "Имя недоступно")} · ${Number(sr?.rowCount) || 0} строк</small></div>
        <div><span class="eyebrow">Последний запуск опроса</span><strong>${run ? escapeHtml(formatDateTime(run.capturedAt)) : "Нет запусков"}</strong><small>${run ? `${escapeHtml(dashboardRunLabel(run))} · ${run.deviceCount} устройств` : "Результаты ещё не импортированы"}</small></div>
        <div><span class="eyebrow">Последние данные</span><strong>${summary.freshness.latestTimestamp ? escapeHtml(formatDateTime(summary.freshness.latestTimestamp)) : "Нет данных"}</strong><small>${summary.freshness.latestTimestamp ? escapeHtml(formatAge(summary.freshness.latestTimestamp)) : "Возраст данных неизвестен"}</small></div>
      </section>
      ${filterPanel}${noPolling}
      <section class="dashboard-section" aria-labelledby="inventory-kpi"><div class="section-heading"><div><p class="eyebrow">Последнее состояние</p><h2 id="inventory-kpi">Инвентарь</h2></div><span class="badge info">${summary.inventory.locations} локаций</span></div>
        <div class="dashboard-kpi-grid equipment-dashboard-grid">
          ${dashboardRouteKpi("Всего оборудования", summary.inventory.total, "Актуальные устройства семи категорий", "equipment")}
          ${EQUIPMENT_CATEGORY_CATALOG.map((item) => dashboardRouteKpi(item.title, summary.inventory.byCategory[item.id], "Устройств в актуальной SR", item.route)).join("")}
        </div>
      </section>
      <section class="dashboard-section" aria-labelledby="coverage-kpi"><div class="section-heading"><div><p class="eyebrow">Последнее состояние</p><h2 id="coverage-kpi">Покрытие опросом</h2></div><span class="muted">Каждое устройство учитывается один раз по последним данным</span></div>
        <div class="dashboard-kpi-grid operational-grid">
          ${dashboardMetricKpi("Успешно", summary.coverage.success, "Последний результат успешен", "success", summary, "success")}
          ${dashboardMetricKpi("Ошибки", summary.coverage.failed, "Последний опрос завершился ошибкой", "critical", summary, "failed")}
          ${dashboardMetricKpi(tooltipLabel("Нет ответа по сети", "noNetwork", "status-no-network"), summary.problems.currentPingFailures, "Нет ответа по последним данным", "critical", summary, "pingFailures", true)}
          ${dashboardMetricKpi(tooltipLabel("Не опрашивалось", "notPolled", "status-not-polled"), summary.coverage.notPolled, "Устройство есть в SR, но результаты отсутствуют", "warning", summary, "notPolled", true)}
          ${dashboardMetricKpi("Автоматический опрос не поддерживается", summary.coverage.unsupported, "Нет подтверждённого механизма опроса", "neutral", summary, "unsupported")}
          ${dashboardRouteKpi("Опрошено", summary.coverage.everPolled, `В последнем запуске: ${summary.coverage.inLatestRun}`, null)}
        </div>
      </section>
      <section class="attention-panel dashboard-section" aria-labelledby="attention-kpi"><div class="section-heading"><div><p class="eyebrow">Требует внимания</p><h2 id="attention-kpi">Текущие проблемы</h2></div><span class="badge ${summary.problems.currentFailures ? "critical" : "success"}">${summary.problems.currentFailures ? `${summary.problems.currentFailures} устройств` : "Известных ошибок нет"}</span></div>
        <div class="attention-grid"><div><strong>${summary.problems.currentPingFailures}</strong><span>Нет ответа по сети</span></div><div><strong>${summary.problems.currentFailures}</strong><span>Ошибки оборудования</span></div><div><strong>${summary.problems.unmatched}</strong><span>Не найдено в SR</span></div><div><strong>${summary.problems.dataErrors}</strong><span>Ошибки данных</span></div></div>
      </section>
      <div class="dashboard-main-grid section-gap">
        <section class="card"><div class="section-heading"><div><p class="eyebrow">Выбранный период</p><h2>Активность: ${escapeHtml(summary.period.label)}</h2></div></div><ul class="data-list"><li><span>Результаты опроса</span><strong>${summary.periodMetrics.results}</strong></li><li><span>Неуспешные результаты</span><strong>${summary.periodMetrics.failedResults}</strong></li><li><span>Устройства без ответа по сети</span><strong>${summary.periodMetrics.pingFailures}</strong></li><li><span>${tooltipLabel("Устройства с изменениями", "changedDevices", "metric-changed-devices")}</span><strong>${summary.periodMetrics.changedDevices}</strong></li><li><span>Обнаруженные изменения</span><strong>${summary.periodMetrics.changes}</strong></li><li><span>Ошибки данных</span><strong>${summary.periodMetrics.dataErrors}</strong></li></ul><p class="muted">Эти показатели относятся к выбранному периоду и не заменяют показатели последнего состояния.</p></section>
        ${renderLatestRun(summary)}
        ${renderVipSummary(summary)}
      </div>
      <div class="dashboard-main-grid section-gap">
        ${renderDashboardProblems(summary)}
        ${renderDashboardChanges(summary)}
      </div>
      <section class="card section-gap"><div class="section-heading"><div><p class="eyebrow">Приоритет</p><h2>Локации, требующие внимания</h2></div></div>${renderAttentionLocations(summary)}</section>
      <div class="dashboard-main-grid section-gap">
        ${renderDistribution("По производителям", summary.distributions.manufacturers, summary.inventory.total)}
        ${renderDistribution("По моделям", summary.distributions.models, summary.inventory.total)}
        ${renderDistribution("По категориям", summary.distributions.categories, summary.inventory.total)}
      </div>
      <section class="card section-gap blocked-analytics"><h2>Дополнительная аналитика</h2><div class="blocked-grid"><div><strong>Авторизация</strong><span>Недостаточно данных</span></div><div><strong>${escapeHtml(MODULE_CATALOG.find((item) => item.route === "reboots").title)}</strong><span>Доступны в отдельном модуле</span><button class="text-button" type="button" data-route="reboots">Открыть аналитику</button></div><div><strong>GCPlus</strong><span>Требует уточнения</span></div><div><strong>Актуальность данных</strong><span>Порог не настроен</span></div></div></section>`;
  }

  function renderRebootFilters(filters, analytics) {
    const devices = state.inventoryDevices.filter((item) => item.inCurrentSr !== false);
    const values = (field) => [...new Set(devices.map((item) => item[field]).filter(Boolean))];
    const locationIds = new Set(devices.map((item) => item.locationId).filter(Boolean));
    const locations = state.locations.filter((item) => locationIds.has(item.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
    const addresses = [...new Set(locations.map((item) => item.address).filter(Boolean))];
    return `<section class="card reboot-filters"><div class="section-heading"><div><p class="eyebrow">Область анализа</p><h2>Фильтры анализа</h2></div><button class="button secondary" type="button" data-clear-reboot-filters>Сбросить фильтры</button></div><form class="filter-grid reboot-filter-grid" data-reboot-filters>
      <div class="field"><label>Период событий</label><select name="period"><option value="all"${filters.period === "all" || !filters.period ? " selected" : ""}>Вся история</option><option value="today"${filters.period === "today" ? " selected" : ""}>Сегодня</option><option value="7d"${filters.period === "7d" ? " selected" : ""}>7 дней</option><option value="30d"${filters.period === "30d" ? " selected" : ""}>30 дней</option><option value="custom"${filters.period === "custom" ? " selected" : ""}>Произвольный</option></select></div>
      <div class="field"><label>Дата от</label><input type="date" name="dateFrom" value="${escapeHtml(filters.dateFrom || "")}"></div><div class="field"><label>Дата до</label><input type="date" name="dateTo" value="${escapeHtml(filters.dateTo || "")}"></div>
      <div class="field"><label>Порог тишины логов, минут<input type="number" name="logSilenceMinutes" min="15" max="10080" step="1" value="${escapeHtml(filters.logSilenceMinutes ?? "60")}" required></label></div>
      <div class="field"><label>Категория</label><select name="category"><option value="">Все</option>${EQUIPMENT_CATEGORY_CATALOG.map((item) => `<option value="${item.id}"${filters.category === item.id ? " selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select></div>
      <div class="field"><label>Домен</label><select name="domain">${filterOptions(values("domain"), filters.domain)}</select></div>
      <div class="field"><label>VIP</label><select name="vip"><option value="">Все</option><option value="yes"${filters.vip === "yes" ? " selected" : ""}>VIP</option><option value="no"${filters.vip === "no" ? " selected" : ""}>Не VIP</option></select></div>
      <div class="field"><label>Производитель</label><select name="manufacturer">${filterOptions(values("manufacturerRaw"), filters.manufacturer)}</select></div><div class="field"><label>Модель</label><select name="model">${filterOptions(values("modelRaw"), filters.model)}</select></div>
      <div class="field"><label>Локация</label><select name="locationId"><option value="">Все</option>${locations.map((item) => `<option value="${escapeHtml(item.id)}"${filters.locationId === item.id ? " selected" : ""}>${escapeHtml(item.name || "Без названия")}</option>`).join("")}</select></div>
      <div class="field"><label>Адрес</label><select name="address">${filterOptions(addresses, filters.address)}</select></div>
      <div class="button-row"><button class="button primary" type="submit">Применить фильтры</button></div>
    </form>${analytics?.coverage ? `<p class="muted reboot-coverage">Пригодных файлов: ${analytics.coverage.eligibleObservations}; устройств с рассчитанным временем запуска: ${analytics.coverage.devicesWithComparablePairs}; исключено: ${analytics.coverage.excludedResults}.</p>` : ""}</section>`;
  }

  function renderRebootChart(title, rows, options = {}) {
    const visible = options.includeZero ? rows : rows.filter((item) => item.count > 0);
    const limited = visible.slice(0, options.limit || 15);
    const maximum = Math.max(1, ...visible.map((item) => item.count));
    return `<figure class="card reboot-chart">${options.hideTitle ? "" : `<figcaption><h2>${escapeHtml(title)}</h2>${visible.length > limited.length ? `<small>Показано ${limited.length} из ${visible.length}; итоги рассчитаны по полной выборке.</small>` : ""}</figcaption>`}${limited.length ? `<div class="reboot-bars">${limited.map((item) => `<div class="reboot-bar-row"><span title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span><progress max="${maximum}" value="${item.count}">${item.count}</progress><strong>${item.count}</strong></div>`).join("")}</div>` : `<p class="muted">Событий нет.</p>`}</figure>`;
  }

  function rebootEmptyMessage(kind) {
    return {
      no_sr: "Сначала загрузите актуальную выгрузку SR.",
      no_polling: "Результаты опросов пока не загружены.",
      insufficient: "В файлах нет одновременно поддерживаемых Device Status.Date и Device Status.Uptime.",
      no_events: "Пригодные файлы проанализированы, расчётных перезагрузок не выявлено.",
      filtered_empty: "Рассчитанные события есть, но не входят в выбранные фильтры."
    }[kind] || "";
  }

  function formatRebootTimestamp(value, event) {
    const date = new Date(value || 0);
    if (!Number.isFinite(date.getTime())) return "Данные отсутствуют";
    if (event?.timeBasis !== "device_local_unknown_timezone") return formatDateTime(value);
    const pad = (part) => String(part).padStart(2, "0");
    return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  }

  function renderRebootCard(title, value, view, previewRows) {
    const content = Array.isArray(previewRows)
      ? previewRows.length
        ? `<span class="reboot-top-list" role="list">${previewRows.map((item) => `<span class="reboot-top-item" role="listitem"><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}</span>`).join("")}</span>`
        : `<span class="muted">Данных нет</span>`
      : `<strong>${escapeHtml(value)}</strong>`;
    return `<button class="card reboot-drill-card${ui.rebootView === view ? " selected" : ""}" type="button" data-reboot-view="${view}" aria-expanded="${ui.rebootView === view}"><span>${escapeHtml(title)}</span>${content}<small>Открыть данные <span aria-hidden="true">↗</span></small></button>`;
  }

  function renderRebootTable(headers, rows) {
    return rows.length ? `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>` : `<p class="muted">В выбранной области данных нет.</p>`;
  }

  function formatLogSources(event, markerLabel = "признак") {
    const examples = (event.sources || []).map((source) => `${source.path}:${source.line}${source.markerLines?.length ? ` (${markerLabel}: ${source.markerLines.join(", ")})` : ""}`);
    const omitted = Math.max(0, Number(event.sourceCount || examples.length) - examples.length);
    return examples.join("; ") + (omitted ? `; ещё ${omitted} повторных источников` : "");
  }

  function renderRebootDetail(analytics) {
    const view = ui.rebootView;
    if (!view) return "";
    const details = analytics.details;
    const deviceRow = (item, showDates = false) => `<tr><td>${escapeHtml(item.deviceName)}</td><td>${item.count}</td>${showDates ? `<td>${item.rebootDates.map((date) => `${escapeHtml(date.date)}${date.count > 1 ? ` (${date.count})` : ""}`).join("<br>")}</td>` : ""}<td class="mono">${escapeHtml(item.ip)}</td><td class="mono">${escapeHtml(item.mac)}</td><td>${item.vip ? "Да" : "Нет"}</td><td>${escapeHtml(item.locationName)}</td><td>${escapeHtml(item.address)}</td></tr>`;
    const locationRow = (item, unique = false) => `<tr><td>${escapeHtml(item.locationName)}</td><td>${unique ? item.uniqueDeviceCount : item.count}</td><td>${escapeHtml(item.address)}</td><td>${escapeHtml(item.deviceNames.join(", ") || "Не указано")}</td></tr>`;
    const addressRow = (item, unique = false) => `<tr><td>${escapeHtml(item.address)}</td><td>${unique ? item.uniqueDeviceCount : item.count}</td><td>${escapeHtml(item.locationNames.join(", ") || "Не указано")}</td><td>${escapeHtml(item.deviceNames.join(", ") || "Не указано")}</td></tr>`;
    const deviceHeaders = ["Устройство", "Перезагрузки", "IP", "MAC", "VIP", "Локация", "Адрес"];
    const locationHeaders = ["Локация", "Перезагрузки", "Адрес", "Устройства"];
    const addressHeaders = ["Адрес", "Перезагрузки", "Локации", "Устройства"];
    const dateRows = (rows) => rows.map((item) => `<tr><td>${escapeHtml(item.date)}</td><td>${item.count}</td><td>${item.addresses.map((address) => `${escapeHtml(address.address)} — ${address.count}`).join("<br>")}</td></tr>`);
    const hourRows = (rows) => rows.map((item) => `<tr><td>${escapeHtml(item.hour)}:00–${escapeHtml(item.hour)}:59</td><td>${item.count}</td></tr>`);
    const hourDetailRows = (rows) => rows.flatMap((item) => item.locations.map((location, index) => `<tr>${index === 0 ? `<th scope="rowgroup" rowspan="${item.locations.length}">${escapeHtml(item.hour)}:00–${escapeHtml(item.hour)}:59</th><td rowspan="${item.locations.length}">${item.count}</td>` : ""}<td>${escapeHtml(location.locationName)}</td><td>${escapeHtml(location.address)}</td><td>${location.count}</td><td>${location.devices.map((device) => `${escapeHtml(device.deviceName)} (${escapeHtml(device.ip)}) — ${device.count}`).join("<br>")}</td></tr>`));
    const eventRow = (event) => `<tr><td>${escapeHtml(formatRebootTimestamp(event.estimatedAt, event))}</td><td>${escapeHtml(event.deviceName)}</td><td class="mono">${escapeHtml(event.ip)}</td><td>${escapeHtml(event.locationName)}<br><small>${escapeHtml(event.address)}</small></td><td>${event.evidenceResultIds?.length || 1}</td><td>${event.confidence === "confirmed" ? "Date − Uptime" : "Резервное время"}</td></tr>`;
    const views = {
      events: ["Выявленные события", () => renderAnalyticsPage("rebootEvents", ["Расчётное время", "Устройство", "IP", "Локация и адрес", "Файлов", "Основание"], analytics.events, eventRow)],
      devices: ["Количество перезагруженных устройств", () => renderRebootTable(deviceHeaders, details.devices.map(deviceRow))],
      locations: ["Затронутые локации", () => renderRebootTable(locationHeaders, details.locations.map((item) => locationRow(item)))],
      topDates: ["TOP 5 дат по перезагрузкам", () => renderRebootTable(["Дата", "Перезагрузки", "Адреса и число событий"], dateRows(details.topDates))],
      topHours: ["TOP 5 часов за сутки по перезагрузкам", () => renderRebootTable(["Интервал", "Всего перезагрузок", "Локация", "Адрес", "Перезагрузки в локации", "Устройства"], hourDetailRows(details.topHours))],
      topDevices: ["TOP 5 перезагрузок по устройствам", () => renderRebootTable(["Устройство", "Перезагрузки", "Даты перезагрузок", "IP", "MAC", "VIP", "Локация", "Адрес"], details.topDevices.map((item) => deviceRow(item, true)))],
      topLocations: ["TOP 5 локаций по количеству перезагруженных устройств", () => renderRebootTable(["Локация", "Устройств", "Адрес", "Наименования устройств"], details.topLocationsByDevices.map((item) => locationRow(item, true)))],
      topAddresses: ["TOP 5 адресов с перезагруженными устройствами", () => renderRebootTable(["Адрес", "Устройств", "Локации", "Устройства"], details.topAddressesByDevices.map((item) => addressRow(item, true)))],
      byDate: ["Динамика по датам", () => `${renderRebootChart("Динамика по датам", analytics.byDate, { limit: 31, hideTitle: true })}${renderRebootTable(["Дата", "Перезагрузки", "Адреса"], dateRows([...details.dates].sort((left, right) => left.date.localeCompare(right.date))))}`],
      byHour: ["Помещение по часам", () => `${renderRebootChart("Распределение по часам", analytics.byHour, { limit: 24, includeZero: true, hideTitle: true })}${renderRebootTable(["Час", "Перезагрузки"], hourRows(analytics.byHour.map((item) => ({ hour: item.label, count: item.count }))))}`],
      byDevice: ["Устройства", () => renderRebootTable(deviceHeaders, details.devices.map(deviceRow))],
      byLocation: ["Локации", () => renderRebootTable(locationHeaders, details.locations.map((item) => locationRow(item)))],
      byAddress: ["Адреса", () => renderRebootTable(addressHeaders, details.addresses.map((item) => addressRow(item)))]
    };
    const selected = views[view];
    if (!selected) return "";
    return `<section class="card reboot-detail section-gap" id="reboot-detail" aria-live="polite"><div class="section-heading"><h2>${escapeHtml(selected[0])}</h2><button class="button secondary" type="button" data-close-reboot-view>Закрыть</button></div>${selected[1]()}</section>`;
  }

  function renderHuaweiTeLogAnalytics(analytics, mode = "reboots") {
    if (!analytics.valid) return `<div class="error-panel section-gap" role="alert">${escapeHtml(analytics.errors.join("; "))}</div>`;
    const coverage = analytics.coverage;
    if (!coverage?.files) return `<section class="card section-gap"><h2>Терминалы ВКС Huawei: события из логов</h2><p class="muted">Импортируйте общую папку логов в разделе «Загрузка данных и опрос устройств».</p></section>`;
    if (analytics.stale) return `<section class="card section-gap"><h2>Терминалы ВКС Huawei: события из логов</h2><p class="warning-panel">Выгрузка SR изменилась. Импортируйте папку логов повторно для точного сопоставления устройств.</p></section>`;
    const eventRows = (events) => events.slice(0, 100).map((event) => `<tr><td>${escapeHtml(formatRebootEventTime(event))}</td><td>${escapeHtml(event.deviceName)}</td><td>${escapeHtml(event.model)}</td><td class="mono">${escapeHtml(event.ip)}</td><td>${escapeHtml(event.locationName)}</td><td>${escapeHtml(event.address)}</td><td>${event.shutdownMethod === "remote_control" ? "Пульт ДУ" : event.shutdownMethod === "web" ? "Web" : "—"}</td><td>${event.kind === "suspected_power_loss" ? `${escapeHtml(event.silenceGap.minutes)} мин; ${escapeHtml(event.silenceGap.fromLocalAt)}–${escapeHtml(event.silenceGap.toLocalAt)}` : "—"}</td><td>${event.confidence === "low" ? "Низкая" : "—"}</td><td>${escapeHtml(formatLogSources(event, "признак"))}</td></tr>`);
    const table = (group) => `${renderRebootTable(["Локальное время терминала", "Устройство", "Модель", "IP", "Локация", "Адрес", "Способ выключения", "Пауза без логов", "Достоверность", "Файл и строка"], eventRows(group.events))}${group.events.length > 100 ? `<p class="muted">Показаны первые 100 событий из ${group.events.length}; итоги рассчитаны по всем событиям.</p>` : ""}`;
    const section = (title, group, note) => `<section class="card section-gap"><div class="section-heading"><div><p class="eyebrow">Терминалы ВКС Huawei</p><h2>${escapeHtml(title)}</h2></div></div><p class="muted">${escapeHtml(note)}</p><div class="dashboard-kpi-grid reboot-kpi-grid"><div class="card"><span>Событий</span><strong>${group.count}</strong></div><div class="card"><span>Устройств</span><strong>${group.affectedDevices}</strong></div><div class="card"><span>Локаций</span><strong>${group.affectedLocations}</strong></div></div><div class="reboot-chart-grid section-gap">${renderRebootChart("По датам", group.byDate, { limit: 31 })}${renderRebootChart("По часам", group.byHour, { limit: 24 })}</div><div class="reboot-leader-grid section-gap">${renderRebootChart("TOP 5 устройств", group.topDevices, { limit: 5 })}${renderRebootChart("TOP 5 локаций", group.topLocations, { limit: 5 })}${renderRebootChart("TOP 5 адресов", group.topAddresses, { limit: 5 })}</div>${table(group)}</section>`;
    return `<section class="section-gap"><p class="muted">Проверено файлов: ${coverage.scannedFiles} из ${coverage.files}; исключено: ${coverage.excludedFiles}; ошибки разбора: ${coverage.invalidFiles}. Время показано как локальное время терминала без подтверждённого часового пояса. Порог предположения: ${analytics.silenceMinutes} мин.</p>${coverage.te20Files ? `<p class="info-panel">Для TE20 подтверждённая перезагрузка требует пары «web reboots → System boot»; штатное выключение определяется отдельной web-записью или записью пульта ДУ.</p>` : ""}
      ${mode === "reboots" ? section("Подтверждённые перезагрузки терминалов ВКС", analytics.groups.confirmed_reboot, "TE20: web reboots и последующий System boot; TE30/40/50/60: System start с явным normal reboot. Повторные выгрузки объединяются.") : ""}
      ${mode === "power" ? section("Зафиксированные штатные выключения терминалов ВКС", analytics.groups.power_off, "Учитываются только отдельные записи о выключении: для TE20 — web или пульт ДУ, для TE30/40/50/60 — Terminal powered off. Они не доказывают аварийную потерю электропитания.") : ""}
      ${mode === "power" ? section("Предполагаемые отключения питания терминалов ВКС", analytics.groups.suspected_power_loss, "Низкая достоверность: после длительной паузы в логе появился запуск без подтверждённой команды перезагрузки или выключения. Время события — время возобновления лога, не доказанный момент потери питания. Пауза может объясняться отсутствием событий, неполным логом или изменением часов; эти случаи не входят в подтверждённые итоги.") : ""}
      ${mode === "reboots" ? `<details class="card section-gap"><summary>Запуски с неустановленной причиной — ${analytics.groups.unknown_start.count}</summary><p class="muted">Эти запуски не прибавляются к подтверждённым перезагрузкам.</p>${table(analytics.groups.unknown_start)}</details>` : ""}</section>`;
  }

  function renderHuawei310LogAnalytics(analytics, mode = "reboots") {
    if (!analytics.valid) return `<div class="error-panel section-gap" role="alert">${escapeHtml(analytics.errors.join("; "))}</div>`;
    const coverage = analytics.coverage;
    if (!coverage?.files) return `<section class="card section-gap"><h2>Huawei CloudLink 310: события из логов</h2><p class="muted">Импортируйте папку логов Bar 310, Box 310 или Box 610 в модуле загрузки.</p></section>`;
    if (analytics.stale) return `<section class="card section-gap"><h2>Huawei CloudLink 310: события из логов</h2><p class="warning-panel">Выгрузка SR изменилась. Импортируйте папку логов повторно.</p></section>`;
    const table = (group) => `${renderRebootTable(["Локальное время терминала", "Устройство", "Модель", "IP", "Локация", "Адрес", "Способ", "Файл и строка"], group.events.slice(0, 100).map((event) => `<tr><td>${escapeHtml(formatRebootEventTime(event))}</td><td>${escapeHtml(event.deviceName)}</td><td>${escapeHtml(event.model)}</td><td class="mono">${escapeHtml(event.ip)}</td><td>${escapeHtml(event.locationName)}</td><td>${escapeHtml(event.address)}</td><td>${event.actionMethod === "remote_control" ? "Пульт ДУ" : event.actionMethod === "web" ? "Web" : "—"}</td><td>${escapeHtml(formatLogSources(event, "команда"))}</td></tr>`))}${group.events.length > 100 ? `<p class="muted">Показаны первые 100 событий из ${group.events.length}; итоги рассчитаны по всем событиям.</p>` : ""}`;
    const group = analytics.groups.confirmed_reboot;
    const shutdowns = analytics.groups.power_off;
    return `<section class="section-gap"><h2>Huawei CloudLink 310: события из логов</h2><p class="muted">Проверено журналов Bar 310 / Box 310 / Box 610: ${coverage.scannedFiles}, в том числе Box: ${coverage.boxFiles}; исключено: ${coverage.excludedFiles}; ошибки: ${coverage.invalidFiles}. Время — локальное время терминала, без подтверждённого часового пояса.</p>
      ${mode === "reboots" ? `<section class="card section-gap"><h2>Подтверждённые перезагрузки Huawei 310</h2><p class="muted">Bar 310, Box 310 и Box 610: успешная web-команда и следующий System boot либо два события кнопки пульта в пределах 30 секунд и следующий boot без команды выключения. Внутренние restart не учитываются; Box подтверждены администратором.</p><div class="dashboard-kpi-grid reboot-kpi-grid"><div class="card"><span>Событий</span><strong>${group.count}</strong></div><div class="card"><span>Устройств</span><strong>${group.affectedDevices}</strong></div><div class="card"><span>Локаций</span><strong>${group.affectedLocations}</strong></div></div><div class="reboot-chart-grid section-gap">${renderRebootChart("По датам", group.byDate, { limit: 31 })}${renderRebootChart("По часам", group.byHour, { limit: 24 })}</div><div class="reboot-leader-grid section-gap">${renderRebootChart("TOP 5 устройств", group.topDevices, { limit: 5 })}${renderRebootChart("TOP 5 локаций", group.topLocations, { limit: 5 })}${renderRebootChart("TOP 5 адресов", group.topAddresses, { limit: 5 })}</div>${table(group)}</section>` : ""}
      ${mode === "power" ? `<section class="card section-gap"><h2>Зафиксированные штатные выключения Huawei 310</h2><p class="muted">Web: команда «shut down terminal». Пульт ДУ: запись «user shut down terminal» после кнопки питания. Это не доказательство аварийной потери электропитания.</p><div class="dashboard-kpi-grid reboot-kpi-grid"><div class="card"><span>Событий</span><strong>${shutdowns.count}</strong></div><div class="card"><span>Устройств</span><strong>${shutdowns.affectedDevices}</strong></div><div class="card"><span>Локаций</span><strong>${shutdowns.affectedLocations}</strong></div></div><div class="reboot-chart-grid section-gap">${renderRebootChart("По датам", shutdowns.byDate, { limit: 31 })}${renderRebootChart("По часам", shutdowns.byHour, { limit: 24 })}</div>${table(shutdowns)}</section>` : ""}
      ${mode === "power" ? `<details class="card section-gap"><summary>Предполагаемые отключения питания Huawei 310 — ${analytics.groups.suspected_power_loss.count}</summary><p class="muted">Низкая достоверность: длинная пауза перед запуском не доказывает отсутствие питания.</p>${table(analytics.groups.suspected_power_loss)}</details><details class="card section-gap"><summary>Запуски Huawei 310 после штатного выключения — ${analytics.groups.start_after_shutdown.count}</summary><p class="muted">Команда выключения и новый запуск есть в журнале; это не отдельная перезагрузка.</p>${table(analytics.groups.start_after_shutdown)}</details>` : ""}
      ${mode === "reboots" ? `<details class="card section-gap"><summary>Запуски Huawei 310 с неустановленной причиной — ${analytics.groups.unknown_start.count}</summary><p class="muted">Не прибавляются к подтверждённым перезагрузкам.</p>${table(analytics.groups.unknown_start)}</details>` : ""}</section>`;
  }

  function renderHuawei300LogAnalytics(barAnalytics, boxAnalytics, mode = "reboots") {
    if (!barAnalytics.valid || !boxAnalytics.valid) return `<div class="error-panel section-gap" role="alert">${escapeHtml([...(barAnalytics.errors || []), ...(boxAnalytics.errors || [])].join("; "))}</div>`;
    const barCoverage = barAnalytics.coverage || {};
    const boxCoverage = boxAnalytics.coverage || {};
    if (!barCoverage.files && !boxCoverage.files) return `<section class="card section-gap"><h2>Huawei CloudLink 300: события из логов</h2><p class="muted">Импортируйте XML-журналы Bar 300, Box 300 или Box 600 вместе с актуальной выгрузкой SR.</p></section>`;
    if (barAnalytics.stale || boxAnalytics.stale) return `<section class="card section-gap"><h2>Huawei CloudLink 300: события из логов</h2><p class="warning-panel">Выгрузка SR изменилась. Импортируйте папку логов повторно.</p></section>`;
    const table = (events) => renderRebootTable(["Локальное время терминала", "Устройство", "Модель", "IP", "Локация", "Адрес", "Тип события", "Пауза без логов", "Достоверность", "Файл и строка"], events.slice(0, 100).map((event) => `<tr><td>${escapeHtml(formatRebootEventTime(event))}</td><td>${escapeHtml(event.deviceName)}</td><td>${escapeHtml(event.model)}</td><td class="mono">${escapeHtml(event.ip)}</td><td>${escapeHtml(event.locationName)}</td><td>${escapeHtml(event.address)}</td><td>${event.kind === "power_off" ? "Штатное выключение (Web)" : event.kind === "start_after_shutdown" ? "Запуск после выключения" : event.kind === "suspected_power_loss" ? "Предполагаемая пауза питания" : "Запуск, причина неизвестна"}</td><td>${event.kind === "suspected_power_loss" ? `${escapeHtml(event.silenceGap.minutes)} мин; ${escapeHtml(event.silenceGap.fromLocalAt)}–${escapeHtml(event.silenceGap.toLocalAt)}` : "—"}</td><td>${event.validationStatus === "provisional_user_validation" ? "Предварительно" : event.confidence === "low" ? "Низкая" : event.kind === "power_off" || event.kind === "start_after_shutdown" ? "Подтверждено" : "Причина неизвестна"}</td><td>${escapeHtml(formatLogSources(event, "команда"))}</td></tr>`)) + (events.length > 100 ? `<p class="muted">Показаны первые 100 событий из ${events.length}; итоги рассчитаны по всем.</p>` : "");
    const barUnknown = barAnalytics.groups.unknown_start;
    const barSuspected = barAnalytics.groups.suspected_power_loss;
    const boxUnknown = boxAnalytics.groups.unknown_start;
    const boxSuspected = boxAnalytics.groups.suspected_power_loss;
    const barPowerOff = barAnalytics.groups.power_off;
    const barStartsAfterShutdown = barAnalytics.groups.start_after_shutdown;
    const barGroup = mode === "power" ? barSuspected : barUnknown;
    const boxGroup = mode === "power" ? boxSuspected : boxUnknown;
    const boxPowerOff = boxAnalytics.groups.power_off;
    const boxStartsAfterShutdown = boxAnalytics.groups.start_after_shutdown;
    return `<section class="section-gap"><h2>Huawei CloudLink 300: события из логов</h2><p class="muted">Bar 300: проверено файлов ${barCoverage.scannedFiles || 0} из ${barCoverage.files || 0}; Box 300/600: ${boxCoverage.scannedFiles || 0} из ${boxCoverage.files || 0}. Ошибки разбора: ${(barCoverage.invalidFiles || 0) + (boxCoverage.invalidFiles || 0)}. Время локальное, часовой пояс не подтверждён.</p>
      <section class="card section-gap"><h2>${mode === "power" ? "Предполагаемые отключения питания Bar 300" : "Запуски Bar 300 с неустановленной причиной"}</h2><p class="muted">${mode === "power" ? `Пауза не менее ${barAnalytics.silenceMinutes} минут перед новым запуском — лишь низкодостоверное предположение, не доказательство пропажи напряжения. Она не учитывается в подтверждённых выключениях.` : "System boot подтверждает запуск, но не его причину. Общие слова reboot/restart не считаются командой перезагрузки; подтверждённых перезагрузок по этому правилу пока нет."}</p><div class="dashboard-kpi-grid reboot-kpi-grid"><div class="card"><span>${mode === "power" ? "Предположений" : "Неизвестных запусков"}</span><strong>${barGroup.count}</strong></div><div class="card"><span>Устройств</span><strong>${barGroup.affectedDevices}</strong></div><div class="card"><span>Локаций</span><strong>${barGroup.affectedLocations}</strong></div></div><div class="reboot-chart-grid section-gap">${renderRebootChart("По датам", barGroup.byDate, { limit: 31 })}${renderRebootChart("По часам", barGroup.byHour, { limit: 24 })}</div>${table(barGroup.events)}</section>
      ${mode === "power" ? `<section class="card section-gap"><h2>Подтверждённые штатные выключения Bar 300</h2><p class="muted">Отдельная web-команда «shut down terminal» проверена контролируемым выключением и последующим запуском. Это не аварийное исчезновение электропитания.</p><div class="dashboard-kpi-grid reboot-kpi-grid"><div class="card"><span>Событий</span><strong>${barPowerOff.count}</strong></div><div class="card"><span>Устройств</span><strong>${barPowerOff.affectedDevices}</strong></div><div class="card"><span>Локаций</span><strong>${barPowerOff.affectedLocations}</strong></div></div><div class="reboot-chart-grid section-gap">${renderRebootChart("По датам", barPowerOff.byDate, { limit: 31 })}${renderRebootChart("По часам", barPowerOff.byHour, { limit: 24 })}</div>${table(barPowerOff.events)}</section><details class="card section-gap"><summary>Запуски Bar 300 после штатного выключения — ${barStartsAfterShutdown.count}</summary><p class="muted">Команда выключения и следующий запуск есть в журнале; это не отдельная перезагрузка.</p>${table(barStartsAfterShutdown.events)}</details>` : ""}
      <section class="card section-gap"><h2>${mode === "power" ? "Предполагаемые отключения питания Box 300/600" : "Запуски Box 300/600 с неустановленной причиной"}</h2><p class="muted">${mode === "power" ? `Пауза не менее ${boxAnalytics.silenceMinutes} минут перед неизвестным запуском имеет низкую достоверность и не доказывает потерю напряжения. Администратор проверил событийную аналитику обеих моделей.` : "System boot не доказывает перезагрузку. Общие reboot/restart не входят в подтверждённый счётчик; администратор проверил событийную аналитику обеих моделей."}</p><div class="dashboard-kpi-grid reboot-kpi-grid"><div class="card"><span>${mode === "power" ? "Предположений" : "Неизвестных запусков"}</span><strong>${boxGroup.count}</strong></div><div class="card"><span>Устройств</span><strong>${boxGroup.affectedDevices}</strong></div><div class="card"><span>Локаций</span><strong>${boxGroup.affectedLocations}</strong></div></div><div class="reboot-chart-grid section-gap">${renderRebootChart("По датам", boxGroup.byDate, { limit: 31 })}${renderRebootChart("По часам", boxGroup.byHour, { limit: 24 })}</div>${table(boxGroup.events)}</section>
      ${mode === "power" ? `<section class="card section-gap"><h2>Штатные выключения Box 300/600</h2><p class="muted">Учитываются только журналы с точным web-маркером «shut down terminal». Администратор подтвердил событийный анализ обеих моделей; это не доказательство аварийной потери электропитания.</p><div class="dashboard-kpi-grid reboot-kpi-grid"><div class="card"><span>Событий</span><strong>${boxPowerOff.count}</strong></div><div class="card"><span>Устройств</span><strong>${boxPowerOff.affectedDevices}</strong></div><div class="card"><span>Локаций</span><strong>${boxPowerOff.affectedLocations}</strong></div></div><div class="reboot-chart-grid section-gap">${renderRebootChart("По датам", boxPowerOff.byDate, { limit: 31 })}${renderRebootChart("По часам", boxPowerOff.byHour, { limit: 24 })}</div>${table(boxPowerOff.events)}</section><details class="card section-gap"><summary>Запуски Box 300/600 после штатного выключения — ${boxStartsAfterShutdown.count}</summary><p class="muted">Запуск после команды выключения не считается перезагрузкой.</p>${table(boxStartsAfterShutdown.events)}</details>` : ""}</section>`;
  }

  function renderPowerDurationDashboard(data) {
    const selected = data.buckets.find((item) => item.id === ui.powerDurationBucket) || data.buckets.at(-1);
    let offset = 0;
    const sectors = data.buckets.filter((item) => item.count).map((item) => {
      const start = offset;
      offset += data.totalDevices ? item.count / data.totalDevices * 100 : 0;
      return `${item.color} ${start.toFixed(3)}% ${offset.toFixed(3)}%`;
    });
    sectors.push(`#dce7e7 ${offset.toFixed(3)}% 100%`);
    const donut = `conic-gradient(${sectors.join(", ")})`;
    const percent = data.totalDevices ? Math.round(selected.count / data.totalDevices * 1000) / 10 : 0;
    const duration = (seconds) => seconds >= 86400 ? `${(seconds / 86400).toFixed(1)} суток` : seconds >= 3600 ? `${(seconds / 3600).toFixed(1)} часа` : `${Math.round(seconds / 60)} минут`;
    const rows = selected.devices.slice(0, 100).map((item) => `<tr><td>${escapeHtml(item.deviceName)}</td><td>${escapeHtml(item.model)}</td><td class="mono">${escapeHtml(item.ip)}</td><td>${escapeHtml(item.locationName)}</td><td>${escapeHtml(item.address)}</td><td>${escapeHtml(duration(item.seconds))}</td><td>${item.basis === "confirmed" ? "Команда выключения → запуск" : "Пауза без логов (предположение)"}</td></tr>`);
    return `<section class="card power-dashboard section-gap" aria-labelledby="power-duration-title"><div class="section-heading"><div><p class="eyebrow">Выбранные фильтры = 100% устройств</p><h2 id="power-duration-title">Длительность отключения или паузы в логах</h2></div></div>
      <p class="muted">Каждое устройство входит не более чем в один интервал — по самому длинному наблюдению. Длительность штатного выключения измеряется от команды до следующего запуска; пауза без логов не доказывает пропажу питания. Месяц = 30 суток, год = 365 суток.</p>
      <div class="power-dashboard-main"><div class="power-donut-wrap"><div class="power-donut" role="img" aria-label="Из ${data.totalDevices} выбранных устройств ${data.observedDevices} имеют измеренный интервал, ${data.withoutMeasuredGap} не имеют" style="background:${donut}"><div class="power-donut-core"><span>Выбрано устройств</span><strong>${data.totalDevices}</strong><small>100% фильтра</small></div></div><div class="power-donut-selected"><span>${escapeHtml(selected.label)}</span><strong>${selected.count} <small>из ${data.totalDevices}</small></strong><em>${percent}% выборки</em></div></div>
      <div class="power-duration-legend">${data.buckets.map((item) => `<button class="power-duration-item${item.id === selected.id ? " selected" : ""}" type="button" data-power-duration="${item.id}" aria-pressed="${item.id === selected.id}"><i style="--bucket-color:${item.color}" aria-hidden="true"></i><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong><small>${item.percent.toFixed(1)}%</small></button>`).join("")}<div class="power-duration-remainder"><i aria-hidden="true"></i><span>Нет измеренного интервала</span><strong>${data.withoutMeasuredGap}</strong><small>${data.totalDevices ? (data.withoutMeasuredGap / data.totalDevices * 100).toFixed(1) : "0.0"}%</small></div></div></div>
      <div class="section-gap"><h3>${escapeHtml(selected.label)} — устройства</h3>${renderRebootTable(["Устройство", "Модель", "IP", "Локация", "Адрес", "Интервал", "Основание"], rows)}${selected.devices.length > 100 ? `<p class="muted">Показаны первые 100 устройств из ${selected.devices.length}; диаграмма рассчитана по всем.</p>` : ""}</div></section>`;
  }

  function renderPowerHeatmap(data) {
    const selectedKind = data.kind === "suspected_power_loss" ? "suspected" : "confirmed";
    const selectedId = ui.powerHeatmapCell;
    const requestedCell = data.cells.find((item) => `${item.day}:${item.hour}` === selectedId);
    const selected = requestedCell || (data.maxCount ? [...data.cells].sort((a, b) => b.count - a.count || a.day - b.day || a.hour - b.hour)[0] : null);
    const activeId = selected ? `${selected.day}:${selected.hour}` : null;
    const rows = selected?.count ? [...selected.devices.values()].sort((a, b) => b.count - a.count || String(a.deviceName).localeCompare(String(b.deviceName), "ru")).slice(0, 100).map((item) => `<tr><td>${escapeHtml(item.deviceName || "Не указано")}</td><td>${escapeHtml(item.model || "Не указано")}</td><td class="mono">${escapeHtml(item.ip || "—")}</td><td>${escapeHtml(item.locationName || "Не указано")}</td><td>${escapeHtml(item.address || "Не указано")}</td><td>${item.count}</td><td>${escapeHtml(item.latestAt)}</td><td>${escapeHtml(item.sources.map((source) => `${source.path}${source.line === null ? "" : `:${source.line}`}`).join("; "))}</td></tr>`) : [];
    const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
    const color = selectedKind === "confirmed" ? "34, 129, 147" : "159, 92, 140";
    return `<section class="card power-heatmap section-gap" aria-labelledby="power-heatmap-title"><div class="section-heading"><div><p class="eyebrow">День недели × час</p><h2 id="power-heatmap-title">Тепловая карта событий питания</h2></div></div>
      <div class="power-heatmap-toolbar" role="group" aria-label="Тип событий"><button type="button" data-power-heatmap-kind="confirmed" aria-pressed="${selectedKind === "confirmed"}">Подтверждённые выключения</button><button type="button" data-power-heatmap-kind="suspected" aria-pressed="${selectedKind === "suspected"}">Предполагаемые паузы</button></div>
      <p class="muted">Цвет ячейки — число уникальных устройств, а не число записей. Время взято из часов терминалов; часовые пояса не подтверждены. Фильтры и период событий применяются к карте.</p>
      <div class="power-heatmap-stats"><span><strong>${data.totalEvents}</strong> событий</span><span><strong>${data.affectedDevices}</strong> устройств</span><span><strong>${data.maxCount}</strong> максимум в ячейке</span></div>
      <div class="power-heatmap-scroll"><table class="power-heatmap-table"><thead><tr><th scope="col">День</th>${hours.map((hour) => `<th scope="col">${hour}</th>`).join("")}</tr></thead><tbody>${POWER_HEATMAP_DAYS.map((dayName, day) => `<tr><th scope="row">${dayName}</th>${hours.map((hourLabel, hour) => { const cell = data.cells[day * 24 + hour]; const id = `${day}:${hour}`; const intensity = cell.count && data.maxCount ? Math.max(.18, .15 + .8 * cell.count / data.maxCount) : 0; const label = `${dayName}, ${hourLabel}:00–${hourLabel}:59: ${cell.count} устройств, ${cell.eventCount} событий`; return `<td><button type="button" data-power-heatmap-cell="${id}" class="power-heatmap-cell${activeId === id ? " selected" : ""}" style="background-color:rgba(${color},${intensity.toFixed(3)})" aria-label="${escapeHtml(label)}" aria-pressed="${activeId === id}">${cell.count || "·"}</button></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="power-heatmap-scale" aria-hidden="true"><span>Нет событий</span><i class="${selectedKind}"></i><span>Больше устройств</span></div>
      <div class="section-gap"><h3>${activeId ? `${POWER_HEATMAP_DAYS[selected.day]}, ${hours[selected.hour]}:00–${hours[selected.hour]}:59 — ${selected.count} устройств` : "В выбранной области событий нет"}</h3>${renderRebootTable(["Устройство", "Модель", "IP", "Локация", "Адрес", "Событий", "Последнее время", "Файлы-источники"], rows)}${selected?.count > 100 ? `<p class="muted">Показаны первые 100 устройств; итоги рассчитаны по полной выборке.</p>` : ""}</div></section>`;
  }

  function getAccountedVcsHeatmap(analytics, kind) {
    const allowed = ["confirmed_reboot", "power_off", "suspected_power_loss"];
    const selectedKind = allowed.includes(kind) ? kind : "confirmed_reboot";
    const cells = Array.from({ length: 168 }, (_, index) => ({ day: Math.floor(index / 24), hour: index % 24, devices: new Set(), events: [] }));
    for (const event of analytics?.eventsByKind?.[selectedKind] || []) {
      const at = String(event.deviceLocalTime || "");
      if (!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(at)) continue;
      const date = new Date(`${at.slice(0, 10)}T${at.slice(11)}Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19).replace("T", " ") !== at) continue;
      const day = (date.getUTCDay() + 6) % 7;
      const cell = cells[day * 24 + date.getUTCHours()];
      cell.devices.add(event.deviceId);
      cell.events.push(event);
    }
    return { kind: selectedKind, cells, maxCount: Math.max(0, ...cells.map((cell) => cell.devices.size)) };
  }

  const accountedHeatmapCache = new WeakMap();

  function cachedAccountedHeatmap(analytics, kind) {
    let maps = accountedHeatmapCache.get(analytics);
    if (!maps) { maps = new Map(); accountedHeatmapCache.set(analytics, maps); }
    if (!maps.has(kind)) maps.set(kind, getAccountedVcsHeatmap(analytics, kind));
    return maps.get(kind);
  }

  function renderAccountedVcsPanel(analytics, mode) {
    const total = analytics.totalDevices;
    const percent = (count) => total ? Math.round(count / total * 1000) / 10 : 0;
    const rebootPercent = percent(analytics.rebootDevices);
    const suspectedOnly = analytics.rows.filter((row) => !row.powerConfirmedCount && row.powerSuspectedCount).length;
    const confirmedPercent = percent(analytics.powerConfirmedDevices);
    const suspectedPercent = percent(suspectedOnly);
    const ring = (label, value, gradient, view, summary) => `<button type="button" class="accounted-ring-card" data-accounted-view="${view}" aria-pressed="${ui.accountedView === view}" aria-label="${escapeHtml(label)}: ${value} из ${total}. Открыть список"><span class="accounted-ring" style="background:${gradient}"><span><strong>${value}</strong><small>из ${total}</small></span></span><span class="accounted-ring-caption"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(summary)}</small></span></button>`;
    const rebootRing = ring("Учёт: с перезагрузками", analytics.rebootDevices,
      `conic-gradient(#537fc6 0 ${rebootPercent}%, #dce7e7 ${rebootPercent}% 100%)`, "reboot", `${analytics.rebootEvents} событий · ${rebootPercent}%`);
    const powerRing = ring("Учёт: с событиями питания", analytics.powerUnionDevices,
      `conic-gradient(#198d8c 0 ${confirmedPercent}%, #a06ea8 ${confirmedPercent}% ${confirmedPercent + suspectedPercent}%, #dce7e7 ${confirmedPercent + suspectedPercent}% 100%)`,
      "power_confirmed", `${analytics.powerConfirmedEvents} штатных · ${analytics.powerSuspectedEvents} предположений`);
    const top = (title, rows, kind, field) => `<section class="card accounted-top"><h3>${escapeHtml(title)}</h3>${rows.length ? rows.map((row) => `<button type="button" data-accounted-device="${escapeHtml(row.deviceId)}" data-accounted-kind="${kind}"><span>${escapeHtml(row.deviceName)}</span><strong>${row[field]}</strong></button>`).join("") : `<p class="muted">Событий нет или журналы не разобраны.</p>`}</section>`;
    const heatmap = cachedAccountedHeatmap(analytics, ui.accountedHeatmapKind);
    const active = ui.accountedHeatmapCell ? heatmap.cells.find((cell) => `${cell.day}:${cell.hour}` === ui.accountedHeatmapCell) : null;
    const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
    const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
    const heatButtons = [
      ["confirmed_reboot", "Перезагрузки"], ["power_off", "Штатные выключения"],
      ["suspected_power_loss", "Предполагаемые паузы"]
    ].map(([kind, label]) => `<button type="button" data-accounted-heatmap-kind="${kind}" aria-pressed="${heatmap.kind === kind}">${label}</button>`).join("");
    const heatTable = `<div class="power-heatmap-scroll"><table class="power-heatmap-table"><thead><tr><th>День</th>${hours.map((hour) => `<th>${hour}</th>`).join("")}</tr></thead><tbody>${days.map((dayName, day) => `<tr><th>${dayName}</th>${hours.map((_hourName, hour) => { const cell = heatmap.cells[day * 24 + hour]; const count = cell.devices.size; const opacity = count && heatmap.maxCount ? Math.max(.18, .15 + .8 * count / heatmap.maxCount) : 0; return `<td><button class="power-heatmap-cell" type="button" data-accounted-heatmap-cell="${day}:${hour}" style="background-color:rgba(83,127,198,${opacity.toFixed(3)})" aria-label="${dayName} ${hours[hour]}:00: ${count} устройств, ${cell.events.length} событий" aria-pressed="${ui.accountedHeatmapCell === `${day}:${hour}`}">${count || "·"}</button></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>`;
    const cellDetail = active ? `<div class="section-gap"><h4>${days[active.day]}, ${hours[active.hour]}:00 — ${active.devices.size} устройств, ${active.events.length} событий</h4>${renderRebootTable(["Устройство", "Модель", "IP", "Время терминала", "Тип", "Локация", "Адрес"], active.events.slice(0, 100).map((event) => `<tr><td>${escapeHtml(event.deviceName)}</td><td>${escapeHtml(event.model)}</td><td>${escapeHtml(event.ip)}</td><td>${escapeHtml(event.deviceLocalTime)}</td><td>${heatmap.kind === "confirmed_reboot" ? "Перезагрузка" : heatmap.kind === "power_off" ? "Штатное выключение" : "Предполагаемая пауза"}</td><td>${escapeHtml(event.locationName)}</td><td>${escapeHtml(event.address)}</td></tr>`))}${active.events.length > 100 ? `<p class="muted">Показаны первые 100 событий.</p>` : ""}</div>` : "";
    const selectedView = ["reboot", "power_confirmed", "power_suspected", "none"].includes(ui.accountedView) ? ui.accountedView : "reboot";
    let rows = analytics.rows.filter((row) => selectedView === "reboot" ? row.rebootCount > 0
      : selectedView === "power_confirmed" ? row.powerConfirmedCount > 0
        : selectedView === "power_suspected" ? row.powerSuspectedCount > 0
          : !row.rebootCount && !row.powerConfirmedCount && !row.powerSuspectedCount);
    if (ui.accountedDeviceId) rows = rows.filter((row) => row.deviceId === ui.accountedDeviceId);
    if (active) rows = rows.filter((row) => active.devices.has(row.deviceId));
    rows = [...rows].sort((left, right) => (selectedView === "reboot" ? right.rebootCount - left.rebootCount
      : right.powerConfirmedCount + right.powerSuspectedCount - left.powerConfirmedCount - left.powerSuspectedCount)
      || left.deviceName.localeCompare(right.deviceName, "ru"));
    const detailRows = rows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.deviceName)}</td><td>${escapeHtml(row.model)}</td><td>${escapeHtml(row.ip)}</td><td>${escapeHtml(row.domain)}</td><td>${escapeHtml(row.locationName)}</td><td>${escapeHtml(row.address)}</td><td>${row.rebootCount}</td><td>${row.powerConfirmedCount}</td><td>${row.powerSuspectedCount}</td></tr>`);
    return `<section class="card section-gap accounted-vcs-panel"><div class="section-heading"><div><p class="eyebrow">Актуальная SR · статус оборудования «Учёт»</p><h2>ВКС в учёте: события по логам</h2></div><strong>${total} устройств</strong></div>
      <p class="muted">Событие выключения — историческая запись, не текущее состояние питания. Пауза без логов — отдельное предположение. Если есть оба вида, устройство попадает в подтверждённый сектор, но предположение отдельно сохраняется в списке. Серый сектор включает устройства без выявленного события или без поддерживаемого разбора журнала.</p>
      <div class="accounted-rings">${rebootRing}${powerRing}</div>
      <div class="accounted-legend"><button type="button" data-accounted-view="reboot">Перезагрузки: ${analytics.rebootDevices}</button><button type="button" data-accounted-view="power_confirmed">Штатные выключения: ${analytics.powerConfirmedDevices}</button><button type="button" data-accounted-view="power_suspected">Предполагаемые паузы: ${analytics.powerSuspectedDevices}</button><button type="button" data-accounted-view="none">Без выявленного события / без данных</button></div>
      <div class="button-row section-gap"><button class="button secondary" type="button" data-download-accounted="reboot"${analytics.rebootDevices ? "" : " disabled"}>Скачать перезагрузки XLSX</button><button class="button secondary" type="button" data-download-accounted="power"${analytics.powerUnionDevices ? "" : " disabled"}>Скачать питание XLSX</button></div>
      <div class="reboot-leader-grid section-gap">${top("TOP 5 по перезагрузкам", analytics.topReboots, "reboot", "rebootCount")}${top("TOP 5 по штатным выключениям", analytics.topPowerConfirmed, "power_confirmed", "powerConfirmedCount")}${top("TOP 5 по предполагаемым паузам", analytics.topPowerSuspected, "power_suspected", "powerSuspectedCount")}</div>
      <section class="section-gap"><h3>Тепловая карта терминалов «Учёт»</h3><div class="accounted-heatmap-toolbar">${heatButtons}</div><p class="muted">Ячейка показывает уникальные устройства; число событий указано при наведении. Время — локальное время терминала.</p>${heatTable}${cellDetail}</section>
      <section class="section-gap"><div class="section-heading"><h3>Устройства по выбранному виду — ${rows.length}</h3><button class="button secondary" type="button" data-accounted-clear-detail>Сбросить выбор</button></div>${renderRebootTable(["Устройство", "Модель", "IP", "Домен", "Локация", "Адрес", "Перезагрузки", "Штатные выключения", "Предполагаемые паузы"], detailRows)}${rows.length > 100 ? `<p class="muted">На экране первые 100; XLSX формируется по всем выбранным устройствам.</p>` : ""}</section></section>`;
  }

  function createRebootAnalyticsCache() {
    let current = null;
    return {
      get(candidateState, indexes, filters, mode, heatmapKind) {
        const selectedIndexes = [indexes.te, indexes.huawei310, indexes.huawei300Bar, indexes.huawei300Box];
        const filterKey = JSON.stringify(filters || {});
        const clockKey = filters?.period && filters.period !== "all" ? Math.floor(Date.now() / 60000) : 0;
        if (!current || current.state !== candidateState || current.filterKey !== filterKey || current.clockKey !== clockKey
          || selectedIndexes.some((index, position) => current.indexes[position] !== index)) {
          current = { state: candidateState, indexes: selectedIndexes, filterKey, clockKey,
            main: getRebootAnalytics(candidateState, filters),
            te: getHuaweiTeLogAnalytics(indexes.te, candidateState, filters),
            huawei310: getHuaweiTeLogAnalytics(indexes.huawei310, candidateState, filters),
            huawei300Bar: getHuaweiTeLogAnalytics(indexes.huawei300Bar, candidateState, filters),
            huawei300Box: getHuaweiTeLogAnalytics(indexes.huawei300Box, candidateState, filters),
            duration: null, accounted: null, heatmaps: new Map(), views: new Map() };
        }
        if (!current.accounted) current.accounted = getAccountedVcsAnalytics(candidateState,
          [current.te, current.huawei310, current.huawei300Bar, current.huawei300Box], filters);
        const viewKey = `${mode === "power" ? "power" : "reboots"}|${heatmapKind === "suspected" ? "suspected" : "confirmed"}`;
        if (current.views.has(viewKey)) return current.views.get(viewKey);
        if (mode === "power" && current.main.valid) {
          if (!current.duration) current.duration = getPowerDurationAnalytics(current.te, current.huawei310, candidateState, filters, current.huawei300Bar, current.huawei300Box);
          if (!current.heatmaps.has(viewKey)) current.heatmaps.set(viewKey,
            getPowerHeatmapAnalytics(current.te, current.huawei310, heatmapKind, current.huawei300Bar, current.huawei300Box));
        }
        const view = { main: current.main, te: current.te, huawei310: current.huawei310,
          huawei300Bar: current.huawei300Bar, huawei300Box: current.huawei300Box,
          duration: current.duration, heatmap: current.heatmaps.get(viewKey) || null, accounted: current.accounted };
        current.views.set(viewKey, view);
        return view;
      },
      clear() { current = null; }
    };
  }

  function renderReboots() {
    const mode = ui.rebootSubmodule === "power" ? "power" : "reboots";
    const data = rebootAnalyticsCache.get(state, { te: ui.teLogIndex, huawei310: ui.huawei310LogIndex,
      huawei300Bar: ui.huawei300BarLogIndex, huawei300Box: ui.huawei300BoxLogIndex }, ui.rebootFilters, mode, ui.powerHeatmapKind);
    const analytics = data.main;
    const teAnalytics = data.te;
    const teSections = renderHuaweiTeLogAnalytics(teAnalytics, mode);
    const barAnalytics = data.huawei310;
    const huawei310Sections = renderHuawei310LogAnalytics(barAnalytics, mode);
    const bar300Analytics = data.huawei300Bar;
    const box300Analytics = data.huawei300Box;
    const huawei300Sections = renderHuawei300LogAnalytics(bar300Analytics, box300Analytics, mode);
    const header = `<header class="page-header reboot-header"><div><h1>${escapeHtml(MODULE_CATALOG.find((item) => item.route === "reboots").title)}</h1></div><button class="button secondary" type="button" data-help-topic="${HELP_TOPIC_BY_ROUTE.reboots}">О модуле</button></header>`;
    const filters = renderRebootFilters(ui.rebootFilters, analytics);
    const tabs = `<nav class="reboot-submodules" aria-label="Разделы анализа"><button type="button" data-reboot-submodule="reboots" aria-current="${mode === "reboots" ? "page" : "false"}">Анализ перезагрузок</button><button type="button" data-reboot-submodule="power" aria-current="${mode === "power" ? "page" : "false"}">Анализ отключения питания</button></nav>`;
    if (!analytics.valid) return `${header}${tabs}${filters}<div class="error-panel section-gap" role="alert">${escapeHtml(analytics.errors.join("; "))}</div>`;
    const accountedPanel = renderAccountedVcsPanel(data.accounted, mode);
    if (mode === "power") return `${header}${tabs}${filters}${accountedPanel}${renderPowerDurationDashboard(data.duration)}${renderPowerHeatmap(data.heatmap)}${teSections}${huawei310Sections}${huawei300Sections}`;
    const empty = analytics.emptyState ? `<div class="${analytics.emptyState === "no_events" ? "success" : "info"}-panel section-gap"><strong>${escapeHtml(rebootEmptyMessage(analytics.emptyState))}</strong></div>` : "";
    if (["no_sr", "no_polling", "insufficient"].includes(analytics.emptyState)) return `${header}${tabs}${filters}${accountedPanel}<h2 class="section-gap">Перезагрузки по JSON-опросам</h2>${empty}${teSections}${huawei310Sections}${huawei300Sections}`;
    return `${header}${tabs}${filters}${accountedPanel}<h2 class="section-gap">Перезагрузки по JSON-опросам</h2>${empty}
      <section class="dashboard-kpi-grid reboot-kpi-grid section-gap">
        ${renderRebootCard("Общее количество перезагрузок", analytics.summary.minimumReboots, "events")}
        ${renderRebootCard("Количество перезагруженных устройств", analytics.summary.affectedDevices, "devices")}
        ${renderRebootCard("Затронутые локации", analytics.summary.affectedLocations, "locations")}
      </section>
      <section class="reboot-leader-grid section-gap">
        ${renderRebootCard("TOP 5 дат по перезагрузкам", null, "topDates", analytics.details.topDates.map((item) => ({ label: item.date, count: item.count })))}
        ${renderRebootCard("TOP 5 часов за сутки по перезагрузкам", null, "topHours", analytics.details.topHours.map((item) => ({ label: `${item.hour}:00–${item.hour}:59`, count: item.count })))}
        ${renderRebootCard("TOP 5 перезагрузок по устройствам", null, "topDevices", analytics.details.topDevices.map((item) => ({ label: item.deviceName, count: item.count })))}
        ${renderRebootCard("TOP 5 локаций по количеству перезагруженных устройств", null, "topLocations", analytics.details.topLocationsByDevices.map((item) => ({ label: item.locationName, count: item.uniqueDeviceCount, detail: item.deviceNames.join(", ") })))}
        ${renderRebootCard("TOP 5 адресов с перезагруженными устройствами", null, "topAddresses", analytics.details.topAddressesByDevices.map((item) => ({ label: item.address, count: item.uniqueDeviceCount })))}
      </section>
      <section class="reboot-chart-grid section-gap">
        ${renderRebootCard("Динамика по датам", analytics.byDate.length, "byDate")}
        ${renderRebootCard("Помещение по часам", analytics.byHour.filter((item) => item.count > 0).length, "byHour")}
        ${renderRebootCard("Устройства", analytics.details.devices.length, "byDevice")}
        ${renderRebootCard("Локации", analytics.details.locations.length, "byLocation")}
        ${renderRebootCard("Адреса", analytics.details.addresses.length, "byAddress")}
      </section>
      ${renderRebootDetail(analytics)}${teSections}${huawei310Sections}${huawei300Sections}`;
  }

  function currentAccountedAnalytics() {
    return rebootAnalyticsCache.get(state, { te: ui.teLogIndex, huawei310: ui.huawei310LogIndex,
      huawei300Bar: ui.huawei300BarLogIndex, huawei300Box: ui.huawei300BoxLogIndex },
    ui.rebootFilters, ui.rebootSubmodule, ui.powerHeatmapKind).accounted;
  }

  function renderAnalyticsPage(key, headers, rows, renderRow) {
    const pageSize = 100;
    const lastPage = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
    const page = Math.min(lastPage, Math.max(0, ui.analyticsPage[key] || 0));
    const displayed = rows.slice(page * pageSize, (page + 1) * pageSize);
    const controls = rows.length > pageSize ? `<div class="analytics-pagination"><span>Показано ${page * pageSize + 1}–${page * pageSize + displayed.length} из ${rows.length}</span><div class="button-row"><button class="button secondary" type="button" data-analytics-page="${key}:${page - 1}"${page === 0 ? " disabled" : ""}>Назад</button><button class="button secondary" type="button" data-analytics-page="${key}:${page + 1}"${page === lastPage ? " disabled" : ""}>Далее</button></div></div>` : "";
    return `${renderRebootTable(headers, displayed.map(renderRow))}${controls}`;
  }

  function renderVersionModule(kind) {
    const route = kind === "project" ? "project-versions" : "firmware-versions";
    const descriptor = MODULE_CATALOG.find((item) => item.route === route);
    const analysis = getVersionAnalysis(state, kind);
    const label = kind === "project" ? "Версия проекта" : "Версия прошивки";
    return `<header class="page-header"><div><h1>${escapeHtml(descriptor.title)}</h1></div><button class="button secondary" type="button" data-help-topic="${escapeHtml(descriptor.helpId)}">О модуле</button></header>
      <section class="dashboard-kpi-grid section-gap">${dashboardRouteKpi("Устройств с версией", analysis.devices, "По истории точных опросов")}${dashboardRouteKpi("Зафиксировано изменений", analysis.changes, "Между соседними результатами одного устройства")}</section>
      <section class="card section-gap analytics-table-card"><h2>История версий</h2>${renderAnalyticsPage(kind, ["Устройство", "IP", "Локация и адрес", "Дата опроса", "Файл", label, "Предыдущая версия", "Сравнение"], analysis.rows, (row) => `<tr><td>${escapeHtml(row.deviceName)}<br><small>${escapeHtml(row.model)}</small></td><td class="mono">${escapeHtml(row.ip)}</td><td>${escapeHtml(row.locationName)}<br><small>${escapeHtml(row.address)}</small></td><td>${escapeHtml(formatDateTime(row.capturedAt))}</td><td>${escapeHtml(row.filename)}</td><td>${escapeHtml(row.version)}</td><td>${escapeHtml(row.previousVersion || "—")}</td><td>${row.comparison === "changed" ? `<span class="badge warning">Изменена</span>` : row.comparison === "first" ? "Первый опрос" : "Без изменений"}</td></tr>`)}</section>`;
  }

  function renderConnectionErrors() {
    const descriptor = MODULE_CATALOG.find((item) => item.route === "connection-errors");
    const analysis = getConnectionErrorAnalysis(state);
    const headers = ["Устройство", "IP", "MAC", "Локация и адрес", "Случаев", "Последний случай", "Файл"];
    const row = (item) => `<tr><td>${escapeHtml(item.deviceName)}<br><small>${escapeHtml(item.model)}</small></td><td class="mono">${escapeHtml(item.ip)}</td><td class="mono">${escapeHtml(item.mac)}</td><td>${escapeHtml(item.locationName)}<br><small>${escapeHtml(item.address)}</small></td><td>${item.count}</td><td>${escapeHtml(formatDateTime(item.lastAt))}</td><td>${escapeHtml(item.lastFilename)}</td></tr>`;
    return `<header class="page-header"><div><h1>${escapeHtml(descriptor.title)}</h1></div><button class="button secondary" type="button" data-help-topic="${escapeHtml(descriptor.helpId)}">О модуле</button></header>
      <section class="dashboard-kpi-grid section-gap">${dashboardRouteKpi("Ошибка авторизации", analysis.authorization.length, "Устройства")}${dashboardRouteKpi("Недоступны по сети", analysis.network.length, "Устройства")}</section>
      <section class="card section-gap analytics-table-card"><h2>Не удалось авторизоваться</h2>${renderAnalyticsPage("authorization", headers, analysis.authorization, row)}</section>
      <section class="card section-gap analytics-table-card"><h2>Недоступны по сети</h2>${renderAnalyticsPage("network", headers, analysis.network, row)}</section>`;
  }

  function dashboardRunLabel(run) {
    const categories = (run.categories || []).map(formatCategoryLabel).join(", ");
    return [categories || (run.kind === "plan" ? "План опроса" : "Импорт результатов"), run.manufacturer].filter(Boolean).join(" / ");
  }

  function formatAge(value) {
    const age = Date.now() - timeValue(value);
    if (!Number.isFinite(age) || age < 0) return "Возраст неизвестен";
    const hours = Math.floor(age / 3600000);
    if (hours < 1) return "Менее часа назад";
    if (hours < 24) return `${hours} ч назад`;
    return `${Math.floor(hours / 24)} дн назад`;
  }

  function renderDashboardFilters(filters) {
    const devices = state.inventoryDevices.filter((item) => item.inCurrentSr !== false && EQUIPMENT_CATEGORY_IDS.includes(item.category));
    const manufacturers = devices.map((item) => item.manufacturerNormalized).filter(Boolean);
    const models = devices.map((item) => item.modelRaw).filter(Boolean);
    const locationIds = new Set(devices.map((item) => item.locationId).filter(Boolean));
    const locations = state.locations.filter((item) => locationIds.has(item.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
    return `<section class="card dashboard-filters"><div class="section-heading"><div><p class="eyebrow">Область анализа</p><h2>Фильтры Дашборда</h2></div><button class="button secondary" type="button" data-clear-dashboard-filters>Сбросить фильтры</button></div><form class="filter-grid dashboard-filter-grid" data-dashboard-filters>
      <div class="field"><label>Период событий</label><select name="period"><option value="latest_run"${filters.period === "latest_run" || !filters.period ? " selected" : ""}>Последний запуск</option><option value="today"${filters.period === "today" ? " selected" : ""}>Сегодня</option><option value="7d"${filters.period === "7d" ? " selected" : ""}>7 дней</option><option value="30d"${filters.period === "30d" ? " selected" : ""}>30 дней</option><option value="custom"${filters.period === "custom" ? " selected" : ""}>Произвольный</option><option value="all"${filters.period === "all" ? " selected" : ""}>Вся история</option></select></div>
      <div class="field"><label>Дата от</label><input type="date" name="dateFrom" value="${escapeHtml(filters.dateFrom || "")}"></div><div class="field"><label>Дата до</label><input type="date" name="dateTo" value="${escapeHtml(filters.dateTo || "")}"></div>
      <div class="field"><label>Категория</label><select name="category"><option value="">Все</option>${EQUIPMENT_CATEGORY_CATALOG.map((item) => `<option value="${item.id}"${filters.category === item.id ? " selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select></div>
      <div class="field"><label>Производитель</label><select name="manufacturer">${filterOptions(manufacturers, filters.manufacturer)}</select></div><div class="field"><label>Модель</label><select name="model">${filterOptions(models, filters.model)}</select></div>
      <div class="field"><label>Локация</label><select name="locationId"><option value="">Все</option>${locations.map((item) => `<option value="${escapeHtml(item.id)}"${filters.locationId === item.id ? " selected" : ""}>${escapeHtml(item.name || "Без названия")}</option>`).join("")}</select></div>
      <div class="field"><label>VIP</label><select name="vip"><option value="">Все</option><option value="true"${filters.vip === "true" ? " selected" : ""}>VIP</option><option value="false"${filters.vip === "false" ? " selected" : ""}>Не VIP</option></select></div>
      <div class="field"><label>Статус опроса</label><select name="pollStatus"><option value="">Все</option><option value="success"${filters.pollStatus === "success" ? " selected" : ""}>${formatPollStatus("success")}</option><option value="failed"${filters.pollStatus === "failed" ? " selected" : ""}>${formatPollStatus("failed")}</option><option value="not_polled"${filters.pollStatus === "not_polled" ? " selected" : ""}>${formatPollStatus("not_polled")}</option><option value="unsupported"${filters.pollStatus === "unsupported" ? " selected" : ""}>${formatPollStatus("unsupported")}</option><option value="unknown"${filters.pollStatus === "unknown" ? " selected" : ""}>${formatPollStatus("unknown")}</option></select></div>
      <div class="button-row"><button class="button primary" type="submit">Применить фильтры</button></div>
    </form></section>`;
  }

  function dashboardRouteKpi(title, value, note, route) {
    return `<article class="dashboard-kpi"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small>${route ? `<button class="text-button" type="button" data-dashboard-route="${route}">Открыть список</button>` : ""}</article>`;
  }

  function tooltipLabel(label, tooltipKey, topicId) {
    const help = UI_TERMS.tooltips[tooltipKey] || "Подробное описание доступно в Справочнике.";
    return `<span class="label-with-help">${escapeHtml(label)} <button class="help-tip" type="button" data-help-topic="${escapeHtml(topicId)}" aria-label="Справка: ${escapeHtml(label)}" title="${escapeHtml(help)}">?</button></span>`;
  }

  function dashboardMetricKpi(title, value, note, tone, summary, metric, titleIsHtml) {
    const config = { success: ["pollStatus", "success"], failed: ["pollStatus", "error"], pingFailures: ["ping", "failed"], notPolled: ["pollStatus", "never", "support", "supported"], unsupported: ["support", "unsupported"] }[metric] || [];
    const routeNames = Object.fromEntries(EQUIPMENT_CATEGORY_CATALOG.map((item) => [item.id, item.route]));
    const buttons = Object.entries(summary.drilldown.byCategory).filter(([, counts]) => counts[metric] > 0).map(([category, counts]) => {
      const attrs = [`data-dashboard-route="${routeNames[category]}"`];
      for (let index = 0; index < config.length; index += 2) attrs.push(`data-filter-${config[index].replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}="${config[index + 1]}"`);
      return `<button type="button" class="metric-link" ${attrs.join(" ")}>${escapeHtml(formatCategoryLabel(category))}: ${counts[metric]}</button>`;
    }).join("");
    return `<article class="dashboard-kpi ${tone}"><span>${titleIsHtml ? title : escapeHtml(title)}</span><strong>${value}</strong><small>${escapeHtml(note)}</small>${buttons ? `<div class="metric-drilldowns">${buttons}</div>` : ""}</article>`;
  }

  function renderLatestRun(summary) {
    const run = summary.context.latestRun;
    if (!run) return `<section class="card"><p class="eyebrow">Последний опрос</p><h2>Запусков пока нет</h2><p class="muted">Импортируйте результаты или сформируйте план опроса.</p><button class="button secondary" type="button" data-route="upload">Открыть загрузку</button></section>`;
    return `<section class="card"><p class="eyebrow">Последний опрос</p><h2>${escapeHtml(dashboardRunLabel(run))}</h2><p class="muted">${escapeHtml(formatDateTime(run.capturedAt))} · ${escapeHtml(formatRunStatus(run.status))}</p><ul class="data-list"><li><span>Устройств или файлов</span><strong>${run.deviceCount}</strong></li><li><span>Успешно</span><strong>${run.successCount}</strong></li><li><span>Ошибки</span><strong>${run.errorCount}</strong></li><li><span>Нет ответа по сети</span><strong>${summary.problems.currentPingFailures}</strong></li></ul><button class="button secondary" type="button" data-route="upload">Новый запуск опроса</button></section>`;
  }

  function renderVipSummary(summary) {
    return `<section class="card vip-card"><p class="eyebrow">Приоритет</p><h2>Приоритетная инфраструктура</h2><ul class="data-list"><li><span>VIP-локации</span><strong>${summary.vip.locations}</strong></li><li><span>VIP-оборудование</span><strong>${summary.vip.devices}</strong></li><li><span>С текущими проблемами</span><strong>${summary.vip.problems}</strong></li><li><span>Нет данных или опрос не поддерживается</span><strong>${summary.vip.noData}</strong></li></ul>${summary.vip.problems ? `<div class="metric-drilldowns">${Object.entries(summary.drilldown.byCategory).filter(([, row]) => row.vipProblems).map(([category, row]) => `<button class="metric-link" type="button" data-dashboard-route="${EQUIPMENT_CATEGORY_CATALOG.find((item) => item.id === category)?.route || "equipment"}" data-filter-vip="true" data-filter-poll-status="error">${escapeHtml(formatCategoryLabel(category))}: ${row.vipProblems}</button>`).join("")}</div>` : `<p class="success-text">Известных VIP-проблем нет.</p>`}</section>`;
  }

  function renderDashboardProblems(summary) {
    return `<section class="card"><div class="section-heading"><div><p class="eyebrow">Последнее состояние и импорт</p><h2>Последние проблемы</h2></div><span class="badge ${summary.latestProblems.length ? "warning" : "success"}">${summary.latestProblems.length}</span></div>${summary.latestProblems.length ? `<div class="activity-list">${summary.latestProblems.map((item) => `<article><div><span class="badge ${item.scope === "equipment" ? "critical" : "warning"}">${item.scope === "equipment" ? "Оборудование" : "Данные"}</span><time>${escapeHtml(formatDateTime(item.timestamp))}</time></div><strong>${escapeHtml(item.location)} · ${escapeHtml(item.device)}</strong><p>${escapeHtml(item.description)}</p><small class="mono">${escapeHtml(item.ip)}</small>${item.deviceId && item.category ? `<button class="text-button" type="button" data-dashboard-device="${escapeHtml(item.deviceId)}" data-dashboard-category="${escapeHtml(item.category)}">Открыть устройство</button>` : ""}</article>`).join("")}</div>` : `<p class="muted">Последних проблем в текущей области анализа нет.</p>`}</section>`;
  }

  function renderDashboardChanges(summary) {
    return `<section class="card"><div class="section-heading"><div><p class="eyebrow">Последние обнаруженные изменения</p><h2>Изменения</h2></div><span class="badge info">${summary.changes.changedDevices} устройств · ${summary.changes.total} изменений</span></div>${summary.recentChanges.length ? `<div class="activity-list">${summary.recentChanges.map((item) => `<article><div><time>${escapeHtml(formatDateTime(item.timestamp))}</time><span class="badge info">${escapeHtml(formatChangePath(item.path))}</span></div><strong>${escapeHtml(item.location)} · ${escapeHtml(item.device)}</strong><p><del>${escapeHtml(item.oldValue)}</del> → <ins>${escapeHtml(item.newValue)}</ins></p><small>${escapeHtml(item.manufacturer)} · ${escapeHtml(item.model)}</small><button class="text-button" type="button" data-dashboard-device="${escapeHtml(item.deviceId)}" data-dashboard-category="${escapeHtml(item.category)}">Открыть устройство</button></article>`).join("")}</div>` : `<p class="muted">Значимых изменений в текущей области анализа нет.</p>`}<div class="data-list compact-list"><div><span>Новые в актуальной SR</span><strong>${summary.changes.newInLatestSr}</strong></div><div><span>Отсутствуют в актуальной SR</span><strong>${summary.changes.missingFromLatestSr}</strong></div></div></section>`;
  }

  function renderAttentionLocations(summary) {
    if (!summary.locations.length) return `<p class="muted">Локаций с проблемами, изменениями или отсутствующими данными нет.</p>`;
    return `<div class="table-wrap"><table><thead><tr><th>Локация</th><th>Всего</th><th>Проблемы</th><th>Нет ответа по сети</th><th>Изменения</th><th>Данные отсутствуют</th></tr></thead><tbody>${summary.locations.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong>${item.vip ? ` <span class="badge warning">VIP</span>` : ""}<br><small>${escapeHtml(item.address)}</small></td><td>${item.totalDevices}</td><td>${item.problemDevices}</td><td>${item.pingFailures}</td><td>${item.changedDevices}</td><td>${item.noData}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderDistribution(title, rows, total) {
    return `<section class="card"><h2>${escapeHtml(title)}</h2>${rows.length ? `<div class="distribution-list">${rows.map((item) => `<div><div><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div><progress max="${Math.max(1, total)}" value="${item.count}">${item.count}</progress></div>`).join("")}</div>` : `<p class="muted">Нет данных.</p>`}</section>`;
  }

  function russianCountLabel(value, one, few, many) {
    const absolute = Math.abs(Number(value)) % 100;
    const last = absolute % 10;
    if (absolute > 10 && absolute < 20) return many;
    if (last === 1) return one;
    if (last >= 2 && last <= 4) return few;
    return many;
  }

  function renderReference() {
    const query = ui.helpQuery || "";
    const entries = searchReferenceEntries(query);
    const bySection = new Map(HELP_SECTIONS.map((section) => [section.id, entries.filter((entry) => entry.sectionId === section.id)]));
    const statusLabel = { needs_clarification: "Требует уточнения", in_development: "Функция находится в разработке" };
    const sections = HELP_SECTIONS.map((section, index) => {
      const sectionEntries = bySection.get(section.id) || [];
      if (!sectionEntries.length) return "";
      return `<details class="reference-section"${query || index === 0 ? " open" : ""}><summary><span>${escapeHtml(section.title)}</span><small>${sectionEntries.length}</small></summary><p class="reference-description">${escapeHtml(section.description)}</p><div class="reference-grid">${sectionEntries.map((entry) => `<article class="reference-entry${ui.helpTopicId === entry.id ? " selected" : ""}" id="help-${escapeHtml(entry.id)}"><div class="reference-entry-heading"><h3>${escapeHtml(entry.title)}</h3>${statusLabel[entry.status] ? `<span class="badge warning">${escapeHtml(statusLabel[entry.status])}</span>` : ""}</div><p>${escapeHtml(entry.summary)}</p>${entry.details ? `<p class="muted">${escapeHtml(entry.details)}</p>` : ""}</article>`).join("")}</div></details>`;
    }).join("");
    return `<header class="page-header"><div><h1>Справочник</h1></div><span class="badge info">${entries.length} ${russianCountLabel(entries.length, "материал", "материала", "материалов")}</span></header>
      <section class="card reference-search-card"><form class="reference-search" data-reference-search><div class="field"><label for="reference-query">Поиск по Справочнику</label><input id="reference-query" name="query" type="search" value="${escapeHtml(query)}" placeholder="Например: ping, ВКС, SR, изменения"></div><div class="button-row"><button class="button primary" type="submit">Найти</button><button class="button secondary" type="button" data-clear-help-search>Сбросить поиск</button></div></form><p class="muted">Поиск проверяет названия, сокращения, определения и технические синонимы. Запрос никуда не отправляется и не сохраняется.</p></section>
      <div class="reference-sections section-gap">${sections || `<section class="empty-state"><h2>Ничего не найдено</h2><p>Измените запрос или сбросьте поиск, чтобы увидеть все разделы.</p><button class="button secondary" type="button" data-clear-help-search>Показать весь Справочник</button></section>`}</div>`;
  }

  const INVENTORY_ROUTE = PRODUCT_CATALOG.buildInventoryRoutes();

  function latestPollingResult(deviceId) {
    return state.pollingResults.filter((item) => item.deviceId === deviceId).sort(comparePollingResultsNewest)[0] || null;
  }

  function filteredInventory(category) {
    return filterInventoryDevices(state, category, ui.inventoryFilters);
  }

  function renderInventoryRoute(route) {
    const config = INVENTORY_ROUTE[route];
    if (ui.selectedInventoryDeviceId) {
      const selected = state.inventoryDevices.find((item) => item.id === ui.selectedInventoryDeviceId && item.category === config.category);
      if (selected) return renderInventoryDetail(selected, route);
      ui.selectedInventoryDeviceId = null;
    }
    const devices = filteredInventory(config.category);
    const manufacturers = state.inventoryDevices.filter((item) => item.category === config.category).map((item) => item.manufacturerNormalized);
    const models = state.inventoryDevices.filter((item) => item.category === config.category).map((item) => item.modelRaw).filter(Boolean);
    const categoryLocationIds = new Set(state.inventoryDevices.filter((item) => item.category === config.category).map((item) => item.locationId).filter(Boolean));
    const categoryLocations = state.locations.filter((item) => categoryLocationIds.has(item.id)).sort((a, b) => String(a.name).localeCompare(String(b.name), "ru"));
    const analytics = getInventoryAnalytics(state, config.category);
    const siteNameView = config.category === "vcs" && ui.vcsTableView === "siteName";
    const siteNameRows = siteNameView ? buildVcsSiteNameRows(state, ui.inventoryFilters, devices) : [];
    return `<header class="page-header"><div><h1>${config.title}</h1></div><div class="button-row"><span class="badge info">${devices.length}</span><button class="button secondary" type="button" data-help-topic="${config.help}">О модуле</button></div></header>
      <section class="stats-grid">${statCard("Всего", analytics.total)}${statCard("Опрошено / не опрашивалось", `${analytics.polled} / ${analytics.unpolled}`)}${statCard("Успешно / ошибки", `${analytics.success} / ${analytics.errors}`)}${statCard("Устройства с изменениями / обнаруженные изменения", `${analytics.changedDevices} / ${analytics.changes}`)}</section>
      <section class="card"><form class="filter-grid inventory-filter-grid" data-inventory-filters>
        <input type="hidden" name="route" value="${route}"><div class="field"><label>Поиск</label><input name="search" value="${escapeHtml(ui.inventoryFilters.search || "")}" placeholder="IP, модель, комната…"></div>
        <div class="field"><label>Производитель</label><select name="manufacturer">${filterOptions(manufacturers, ui.inventoryFilters.manufacturer)}</select></div>
        <div class="field"><label>Модель</label><select name="model">${filterOptions(models, ui.inventoryFilters.model)}</select></div>
        <div class="field"><label>Локация</label><select name="locationId"><option value="">Все</option>${categoryLocations.map((item) => `<option value="${escapeHtml(item.id)}"${ui.inventoryFilters.locationId === item.id ? " selected" : ""}>${escapeHtml(item.name || "Без названия")}</option>`).join("")}</select></div>
        <div class="field"><label>Актуальность SR</label><select name="current"><option value="yes"${ui.inventoryFilters.current === "yes" ? " selected" : ""}>В актуальной SR</option><option value="all"${ui.inventoryFilters.current === "all" ? " selected" : ""}>Все</option><option value="no"${ui.inventoryFilters.current === "no" ? " selected" : ""}>Исторические</option></select></div>
        <div class="field"><label>Статус последнего опроса</label><select name="pollStatus">${filterOptions(["success", "authorization_error", "network_unreachable", "processing_error", "unmatched", "unknown", "never"], ui.inventoryFilters.pollStatus, Object.fromEntries(["success", "authorization_error", "network_unreachable", "processing_error", "unmatched", "unknown", "never"].map((status) => [status, formatPollStatus(status)])))}</select></div>
        <div class="field"><label>Сетевая доступность</label><select name="ping">${filterOptions(["ok", "failed", "unknown"], ui.inventoryFilters.ping, { ok: formatPingStatus("ok"), failed: formatPingStatus("failed"), unknown: formatPingStatus("unknown") })}</select></div>
        <div class="field"><label>Изменения</label><select name="changed"><option value="">Все</option><option value="true"${ui.inventoryFilters.changed === "true" ? " selected" : ""}>Есть</option><option value="false"${ui.inventoryFilters.changed === "false" ? " selected" : ""}>Нет</option></select></div>
        <div class="field"><label>Поддержка автоматического опроса</label><select name="support"><option value="">Все</option><option value="supported"${ui.inventoryFilters.support === "supported" ? " selected" : ""}>${formatCapabilityStatus("supported")}</option><option value="unsupported"${ui.inventoryFilters.support === "unsupported" ? " selected" : ""}>${formatCapabilityStatus("unsupported")}</option><option value="unknown"${ui.inventoryFilters.support === "unknown" ? " selected" : ""}>${formatCapabilityStatus("unknown")}</option></select></div>
        <div class="field"><label>VIP</label><select name="vip"><option value="">Все</option><option value="true"${ui.inventoryFilters.vip === "true" ? " selected" : ""}>Да</option><option value="false"${ui.inventoryFilters.vip === "false" ? " selected" : ""}>Нет</option></select></div>
        <div class="button-row"><button class="button primary" type="submit">Применить фильтры</button><button class="button secondary" type="button" data-clear-inventory-filters>Сбросить фильтры</button></div>
      </form></section>
      <section class="card section-gap">${config.category === "vcs" ? `<div class="inventory-view-toolbar"><div class="button-row" role="group" aria-label="Вид таблицы"><button class="button ${siteNameView ? "secondary" : "primary"}" type="button" data-vcs-table-view="devices" aria-pressed="${!siteNameView}">Устройства</button><button class="button ${siteNameView ? "primary" : "secondary"}" type="button" data-vcs-table-view="siteName" aria-pressed="${siteNameView}">Site name</button></div>${siteNameView ? `<button class="button secondary" type="button" data-download-site-name${siteNameRows.length ? "" : " disabled"}>Скачать Site name</button>` : ""}</div>` : ""}${siteNameView ? renderVcsSiteNameTable(siteNameRows) : renderInventoryTable(devices)}</section>`;
  }

  function renderVcsSiteNameTable(rows) {
    if (!rows.length) return `<div class="empty-state compact"><p>Терминалы ВКС по выбранным фильтрам не найдены.</p></div>`;
    const cell = (value) => value == null || value === "" ? `<span class="muted">—</span>` : escapeHtml(value);
    return `<div class="table-wrap"><table><thead><tr>${VCS_SITE_NAME_HEADERS.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr><td>${cell(row.deviceName)}</td><td>${cell(row.siteName)}</td><td class="mono">${cell(row.ip)}</td><td class="mono">${cell(row.mac)}</td><td>${cell(row.address)}</td><td>${cell(row.locationName)}</td><td>${cell(row.domain)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderInventoryTable(devices) {
    if (!devices.length) return `<div class="empty-state compact"><p>Устройства по выбранным фильтрам не найдены.</p></div>`;
    return `<div class="table-wrap"><table><thead><tr><th>Локация</th><th>Устройство</th><th>Производитель / модель</th><th>IP-адрес</th><th>Данные SR</th><th>Статус последнего опроса</th><th></th></tr></thead><tbody>${devices.map((device) => {
      const location = state.locations.find((item) => item.id === device.locationId);
      const latest = latestPollingResult(device.id);
      const status = latest?.operationalStatus || latest?.pollStatus;
      return `<tr><td><strong>${escapeHtml(location?.name || "—")}</strong><br><span class="muted">${escapeHtml(location?.address || "")}</span></td><td>${escapeHtml(device.nameRaw || device.modelTypeRaw || "—")}<br><span class="muted">${device.deviceVip ? "VIP · " : ""}${escapeHtml(device.inventoryNumber || device.serialNumber || "")}</span></td><td>${escapeHtml(device.manufacturerRaw || "—")}<br><span class="muted">${escapeHtml(device.modelRaw || "—")}</span></td><td class="mono">${escapeHtml(device.ipNormalized || device.ipRaw || "—")}</td><td><span class="badge ${device.inCurrentSr === false ? "warning" : "success"}">${device.inCurrentSr === false ? "Исторические данные" : "Актуально"}</span></td><td><span class="badge ${status === "success" ? "success" : ["authorization_error", "network_unreachable", "processing_error"].includes(status) ? "critical" : "info"}">${escapeHtml(latest ? formatPollStatus(status) : formatPollStatus("never"))}</span><br><span class="muted">${escapeHtml(formatDateTime(latest?.capturedAt))}</span></td><td><button class="button secondary compact-button" type="button" data-view-inventory="${escapeHtml(device.id)}">Открыть устройство</button></td></tr>`;
    }).join("")}</tbody></table></div>`;
  }

  function renderInventoryDetail(device, route) {
    const location = state.locations.find((item) => item.id === device.locationId);
    const results = state.pollingResults.filter((item) => item.deviceId === device.id).sort(comparePollingResultsNewest);
    const changes = state.deviceChanges.filter((item) => item.deviceId === device.id && item.status === "active").sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));
    const capability = resolvePollingCapability(device);
    const pollingSupported = capability.support === "implemented" && Boolean(capability.transport);
    return `<header class="page-header"><div><button class="text-button" type="button" data-back-inventory="${route}">← К списку</button><h1>${escapeHtml(device.nameRaw || device.modelRaw || "Устройство")}</h1><p class="page-subtitle">${escapeHtml(location?.name || "Без локации")} · ${escapeHtml(device.ipNormalized || "IP не задан")}</p></div><span class="badge ${device.inCurrentSr === false ? "warning" : "success"}">${device.inCurrentSr === false ? "Не в актуальной SR" : "В актуальной SR"}</span></header>
      <div class="detail-grid"><section class="card"><h2>Карточка SR</h2><dl class="definition-list">
        <div><dt>Производитель / модель</dt><dd>${escapeHtml(device.manufacturerRaw || "—")} / ${escapeHtml(device.modelRaw || "—")}</dd></div><div><dt>IP / MAC</dt><dd>${escapeHtml(device.ipNormalized || "—")} / ${escapeHtml(device.macNormalized || device.macRaw || "—")}</dd></div><div><dt>SIP URI / домен</dt><dd>${escapeHtml(device.sipUri || "—")} / ${escapeHtml(device.domain || location?.domain || "—")}</dd></div><div><dt>Инвентарный / серийный</dt><dd>${escapeHtml(device.inventoryNumber || "—")} / ${escapeHtml(device.serialNumber || "—")}</dd></div>
      </dl></section><section class="card"><h2>Поддержка автоматического опроса</h2><span class="badge ${pollingSupported ? "success" : "warning"}">${escapeHtml(formatCapabilityStatus(capability.support))}</span><p>Механизм опроса: <span class="mono">${escapeHtml(capability.key || "не определён")}</span></p><p class="muted">${pollingSupported ? "Устройство можно включить в JSON-план для отдельного локального polling-скрипта. Учётные данные вводятся в модуле «Загрузка данных и опрос устройств» и передаются локальному исполнителю на время задания." : "Подтверждённый протокол подключения отсутствует; сетевой опрос не выполняется. Учётные данные хранятся отдельно."}</p>${pollingSupported ? `<button class="button secondary" type="button" data-route="upload">Сформировать план в модуле «Загрузка данных и опрос устройств»</button>` : `<button class="button secondary" type="button" disabled>Опрос недоступен</button>`}</section></div>
      <section class="card section-gap"><h2>История опросов (${results.length})</h2><p class="muted">«Дата и время опроса» берётся из времени последнего изменения выбранного JSON-файла. Это не время создания файла и не время папки запуска.</p><ul class="result-list">${results.map((result) => `<li><div><strong>Дата и время опроса: ${escapeHtml(formatDateTime(result.capturedAt))}</strong><br><span class="muted">${result.capturedAtSource === "file_last_modified" ? "Время последнего изменения файла" : "Время файла недоступно"} · ${escapeHtml(result.filename)} · ${escapeHtml(formatCategoryLabel(result.detectedCategory))} · ${escapeHtml(formatPingStatus(result.pingStatus))}</span></div><span class="badge ${(result.operationalStatus || result.pollStatus) === "success" ? "success" : "critical"}">${escapeHtml(formatPollStatus(result.operationalStatus || result.pollStatus))}</span></li>`).join("") || "<li>Результатов пока нет</li>"}</ul></section>
      <section class="card section-gap"><h2>Обнаруженные изменения (${changes.length})</h2><ul class="result-list">${changes.slice(0, 200).map((change) => `<li><div><strong>${escapeHtml(change.parameterLabel || formatChangePath(change.path))}</strong><br><span class="muted">${escapeHtml(displayValue(change.oldValue))} → ${escapeHtml(displayValue(change.newValue))}</span></div><span class="badge info">Изменение</span></li>`).join("") || "<li>Изменений не выявлено</li>"}</ul></section>`;
  }

  function statCard(label, value) {
    return `<article class="stat-card"><span class="muted">${escapeHtml(label)}</span><strong class="stat-value">${escapeHtml(value)}</strong></article>`;
  }

  const SNAPSHOT_STATUS_LABELS = Object.freeze({
    processed: "Обработан",
    partial: "Частично обработан",
    needs_project_mapping: "Нужно связать проект",
    unsupported: "Формат не поддерживается",
    failed: "Ошибка",
    received: "Получен"
  });

  const EVENT_LABELS = Object.freeze({
    project_name_changed: "Изменено имя проекта",
    project_version_changed: "Изменена версия проекта",
    name_changed: "Изменено имя устройства",
    ip_changed: "Изменён IP-адрес",
    mac_changed: "Изменён MAC-адрес",
    hostname_changed: "Изменено имя контроллера",
    network_setting_changed: "Изменены сетевые настройки",
    model_or_part_changed: "Изменены модель или part number",
    firmware_changed: "Изменена прошивка",
    gui_identity_changed: "Изменён GUI UUID",
    device_added: "Добавлено устройство",
    confirmed_removal: "Подтверждённое удаление",
    possible_removal: "Возможное удаление",
    match_review_required: "Требуется проверка соответствия"
  });

  function statusBadge(status) {
    const tone = status === "processed" ? "success" : status === "failed" || status === "unsupported" ? "critical" : "warning";
    return `<span class="badge ${tone}">${escapeHtml(SNAPSHOT_STATUS_LABELS[status] || status)}</span>`;
  }

  function projectName(projectId) {
    return state.projects.find((item) => item.id === projectId)?.displayName || "Не связан";
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function observedField(observation, name) {
    return displayValue(observation?.fields?.[name]?.rawValue);
  }

  function renderProjects() {
    if (ui.selectedProjectId) {
      const project = state.projects.find((item) => item.id === ui.selectedProjectId);
      if (project) return renderProjectDetail(project);
      ui.selectedProjectId = null;
    }
    return `
      <header class="page-header">
        <div><h1>Проекты</h1><p class="page-subtitle">Логические проекты, их текущее состояние и история снимков.</p></div>
        <button class="button primary" type="button" data-route="upload">Загрузить снимки</button>
      </header>
      ${state.projects.length ? `<div class="project-grid">${state.projects.map((project) => {
        const timeline = getProjectTimeline(state, project.id);
        const current = timeline.at(-1);
        const assets = state.assets.filter((asset) => asset.projectId === project.id);
        return `<article class="card project-card">
          <div class="section-heading"><div><span class="eyebrow">${escapeHtml(project.status)}</span><h2>${escapeHtml(project.displayName)}</h2></div><span class="badge info">${timeline.length} снимков</span></div>
          <p class="muted">Текущее состояние: ${escapeHtml(formatDateTime(current?.capturedAt))}</p>
          <p>${assets.length} объектов оборудования</p>
          <button class="button secondary" type="button" data-view-project="${escapeHtml(project.id)}">Открыть проект</button>
        </article>`;
      }).join("")}</div>` : `<div class="empty-state"><h2>Проектов пока нет</h2><p>Проект появится после первого поддерживаемого snapshot или ручной связи legacy-файла.</p><button class="button primary" type="button" data-route="upload">Перейти к загрузке</button></div>`}`;
  }

  function renderProjectDetail(project) {
    const currentState = getProjectCurrentState(state, project.id);
    const timeline = getProjectTimeline(state, project.id);
    const activePrevious = getActivePreviousChangeSets(state, project.id);
    const activeByTo = new Map(activePrevious.map((item) => [item.toSnapshotId, item]));
    const projectChangeSets = state.changeSets
      .filter((item) => item.projectId === project.id)
      .sort((a, b) => new Date(b.computedAt) - new Date(a.computedAt));
    const firstSnapshot = timeline[0];
    const lastSnapshot = timeline.at(-1);
    return `
      <header class="page-header">
        <div><button class="text-button" type="button" data-back-projects>← Все проекты</button><h1>${escapeHtml(project.displayName)}</h1><p class="page-subtitle">Текущее состояние определяется последним <code>capturedAt</code>, независимо от времени загрузки.</p></div>
        <span class="badge ${project.status === "active" ? "success" : "warning"}">${escapeHtml(project.status)}</span>
      </header>
      <section class="stats-grid">
        ${statCard("Снимки", timeline.length)}
        ${statCard("Оборудование", currentState.assets.length)}
        ${statCard("Активные сравнения", activePrevious.length)}
        ${statCard("Текущая дата", formatDateTime(currentState.snapshot?.capturedAt))}
      </section>
      ${renderBaselineSection(project, timeline)}
      ${timeline.length >= 2 ? `<section class="card section-gap">
        <h2>Сравнить выбранные даты</h2>
        <form class="date-pair-form" data-selected-comparison="${escapeHtml(project.id)}">
          <div class="field"><label for="compare-from">От</label><select id="compare-from" name="fromSnapshotId" required>${timeline.map((snapshot) => `<option value="${escapeHtml(snapshot.id)}"${snapshot.id === firstSnapshot.id ? " selected" : ""}>${escapeHtml(formatDateTime(snapshot.capturedAt))} · ${escapeHtml(snapshot.filename)}</option>`).join("")}</select></div>
          <div class="field"><label for="compare-to">До</label><select id="compare-to" name="toSnapshotId" required>${timeline.map((snapshot) => `<option value="${escapeHtml(snapshot.id)}"${snapshot.id === lastSnapshot.id ? " selected" : ""}>${escapeHtml(formatDateTime(snapshot.capturedAt))} · ${escapeHtml(snapshot.filename)}</option>`).join("")}</select></div>
          <button class="button primary" type="submit">Сравнить</button>
        </form>
      </section>` : ""}
      <div class="detail-grid section-gap">
        <section class="card">
          <h2>Текущий проект</h2>
          <dl class="definition-list">
            <div><dt>Имя конфигурации</dt><dd>${escapeHtml(observedField(currentState.projectObservation, "projectName"))}</dd></div>
            <div><dt>Версия</dt><dd>${escapeHtml(observedField(currentState.projectObservation, "projectVersion"))}</dd></div>
            <div><dt>Дата сбора</dt><dd>${escapeHtml(formatDateTime(currentState.snapshot?.capturedAt))}</dd></div>
            <div><dt>Дата загрузки</dt><dd>${escapeHtml(formatDateTime(currentState.snapshot?.uploadedAt))}</dd></div>
          </dl>
        </section>
        <section class="card">
          <h2>Идентичность</h2>
          <ul class="data-list">${(project.references || []).map((reference) => `<li><span>${escapeHtml(reference.sourceSystem)} · ${escapeHtml(reference.kind)}</span><strong class="mono">${escapeHtml(reference.valueNormalized)}</strong></li>`).join("") || "<li>Нет references</li>"}</ul>
        </section>
      </div>
      <section class="card section-gap">
        <h2>Текущий inventory</h2>
        <div class="table-wrap"><table><thead><tr><th>Объект</th><th>Тип</th><th>Статус</th><th>Модель</th><th>IP</th><th>MAC</th></tr></thead><tbody>
          ${currentState.assets.map(({ asset, observation }) => `<tr><td><strong>${escapeHtml(asset.displayName)}</strong></td><td>${escapeHtml(asset.kind)}</td><td><span class="badge ${asset.status === "active" ? "success" : "warning"}">${escapeHtml(asset.status)}</span></td><td>${escapeHtml(observedField(observation, "model"))}</td><td class="mono">${escapeHtml(observedField(observation, "ipAddress"))}</td><td class="mono">${escapeHtml(observedField(observation, "macAddress"))}</td></tr>`).join("") || `<tr><td colspan="6">Оборудование не найдено</td></tr>`}
        </tbody></table></div>
      </section>
      <section class="card section-gap">
        <h2>Timeline по capturedAt</h2>
        <div class="table-wrap"><table><thead><tr><th>Дата данных</th><th>Дата загрузки</th><th>Файл</th><th>Статус</th><th>Previous diff</th><th></th></tr></thead><tbody>
          ${timeline.map((snapshot, index) => {
            const comparison = activeByTo.get(snapshot.id);
            return `<tr><td><strong>${escapeHtml(formatDateTime(snapshot.capturedAt))}</strong>${index === timeline.length - 1 ? `<br><span class="badge success">current</span>` : ""}</td><td>${escapeHtml(formatDateTime(snapshot.uploadedAt))}</td><td>${escapeHtml(snapshot.filename)}</td><td>${statusBadge(snapshot.status)}</td><td>${comparison ? `<button class="text-button" type="button" data-view-comparison="${escapeHtml(comparison.id)}">${comparison.events.length} событий</button>` : "Первый снимок"}</td><td><button class="button secondary compact-button" type="button" data-view-snapshot="${escapeHtml(snapshot.id)}">Снимок</button></td></tr>`;
          }).join("")}
        </tbody></table></div>
      </section>
      <section class="card section-gap">
        <h2>История расчётов</h2>
        <ul class="result-list">${projectChangeSets.map((changeSet) => {
          const from = state.snapshots.find((item) => item.id === changeSet.fromSnapshotId);
          const to = state.snapshots.find((item) => item.id === changeSet.toSnapshotId);
          return `<li><div><strong>${escapeHtml(changeSet.mode)}: ${escapeHtml(formatDateTime(from?.capturedAt))} → ${escapeHtml(formatDateTime(to?.capturedAt))}</strong><br><span class="muted">${changeSet.events.length} событий${changeSet.supersedesId ? ` · заменяет ${escapeHtml(changeSet.supersedesId)}` : ""}</span></div><div class="button-row"><span class="badge ${changeSet.status === "active" ? "success" : "warning"}">${escapeHtml(changeSet.status)}</span><button class="button secondary compact-button" type="button" data-view-comparison="${escapeHtml(changeSet.id)}">Открыть</button></div></li>`;
        }).join("") || "<li>Сравнений пока нет</li>"}</ul>
      </section>`;
  }

  function renderBaselineSection(project, timeline) {
    const drift = getBaselineDrift(state, project.id);
    const assignments = state.baselineAssignments
      .filter((item) => item.projectId === project.id)
      .sort((left, right) => new Date(right.assignedAt) - new Date(left.assignedAt));
    const options = timeline.map((snapshot) => `<option value="${escapeHtml(snapshot.id)}"${snapshot.id === drift.assignment?.snapshotId ? " selected" : ""}>${escapeHtml(formatDateTime(snapshot.capturedAt))} · ${escapeHtml(snapshot.filename)}</option>`).join("");
    return `
      <section class="card baseline-card section-gap">
        <div class="section-heading"><div><span class="eyebrow">Контроль согласованной конфигурации</span><h2>Baseline и текущий drift</h2></div>${drift.assignment ? `<span class="badge ${drift.assignment.status === "active" ? "success" : "warning"}">${escapeHtml(drift.assignment.status)}</span>` : `<span class="badge info">не назначен</span>`}</div>
        ${drift.assignment ? `
          ${drift.assignment.status === "expiration_pending" ? `<div class="warning-panel">Baseline snapshot достиг границы retention. Он сохранён и требует явного решения: заменить или завершить baseline.</div>` : ""}
          <div class="baseline-summary">
            <div><span>Baseline</span><strong>${escapeHtml(formatDateTime(drift.baselineSnapshot?.capturedAt))}</strong></div>
            <div><span>Текущее состояние</span><strong>${escapeHtml(formatDateTime(drift.currentSnapshot?.capturedAt))}</strong></div>
            <div><span>Отклонения</span><strong>${drift.events.length}</strong></div>
          </div>
          ${drift.changeSet ? `<button class="button secondary" type="button" data-view-comparison="${escapeHtml(drift.changeSet.id)}">Открыть baseline drift</button>` : ""}
        ` : `<p class="muted">Назначьте утверждённый snapshot. Drift будет рассчитываться между ним и текущим состоянием независимо от previous diff.</p>`}
        ${timeline.length ? `
          <form class="baseline-form section-gap" data-assign-baseline="${escapeHtml(project.id)}">
            <div class="field"><label for="baseline-snapshot">Snapshot baseline</label><select id="baseline-snapshot" name="snapshotId" required>${options}</select></div>
            <div class="field"><label for="baseline-reason">Основание решения</label><input id="baseline-reason" name="reason" required placeholder="Например, согласованная конфигурация"></div>
            <button class="button primary" type="submit">${drift.assignment ? "Заменить baseline" : "Назначить baseline"}</button>
          </form>` : ""}
        ${drift.assignment ? `<form class="inline-action-form" data-end-baseline="${escapeHtml(project.id)}"><div class="field"><label for="baseline-end-reason">Причина завершения</label><input id="baseline-end-reason" name="reason" required placeholder="Причина"></div><button class="button danger" type="submit">Завершить baseline</button></form>` : ""}
        ${assignments.length ? `<details class="section-gap"><summary>История назначений (${assignments.length})</summary><ul class="result-list">${assignments.map((assignment) => {
          const snapshot = state.snapshots.find((item) => item.id === assignment.snapshotId);
          return `<li><div><strong>${escapeHtml(formatDateTime(snapshot?.capturedAt))}</strong><br><span class="muted">${escapeHtml(assignment.reason)} · ${escapeHtml(formatDateTime(assignment.assignedAt))}${assignment.endReason ? ` · ${escapeHtml(assignment.endReason)}` : ""}</span></div><span class="badge ${assignment.status === "active" ? "success" : "warning"}">${escapeHtml(assignment.status)}</span></li>`;
        }).join("")}</ul></details>` : ""}
      </section>`;
  }

  function renderPollingChoiceGroup(name, label, options, selection) {
    return `<fieldset class="polling-choice-group"><legend class="sr-only">${escapeHtml(label)}</legend><div class="polling-choice-heading" aria-hidden="true">${escapeHtml(label)}</div><div class="polling-choice-options">
      <label class="polling-choice"><input type="checkbox" data-polling-plan-filter="${name}" value="${POLLING_ALL}"${selection.includes(POLLING_ALL) ? " checked" : ""}${options.length ? "" : " disabled"}>Все</label>
      ${options.map((item) => `<label class="polling-choice"><input type="checkbox" data-polling-plan-filter="${name}" value="${escapeHtml(item.value)}"${selection.includes(item.value) ? " checked" : ""}>${escapeHtml(item.label)}</label>`).join("")}
    </div></fieldset>`;
  }

  function renderPollingIpTarget(projection) {
    const resolution = projection.ipResolution;
    if (resolution.status !== "found") {
      const sourceLabel = projection.targetSource === "port_closure_list" ? "списка устройств для закрытия портов" : "актуальной выгрузки SR";
      const messages = {
        empty: `Введите полный IPv4-адрес устройства из ${sourceLabel}.`,
        invalid: "IP-адрес указан некорректно.",
        not_found: `Устройство с таким IP-адресом отсутствует в ${sourceLabel}.`,
        ambiguous: `Найдено несколько устройств с этим IP-адресом (${resolution.candidateCount}). Опрос заблокирован до устранения конфликта в источнике.`
      };
      const severity = ["invalid", "ambiguous"].includes(resolution.status) ? "critical" : resolution.status === "not_found" ? "warning" : "info";
      return `<div class="polling-ip-message ${severity}">${escapeHtml(messages[resolution.status] || "Устройство не выбрано.")}</div>`;
    }
    const device = resolution.device;
    const location = state.locations.find((item) => item.id === device.locationId);
    const capability = resolvePollingCapability(device);
    const supported = Boolean(device.ipNormalized && capability.support === "implemented" && capability.transport);
    return `<section class="polling-target-card"><div class="polling-target-heading"><div><span class="eyebrow">Карточка выбранного устройства</span><h3>${escapeHtml(device.nameRaw || device.modelRaw || "Устройство")}</h3></div><span class="badge ${supported ? "success" : "warning"}">${escapeHtml(formatCapabilityStatus(capability.support))}</span></div><dl class="definition-list polling-target-details">
      <div><dt>Класс оборудования</dt><dd>${escapeHtml(formatCategoryLabel(device.category))}</dd></div>
      <div><dt>Производитель / модель</dt><dd>${escapeHtml(device.manufacturerRaw || "—")} / ${escapeHtml(device.modelRaw || "—")}</dd></div>
      <div><dt>IP / MAC</dt><dd>${escapeHtml(device.ipNormalized || "—")} / ${escapeHtml(device.macNormalized || device.macRaw || "—")}</dd></div>
      <div><dt>Домен</dt><dd>${escapeHtml(device.domain || "—")}</dd></div>
      <div><dt>Локация / адрес</dt><dd>${escapeHtml(location?.name || device.roomName || "—")} / ${escapeHtml(location?.address || device.roomAddress || "—")}</dd></div>
      <div><dt>Инвентарный / серийный</dt><dd>${escapeHtml(device.inventoryNumber || "—")} / ${escapeHtml(device.serialNumber || "—")}</dd></div>
    </dl><p class="muted">${supported ? `Будет использован механизм ${escapeHtml(capability.key || "подтверждённого опроса")}.` : "Подтверждённый автоматический опрос для этого устройства недоступен; сетевой запрос выполняться не будет."}</p></section>`;
  }

  function renderUpload() {
    const pollingProgress = ui.pollingProgress;
    const automatic = ui.automaticPolling;
    const automaticPercent = automatic?.total ? Math.min(100, Math.round((automatic.processed / automatic.total) * 100)) : 0;
    const importsBusy=ui.inventoryBusy||ui.logImportBusy||Boolean(ui.dbPrepare)||ui.dbOperationLoading||ui.workspaceSaveStatus==="restoring";
    const projection = deriveAutomaticPollingPlan(state, { ...ui.pollingPlanSelection, managementTargetDevices: managementTargetListSession?.devices || [] });
    ui.pollingPlanSelection = { ...ui.pollingPlanSelection, ...deepClone(projection.selection) };
    const zeroInterval = isZeroIntervalRange(ui.pollingPlanSelection);
    const adminLocked = launchMode.kind === "local" && ui.adminAccess?.adminUnlocked !== true;
    const logBlock=logImportBlockReason(ui,launchMode.kind,dbViews?.revision);
    const logFeedback=!ui.logImportBusy&&logBlock?{message:logBlock,type:"warning"}:ui.logImportFeedback;
    const adminGate = !adminLocked ? "" : ui.adminAccess?.error
      ? `<section class="card upload-card"><h2>Доступ к плану</h2><p role="alert">Не удалось проверить локальный доступ. Перезапустите инструмент.</p></section>`
      : ui.adminAccess === null
        ? `<section class="card upload-card"><h2>Доступ к плану</h2><p role="status">Проверка локального доступа…</p></section>`
        : `<section class="card upload-card"><h2>${ui.adminAccess.adminConfigured ? "Вход в план опроса" : "Первичная настройка доступа"}</h2><form data-admin-access-form autocomplete="off"><div class="field"><label>Логин<input name="adminUsername" autocomplete="username" required maxlength="64"></label></div><div class="field"><label>Пароль<input name="adminPassword" type="password" autocomplete="${ui.adminAccess.adminConfigured ? "current-password" : "new-password"}" required minlength="12" maxlength="1024"></label></div>${ui.adminAccess.adminConfigured ? "" : `<div class="field"><label>Повторите пароль<input name="adminPasswordConfirm" type="password" autocomplete="new-password" required minlength="12" maxlength="1024"></label></div>`}<button class="button primary" type="submit">${ui.adminAccess.adminConfigured ? "Войти" : "Создать доступ"}</button></form></section>`;
    return `
      <header class="page-header"><div><h1>${escapeHtml(MODULE_CATALOG.find((item) => item.route === "upload").title)}</h1></div></header>
      ${launchMode.kind === "local" ? `<section class="card section-gap workspace-status"><div class="section-heading"><h2>Рабочая база</h2><span class="badge ${ui.workspaceStatus?.status === "ready" ? "success" : "warning"}">${ui.workspaceStatus?.status === "ready" ? "Подключена" : "Не подключена"}</span></div>
        <p class="muted">Завершённые SR, JSON-опросы и аналитика логов сохраняются в выбранной локальной папке и восстанавливаются после входа. Исходные логи и пароли в базу не копируются. База не шифруется: ограничьте доступ к папке средствами Windows.</p>
        ${ui.workspaceStatus?.status === "ready" ? `<p>Папка: <span class="mono break-word">${escapeHtml(ui.workspaceStatus.path)}</span> · ревизия ${escapeHtml(ui.workspaceStatus.dataRevision||ui.workspaceStatus.revision)}</p>` : ui.workspaceStatus?.status === "error" ? `<p class="warning-panel">Рабочая база недоступна или повреждена. Прежние файлы не удалены.</p>` : ""}
        ${ui.workspaceSaveStatus === "saving" ? `<p data-workspace-save-progress role="status">Сохранение рабочей базы… порций: ${ui.workspaceSaveParts || 0}</p>` : ui.workspaceSaveStatus === "restoring" ? `<p role="status">Восстановление рабочей базы порциями…</p>` : ui.workspaceSaveStatus === "saved" ? `<p role="status">Изменения сохранены.</p>` : ui.workspaceSaveStatus === "restored" ? `<p role="status">Данные восстановлены после входа.</p>` : ""}
        ${ui.workspaceSaveError ? `<p class="warning-panel" role="alert">${escapeHtml(ui.workspaceSaveError)}</p>` : ""}
        ${adminLocked ? `<p>Войдите в локальный доступ, чтобы подключить рабочую папку.</p>` : `<form class="form-grid" data-workspace-select-form><div class="field"><label>Путь к рабочей папке<input name="workspacePath" type="text" value="${escapeHtml(ui.workspaceStatus?.path || "")}" placeholder="C:\\AI\\MVP_SPHERE_SR_Data" required></label></div><div class="button-row"><button class="button secondary" type="button" data-workspace-choose>Обзор…</button><button class="button secondary" type="submit">Подключить папку</button></div></form>`}${ui.workspaceStatus?.status === "ready" ? `<button class="button secondary section-gap" type="button" data-workspace-save-now>Сохранить сейчас</button>` : ""}</section>` : ""}
      <div class="upload-grid section-gap">
        <section class="card upload-card"><h2>1. Выгрузка SR</h2>
          <form class="form-grid" data-sr-import-form aria-busy="${ui.inventoryBusy&&ui.inventoryImportKind==="sr"}"><div class="field"><label for="sr-file" class="sr-only">Выберите XLSX-файл выгрузки SR</label><input id="sr-file" name="srFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required${importsBusy?" disabled":""}></div><button class="button primary" type="submit"${importsBusy ? " disabled" : ""}>Загрузить SR</button></form>
          ${renderImportActivity("sr")}
          ${ui.srProgress?`<p class="muted">Строк обработано: ${ui.srProgress.processed||0} / ${ui.srProgress.total||0} · принято: ${ui.srProgress.accepted||0} · отклонено: ${ui.srProgress.rejected||0}</p>`:""}
          ${ui.srImportResults.length ? `<ul class="result-list section-gap">${ui.srImportResults.map((item) => `<li><div><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.detail || "")}</span></div><span class="badge ${item.ok ? "success" : "critical"}">${escapeHtml(formatImportOutcome(item.label))}</span></li>`).join("")}</ul>` : ""}
        </section>
        <section class="card upload-card upload-folder-card"><h2>2. Общая папка результатов опросов</h2>
          <form class="form-grid" data-polling-import-form aria-busy="${ui.inventoryBusy&&ui.inventoryImportKind==="json"}"><div class="field"><label for="polling-files" class="sr-only">Выберите общую папку результатов</label><input id="polling-files" name="pollingFiles" type="file" accept=".json,application/json" webkitdirectory directory multiple required${importsBusy ? " disabled" : ""}></div><label class="polling-tls-option"><input name="forcePollingRescan" type="checkbox"${importsBusy ? " disabled" : ""}> Перепроверить ранее загруженные JSON</label><button class="button primary" type="submit"${importsBusy ? " disabled" : ""}>Импортировать папку</button></form>
          <div class="output-folder-picker section-gap"><div><strong>Папка для новых автоматических опросов</strong><p class="muted">${launchMode.kind === "local" ? (ui.pollingOutputFolderName ? `Выбрана папка: ${escapeHtml(ui.pollingOutputFolderName)}` : "Выберите общую папку до формирования плана.") : "Автоматический опрос доступен после запуска START_MVP_SPHERE_SR.py."}</p></div><button class="button secondary" type="button" data-select-polling-output${launchMode.kind === "local" && !automaticPollingMonitor ? "" : " disabled"}>Выбрать папку</button></div>
          ${ui.pollingRecoverySummary ? `<div class="warning-panel section-gap" role="status"><strong>Незавершённый опрос: ${escapeHtml(ui.pollingRecoverySummary.folder)}</strong><p>Не подтверждено сохранение для ${ui.pollingRecoverySummary.remaining} устройств. Для продолжения повторно загрузите исходную SR или список целей и введите учётные данные.${ui.pollingRecoverySummary.requiresReview ? ` Неясный исход изменения настроек: ${ui.pollingRecoverySummary.requiresReview} устройств требуют отдельной проверки.` : ""}</p><button class="button primary" type="button" data-resume-automatic-polling${automaticPollingMonitor || !credentialPoolSession?.sourceSha256 ? " disabled" : ""}>Продолжить опрос</button></div>` : ""}
          ${renderImportActivity("json")}
          ${pollingProgress && ui.inventoryBusy ? `<section class="polling-progress section-gap" aria-live="polite" aria-busy="true">
            <div class="polling-progress-heading"><strong>${pollingProgress.processed} из ${pollingProgress.total} JSON</strong></div>
            <dl class="polling-progress-metrics"><div><dt>Успешно</dt><dd>${pollingProgress.succeeded}</dd></div><div><dt>Ошибки</dt><dd>${pollingProgress.errors}</dd></div><div><dt>Дубликаты</dt><dd>${pollingProgress.duplicates}</dd></div><div><dt>Скорость</dt><dd>${Number(pollingProgress.filesPerSecond || 0).toFixed(1)} файл/с</dd></div></dl>
            ${pollingProgress.currentRun ? `<p class="muted">Текущий запуск: <span class="mono">${escapeHtml(pollingProgress.currentRun)}</span></p>` : ""}
            ${ui.inventoryBusy ? `<button class="button danger" type="button" data-cancel-polling-import${ui.pollingCancelRequested ? " disabled" : ""}>${ui.pollingCancelRequested ? "Остановка…" : "Отменить загрузку"}</button>` : ""}
          </section>` : ""}
          ${ui.pollingImportSummary && !ui.inventoryBusy ? `<div class="upload-outcome section-gap" role="status"><strong>${escapeHtml(ui.pollingImportSummary.title)}</strong><span>Папок: ${ui.pollingImportSummary.folders} · JSON: ${ui.pollingImportSummary.files} · успешно: ${ui.pollingImportSummary.succeeded}</span><span>Дубликаты: ${ui.pollingImportSummary.duplicates} · ошибки: ${ui.pollingImportSummary.errors} · пропущено: ${ui.pollingImportSummary.ignored}</span></div>` : ""}
        </section>
        ${adminGate}
        <section class="card upload-card upload-credential-card"${adminLocked ? " hidden" : ""}><h2>3. Учётные данные оборудования</h2>
          <p class="muted">Введите пары в порядке проверки. Они действуют только в текущем сеансе.</p>
          <form data-credential-entry-form autocomplete="off"><div data-credential-rows class="credential-rows"><div class="credential-row"><label>Логин<input name="username" autocomplete="off" required maxlength="256"></label><div class="credential-password-field"><label>Пароль<input name="password" type="password" autocomplete="new-password" required maxlength="1024"></label><button class="password-visibility" type="button" data-toggle-password aria-label="Показать пароль" aria-pressed="false">Показать</button></div><button class="button secondary" type="button" data-remove-credential aria-label="Удалить пару">Удалить</button></div></div><div class="button-row section-gap"><button class="button secondary" type="button" data-add-credential>Добавить пару</button><button class="button primary" type="submit"${launchMode.kind !== "local" ? " disabled" : ""}>Передать для опроса</button>${ui.credentialSummary ? `<button class="button secondary" type="button" data-clear-credentials>Очистить</button>` : ""}</div></form>
          ${ui.credentialSummary ? `<p class="credential-ready" role="status">Готово пар: ${ui.credentialSummary.acceptedCount}. Данные будут удалены после опроса.</p>` : ""}
        </section>
      </div>
      <section class="card section-gap"${adminLocked ? " hidden" : ""}><h2>4. План автоматического опроса</h2>${launchMode.kind === "local" ? `<button class="button secondary" type="button" data-admin-lock>Закрыть доступ к плану</button>` : ""}
        <form class="automatic-plan-form" data-polling-plan-form>
          <div class="filter-grid section-gap"><div class="field"><label>Answer mode Huawei Bar 310/Box 310/Box 610 (один IP)<select name="huawei310AnswerMode"><option value=""${!ui.pollingPlanSelection.huawei310AnswerMode ? " selected" : ""}>Не менять</option><option value="automatic"${ui.pollingPlanSelection.huawei310AnswerMode === "automatic" ? " selected" : ""}>Автоматически — включить автоответ</option><option value="manual"${ui.pollingPlanSelection.huawei310AnswerMode === "manual" ? " selected" : ""}>Вручную — отключить автоответ</option></select></label></div></div>
          <div class="filter-grid section-gap"><div class="field"><label>Answer mode Huawei Bar 300/Box 300/Box 600 (один IP или совместимая группа)<select name="huawei300AnswerMode"><option value=""${!ui.pollingPlanSelection.huawei300AnswerMode ? " selected" : ""}>Не менять</option><option value="automatic"${ui.pollingPlanSelection.huawei300AnswerMode === "automatic" ? " selected" : ""}>Автоматически — включить автоответ</option><option value="manual"${ui.pollingPlanSelection.huawei300AnswerMode === "manual" ? " selected" : ""}>Вручную — отключить автоответ</option></select></label></div></div>
          <div class="filter-grid section-gap"><div class="field"><label>Answer mode Polycom Group — одноточечный вызов<select name="polycomPointToPointAnswerMode"><option value=""${!ui.pollingPlanSelection.polycomPointToPointAnswerMode ? " selected" : ""}>Не менять</option><option value="automatic"${ui.pollingPlanSelection.polycomPointToPointAnswerMode === "automatic" ? " selected" : ""}>Автоматически</option><option value="manual"${ui.pollingPlanSelection.polycomPointToPointAnswerMode === "manual" ? " selected" : ""}>Вручную</option></select></label></div><div class="field"><label>Answer mode Polycom Group — многоточечный вызов<select name="polycomMultipointAnswerMode"><option value=""${!ui.pollingPlanSelection.polycomMultipointAnswerMode ? " selected" : ""}>Не менять</option><option value="automatic"${ui.pollingPlanSelection.polycomMultipointAnswerMode === "automatic" ? " selected" : ""}>Автоматически</option><option value="manual"${ui.pollingPlanSelection.polycomMultipointAnswerMode === "manual" ? " selected" : ""}>Вручную</option></select></label></div></div>
          <div class="field"><label for="management-target-list-file">Список устройств для закрытия портов 80 и 23 (http, telnet)</label><input id="management-target-list-file" name="managementTargetListFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
          ${ui.managementTargetListSummary ? `<div class="safe-summary" aria-live="polite"><strong>Список устройств загружен</strong><span>Файл: ${escapeHtml(ui.managementTargetListSummary.filename)}</span><span>Принято устройств: ${ui.managementTargetListSummary.acceptedCount}</span></div><div class="button-row section-gap"><button class="button secondary" type="button" data-download-device-settings-audit>Скачать таблицу фактических настроек</button></div>` : `<p class="muted">Файл должен иметь структуру выгрузки SR. Он используется только для задачи закрытия портов и не добавляется в основную SR или аналитику.</p>`}
          <label class="polling-tls-option"><input name="collectJson" type="checkbox"${ui.pollingPlanSelection.collectJson !== false ? " checked" : ""}> Формировать JSON-опросы</label><label class="polling-tls-option"><input name="collectLogs" type="checkbox"${ui.pollingPlanSelection.collectLogs ? " checked" : ""}> Собирать логи устройств</label>
          <div class="output-folder-picker section-gap"><div><strong>Отдельная папка для логов</strong><p class="muted">${ui.logOutputFolderName ? `Выбрана папка: ${escapeHtml(ui.logOutputFolderName)}` : "Выберите папку при включении сбора логов."}</p></div><button class="button secondary" type="button" data-select-log-output${launchMode.kind === "local" && !automaticPollingMonitor ? "" : " disabled"}>Выбрать папку логов</button></div>
          <fieldset class="polling-mode-selector"><legend>Способ выбора устройств</legend><div>
            <label class="polling-mode-choice"><input type="radio" name="pollingMode" value="${POLLING_SELECTION_MODE_FILTERS}"${projection.mode === POLLING_SELECTION_MODE_FILTERS ? " checked" : ""}> По фильтрам</label>
            <label class="polling-mode-choice"><input type="radio" name="pollingMode" value="${POLLING_SELECTION_MODE_SINGLE_IP}"${projection.mode === POLLING_SELECTION_MODE_SINGLE_IP ? " checked" : ""}> По IP-адресу</label>
          </div></fieldset>
          ${projection.mode === POLLING_SELECTION_MODE_FILTERS ? `<div class="polling-cascade">
            ${renderPollingChoiceGroup("domains", "Домен", projection.availableDomains, projection.selection.domains)}
            ${renderPollingChoiceGroup("categories", "Класс оборудования", projection.availableCategories, projection.selection.categories)}
            ${renderPollingChoiceGroup("manufacturers", "Производитель", projection.availableManufacturers, projection.selection.manufacturers)}
            ${renderPollingChoiceGroup("models", "Модель", projection.availableModels, projection.selection.models)}
          </div>` : `<div class="polling-ip-selector"><div class="field"><label for="polling-target-ip">IP-адрес</label><input id="polling-target-ip" name="ipAddress" data-polling-ip-input inputmode="decimal" autocomplete="off" placeholder="Например, 192.0.2.10" value="${escapeHtml(ui.pollingPlanSelection.ipAddress || "")}"></div><div data-polling-ip-result aria-live="polite">${renderPollingIpTarget(projection)}</div></div>`}
          <div class="filter-grid section-gap"><div class="field"><label>Дата и время начала опроса</label><input name="scheduledAt" type="datetime-local" value="${escapeHtml(ui.pollingPlanSelection.scheduledAt || "")}" required></div><div class="field"><span class="field-label">Интервал между опросами устройств</span><div class="polling-interval-range"><label for="polling-interval-min">От, секунд<input id="polling-interval-min" name="intervalMinSeconds" aria-label="Интервал от, секунд" type="number" min="0" step="1" value="${escapeHtml(ui.pollingPlanSelection.intervalMinSeconds ?? "0")}" required></label><label for="polling-interval-max">До, секунд<input id="polling-interval-max" name="intervalMaxSeconds" aria-label="Интервал до, секунд" type="number" min="0" step="1" value="${escapeHtml(ui.pollingPlanSelection.intervalMaxSeconds ?? "0")}" required></label></div></div><label class="polling-tls-option"><input name="allowInsecureTls" type="checkbox"${ui.pollingPlanSelection.allowInsecureTls ? " checked" : ""}> Разрешить самоподписанный HTTPS-сертификат для этого запуска</label><label class="polling-tls-option"><input name="disableInsecureManagementServices" type="checkbox"${ui.pollingPlanSelection.disableInsecureManagementServices ? " checked" : ""}> Отключить HTTP и Telnet по возможностям модели</label><div class="field"><label>Answer mode Huawei TE20 (один IP)<select name="te20AnswerMode"><option value=""${!ui.pollingPlanSelection.te20AnswerMode ? " selected" : ""}>Не менять</option><option value="automatic"${ui.pollingPlanSelection.te20AnswerMode === "automatic" ? " selected" : ""}>Автоматически — включить автоответ</option><option value="manual"${ui.pollingPlanSelection.te20AnswerMode === "manual" ? " selected" : ""}>Вручную — отключить автоответ</option></select></label></div><div class="field"><label>Answer mode Huawei TE30/TE40/TE50/TE60 (один IP)<select name="teFamilyAnswerMode"><option value=""${!ui.pollingPlanSelection.teFamilyAnswerMode ? " selected" : ""}>Не менять</option><option value="automatic"${ui.pollingPlanSelection.teFamilyAnswerMode === "automatic" ? " selected" : ""}>Автоматически — включить автоответ</option><option value="manual"${ui.pollingPlanSelection.teFamilyAnswerMode === "manual" ? " selected" : ""}>Вручную — отключить автоответ</option></select></label></div>${ui.pollingPlanSelection.disableInsecureManagementServices ? `<p class="muted">Доступно целей ${projection.managementEligibleDevices.length}, будет пропущено ${projection.managementSkippedDevices.length}. Для Bar 310, Box 310 и Box 610 отключается только HTTP; управление Telnet не предоставлено web-интерфейсом. Фильтры используют отдельный список устройств.</p>` : ""}</div>
          <div class="filter-grid section-gap"><div class="field"><label>HTTP Huawei TE20 (один IP)<select name="te20HttpMode"><option value=""${!ui.pollingPlanSelection.te20HttpMode ? " selected" : ""}>Не менять</option><option value="open"${ui.pollingPlanSelection.te20HttpMode === "open" ? " selected" : ""}>Открыть</option><option value="close"${ui.pollingPlanSelection.te20HttpMode === "close" ? " selected" : ""}>Закрыть</option></select></label></div><div class="field"><label>Telnet Huawei TE20 (один IP)<select name="te20TelnetMode"><option value=""${!ui.pollingPlanSelection.te20TelnetMode ? " selected" : ""}>Не менять</option><option value="open"${ui.pollingPlanSelection.te20TelnetMode === "open" ? " selected" : ""}>Открыть</option><option value="close"${ui.pollingPlanSelection.te20TelnetMode === "close" ? " selected" : ""}>Закрыть</option></select></label></div></div>
          <div class="filter-grid section-gap"><div class="field"><label>Автообновление Huawei TE20 (один IP)<select name="te20AutoUpdateMode"><option value=""${!ui.pollingPlanSelection.te20AutoUpdateMode ? " selected" : ""}>Не менять</option><option value="disable"${ui.pollingPlanSelection.te20AutoUpdateMode === "disable" ? " selected" : ""}>Отключить</option></select></label></div></div>
          <div class="filter-grid section-gap"><div class="field"><label>SSH Huawei TE20 (один IP)<select name="te20SshMode"><option value=""${!ui.pollingPlanSelection.te20SshMode ? " selected" : ""}>Не менять</option><option value="enable"${ui.pollingPlanSelection.te20SshMode === "enable" ? " selected" : ""}>Включить</option><option value="disable"${ui.pollingPlanSelection.te20SshMode === "disable" ? " selected" : ""}>Отключить</option></select></label></div></div>
          <fieldset class="polling-mode-selector section-gap"><legend>NTP Huawei TE20 (один IP)</legend><div class="filter-grid"><div class="field"><label>Синхронизация NTP<select name="te20NtpEnabled"><option value=""${!ui.pollingPlanSelection.te20NtpEnabled ? " selected" : ""}>Без изменений</option><option value="enable"${ui.pollingPlanSelection.te20NtpEnabled === "enable" ? " selected" : ""}>Включить</option><option value="disable"${ui.pollingPlanSelection.te20NtpEnabled === "disable" ? " selected" : ""}>Отключить</option></select></label></div><div class="field"><label>Режим адреса NTP<select name="te20NtpMode"><option value=""${!ui.pollingPlanSelection.te20NtpMode ? " selected" : ""}>Без изменений</option><option value="manual"${ui.pollingPlanSelection.te20NtpMode === "manual" ? " selected" : ""}>Вручную</option><option value="automatic"${ui.pollingPlanSelection.te20NtpMode === "automatic" ? " selected" : ""}>Авто</option></select></label></div><div class="field"><label>Имя сервера NTP<select name="te20NtpServerMode"><option value=""${!ui.pollingPlanSelection.te20NtpServerMode ? " selected" : ""}>Без изменений</option><option value="set"${ui.pollingPlanSelection.te20NtpServerMode === "set" ? " selected" : ""}>Ввести значение</option></select></label><input name="te20NtpServerValue" aria-label="Новое имя сервера NTP" autocomplete="off" maxlength="41" placeholder="Имя или IP сервера" value="${escapeHtml(ui.pollingPlanSelection.te20NtpServerValue || "")}"${ui.pollingPlanSelection.te20NtpServerMode === "set" ? "" : " disabled"}></div></div></fieldset>
          <fieldset class="polling-mode-selector section-gap"><legend>Управление питанием Huawei TE20 (один IP)</legend><div class="filter-grid"><div class="field"><label>Shut Down/Restart<select name="te20ShutdownRestart"><option value=""${!ui.pollingPlanSelection.te20ShutdownRestart ? " selected" : ""}>Без изменений</option><option value="enable"${ui.pollingPlanSelection.te20ShutdownRestart === "enable" ? " selected" : ""}>Включить</option><option value="disable"${ui.pollingPlanSelection.te20ShutdownRestart === "disable" ? " selected" : ""}>Отключить</option></select></label></div><div class="field"><label>Переход в спящий режим<select name="te20SleepMinutes"><option value=""${ui.pollingPlanSelection.te20SleepMinutes === "" ? " selected" : ""}>Без изменений</option>${TE20_SLEEP_VALUES.map((minutes) => `<option value="${minutes}"${String(ui.pollingPlanSelection.te20SleepMinutes) === String(minutes) ? " selected" : ""}>${minutes === 0 ? "Никогда" : `${minutes} мин`}</option>`).join("")}</select></label></div><div class="field"><label>Плановый перезапуск<select name="te20ScheduledRestart"><option value=""${!ui.pollingPlanSelection.te20ScheduledRestart ? " selected" : ""}>Без изменений</option><option value="enable"${ui.pollingPlanSelection.te20ScheduledRestart === "enable" ? " selected" : ""}>Включить</option><option value="disable"${ui.pollingPlanSelection.te20ScheduledRestart === "disable" ? " selected" : ""}>Отключить</option></select></label></div><div class="field"><label>Время перезапуска, ЧЧ:ММ<input name="te20RestartTime" type="time" aria-label="Время планового перезапуска" value="${escapeHtml(ui.pollingPlanSelection.te20RestartTime || "")}"></label></div></div></fieldset>
          <div class="warning-panel polling-zero-warning" data-zero-interval-warning role="alert"${zeroInterval ? "" : " hidden"}><strong>Опрос без интервалов</strong><p>При диапазоне 0–0 между опросами устройств не будет пауз. Следующий опрос начнётся сразу после сохранения результата предыдущего устройства.</p><label><input type="checkbox" name="confirmNoInterval" data-confirm-zero-interval${zeroInterval && ui.zeroIntervalAcknowledged ? " checked" : ""}> Подтверждаю запуск опроса без интервалов</label></div>
          <button class="button primary" type="submit" data-start-automatic-polling${databaseTargetsReady() && pollingStartEnabled(ui.pollingPlanSelection, ui.zeroIntervalAcknowledged, Boolean(automaticPollingMonitor)) ? "" : " disabled"}>Сформировать и запустить опрос</button>
        </form>
        <dl class="polling-plan-counts" aria-live="polite"><div><dt>Выбрано устройств</dt><dd data-polling-count="selected">${projection.selectedDevices.length}</dd></div><div><dt>Автоматический опрос доступен</dt><dd data-polling-count="supported">${projection.supportedDevices.length}</dd></div><div><dt>Не поддерживается</dt><dd data-polling-count="unsupported">${projection.unsupportedDevices.length}</dd></div><div><dt>Закрытие портов доступно</dt><dd data-polling-count="management-eligible">${projection.managementEligibleDevices.length}</dd></div><div><dt>Закрытие портов будет пропущено</dt><dd data-polling-count="management-skipped">${projection.managementSkippedDevices.length}</dd></div></dl>
        ${ui.pollingPlanResult ? `<div class="info-panel section-gap">План сформирован: устройств ${ui.pollingPlanResult.total}; автоматический опрос доступен для ${ui.pollingPlanResult.implemented}; не поддерживается ${ui.pollingPlanResult.notImplemented}.</div>` : ""}
        ${automatic ? `<section class="polling-progress section-gap" aria-live="polite"><div class="polling-progress-heading"><div><span class="eyebrow">${escapeHtml(automaticPollingStatusLabel(automatic.status))}</span><strong>${automatic.processed || 0} из ${automatic.total || 0} устройств</strong></div><strong>${automaticPercent}%</strong></div><progress max="100" value="${automaticPercent}">${automaticPercent}%</progress><dl class="polling-progress-metrics"><div><dt>Успешно</dt><dd>${automatic.successful || 0}</dd></div><div><dt>Ошибки опроса</dt><dd>${automatic.failed || 0}</dd></div><div><dt>Ошибки сохранения</dt><dd>${automatic.saveFailed || 0}</dd></div><div><dt>Не поддерживается</dt><dd>${automatic.unsupported || 0}</dd></div><div><dt>Папка запуска</dt><dd class="mono">${escapeHtml(automatic.runFolderName || "будет создана при старте")}</dd></div></dl>${automatic.allowInsecureTls ? `<p class="muted">Для этого запуска разрешён самоподписанный HTTPS-сертификат. Обычный HTTP не используется.</p>` : ""}${!["completed", "cancelled", "failed"].includes(automatic.status) ? `<button class="button danger" type="button" data-cancel-automatic-polling>Отменить опрос</button>` : ""}</section>` : ""}
      </section>
      <section class="card section-gap"><h2>Импорт логов устройств</h2>
        ${ui.workspaceStatus?.pendingLogFiles > 0 && !ui.logImportBusy ? `<p class="info-panel">Есть сохранённые результаты незавершённого импорта. Выберите ту же папку с логами и тот же режим перепроверки, чтобы продолжить.</p>` : ""}
        <form class="form-grid" data-log-import-form novalidate aria-busy="${ui.logImportBusy}"><div class="field"><label for="device-log-files" class="sr-only">Общая папка логов</label><input id="device-log-files" name="logFiles" type="file" webkitdirectory directory multiple required${logBlock ? " disabled" : ""}></div><label class="polling-tls-option"><input name="forceRescan" type="checkbox"${logBlock ? " disabled" : ""}> Перепроверить ранее загруженные файлы целиком</label><button class="button primary" type="submit" aria-describedby="log-import-feedback"${logBlock ? " disabled" : ""}>${ui.logImportBusy?"Импорт выполняется…":ui.workspaceStatus?.pendingLogFiles > 0 ? "Продолжить импорт логов" : "Импортировать папку логов"}</button></form>
        <p id="log-import-feedback" data-log-import-feedback class="${logFeedback?.type==="error"?"error-panel":logFeedback?.type==="warning"?"warning-panel":"info-panel"}" role="status"${logFeedback?"":" hidden"}>${escapeHtml(logFeedback?.message||"")}</p>
        ${renderImportActivity("logs")}
        ${ui.logImportProgress ? `<div class="log-import-progress"><p data-log-import-progress role="status">${escapeHtml(logImportProgressText(ui.logImportProgress))}</p><p data-log-import-speed>${escapeHtml(logImportSpeedText(ui.logImportProgress))}</p>${ui.logImportProgress.phase === "saving" ? "" : `<button class="button danger" type="button" data-cancel-log-import${ui.logImportCancelRequested ? " disabled" : ""}>${ui.logImportCancelRequested ? "Остановка…" : "Остановить импорт"}</button>`}</div>` : ""}
        ${ui.logImportSummary ? `<div class="upload-outcome section-gap" role="status"><strong>Логи импортированы</strong><span>Файлов: ${ui.logImportSummary.files} · размер: ${escapeHtml(formatBytes(ui.logImportSummary.bytes))} · сопоставлено: ${ui.logImportSummary.matched} · проблемы: ${ui.logImportSummary.issues} · без повторного чтения: ${ui.logImportSummary.skippedFiles || 0}</span><span>${Object.entries(ui.logImportSummary.formats).map(([kind, count]) => `${escapeHtml(kind)}: ${count}`).join(" · ")}</span>${ui.dbMode ? '<span>События сохранены в базе. Сводки доступны в модуле анализа перезагрузок.</span>' : `<span>Huawei TE: перезагрузок ${ui.teLogIndex.coverage?.confirmedReboots || 0} · отключений ${ui.teLogIndex.coverage?.powerOffs || 0} · запусков без причины ${ui.teLogIndex.coverage?.unknownStarts || 0}</span>`}</div>${ui.dbMode ? "" : `<div class="table-wrap section-gap"><table><thead><tr><th>Файл</th><th>Папка запуска</th><th>Тип</th><th>Размер</th><th>IP</th><th>Устройство SR</th><th>Сопоставление</th><th>Анализ</th></tr></thead><tbody>${ui.logImportRows.slice(0, 100).map((row) => `<tr><td>${escapeHtml(row.path)}</td><td>${escapeHtml(row.runFolder || "—")}</td><td>${escapeHtml(row.format)}</td><td>${escapeHtml(formatBytes(row.size))}</td><td>${escapeHtml(row.ip || "—")}</td><td>${escapeHtml(row.deviceName || "—")}</td><td>${escapeHtml(row.matchStatus)}</td><td>${escapeHtml(row.analysisStatus || "—")}</td></tr>`).join("")}</tbody></table></div>${ui.logImportRows.length > 100 ? `<p class="muted">Показаны первые 100 файлов из ${ui.logImportRows.length}; итоги рассчитаны по всей папке.</p>` : ""}`}` : ""}
      </section>
      `;
  }

  function renderSnapshotRows(snapshots) {
    if (!snapshots.length) return `<div class="empty-state compact"><p>Снимков пока нет.</p></div>`;
    return `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Файл</th><th>Проект</th><th>Дата данных</th><th>Профиль</th><th>Статус</th><th></th></tr></thead>
          <tbody>
            ${snapshots.map((snapshot) => `
              <tr>
                <td><strong>${escapeHtml(snapshot.filename)}</strong><br><span class="mono muted">${escapeHtml((snapshot.rawSha256 || "").slice(0, 12))}…</span></td>
                <td>${escapeHtml(projectName(snapshot.projectId))}</td>
                <td>${escapeHtml(formatDateTime(snapshot.capturedAt))}</td>
                <td>${escapeHtml(snapshot.schemaProfile)}</td>
                <td>${statusBadge(snapshot.status)}</td>
                <td><button class="button secondary compact-button" type="button" data-view-snapshot="${escapeHtml(snapshot.id)}">Открыть</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function renderSnapshots() {
    if (ui.selectedSnapshotId) {
      const snapshot = state.snapshots.find((item) => item.id === ui.selectedSnapshotId);
      if (snapshot) return renderSnapshotDetail(snapshot);
      ui.selectedSnapshotId = null;
    }
    return `
      <header class="page-header">
        <div><h1>Снимки</h1><p class="page-subtitle">История загруженных файлов, их качества и результатов обработки.</p></div>
        <button class="button primary" type="button" data-route="upload">Загрузить</button>
      </header>
      <section class="card">${renderSnapshotRows([...state.snapshots].sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt)))}</section>`;
  }

  function renderMappingForm(snapshot) {
    const options = state.projects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.displayName)}</option>`).join("");
    return `
      <section class="card mapping-card">
        <h2>Связать снимок с проектом</h2>
        <p class="muted">Legacy-файл не содержит стабильного projectId. Выберите существующий проект или задайте имя нового.</p>
        <form class="form-grid two-column-form" data-map-snapshot="${escapeHtml(snapshot.id)}">
          <div class="field">
            <label for="existing-project">Существующий проект</label>
            <select id="existing-project" name="existingProjectId"><option value="">Создать новый</option>${options}</select>
          </div>
          <div class="field">
            <label for="new-project-name">Имя нового проекта</label>
            <input id="new-project-name" name="displayName" placeholder="Например, переговорная 101">
          </div>
          <button class="button primary" type="submit">Сохранить связь и обработать</button>
        </form>
      </section>`;
  }

  function renderSnapshotDetail(snapshot) {
    const changeSet = state.changeSets.find((item) => item.toSnapshotId === snapshot.id && item.mode === "previous" && item.status === "active");
    const completeness = Object.entries(snapshot.completeness || {});
    return `
      <header class="page-header">
        <div><button class="text-button" type="button" data-back-snapshots>← Все снимки</button><h1>${escapeHtml(snapshot.filename)}</h1><p class="page-subtitle">${escapeHtml(projectName(snapshot.projectId))}</p></div>
        ${statusBadge(snapshot.status)}
      </header>
      <div class="detail-grid">
        <section class="card">
          <h2>Метаданные</h2>
          <dl class="definition-list">
            <div><dt>capturedAt</dt><dd>${escapeHtml(formatDateTime(snapshot.capturedAt))}</dd></div>
            <div><dt>Источник даты</dt><dd>${escapeHtml(snapshot.capturedAtSource || "—")}</dd></div>
            <div><dt>Schema profile</dt><dd>${escapeHtml(snapshot.schemaProfile)}</dd></div>
            <div><dt>Schema version</dt><dd>${escapeHtml(snapshot.schemaVersion || "—")}</dd></div>
            <div><dt>SHA-256</dt><dd class="mono break-word">${escapeHtml(snapshot.rawSha256)}</dd></div>
            <div><dt>Размер</dt><dd>${escapeHtml(formatBytes(snapshot.rawSizeBytes))}</dd></div>
          </dl>
        </section>
        <section class="card">
          <h2>Полнота разделов</h2>
          <ul class="data-list">${completeness.map(([name, value]) => `<li><span>${escapeHtml(name)}</span><span>${escapeHtml(value.status)} · ${escapeHtml(value.source)}</span></li>`).join("") || "<li>Нет данных</li>"}</ul>
        </section>
      </div>
      ${snapshot.status === "needs_project_mapping" ? renderMappingForm(snapshot) : ""}
      <section class="card section-gap">
        <div class="section-heading"><h2>Наблюдения оборудования</h2><span class="badge info">${snapshot.assetObservations.length}</span></div>
        <ul class="result-list">${snapshot.assetObservations.map((observation) => `<li><div><strong>${escapeHtml(observationLabel(observation))}</strong><br><span class="muted">${escapeHtml(observation.kind)} · ${escapeHtml(observation.sourcePaths.join(", "))}</span></div><span class="badge ${observation.matchConfidence === "exact" ? "exact" : "warning"}">${escapeHtml(observation.matchConfidence)}</span></li>`).join("") || "<li>Нет наблюдений</li>"}</ul>
      </section>
      <section class="card section-gap">
        <div class="section-heading"><h2>Проблемы качества и безопасности</h2><span class="badge info">${snapshot.qualityIssues.length}</span></div>
        <ul class="result-list">${snapshot.qualityIssues.map((issue) => `<li><div><strong>${escapeHtml(issue.code)}</strong><br><span class="muted">${escapeHtml(issue.safeDetails || "Обнаружена проблема входных данных")} · ${escapeHtml((issue.sourcePaths || []).join(", "))}</span></div><span class="badge ${escapeHtml(issue.severity)}">${escapeHtml(issue.severity)}</span></li>`).join("") || "<li>Проблем не обнаружено</li>"}</ul>
      </section>
      ${changeSet ? `<section class="card section-gap"><h2>Сравнение с предыдущим снимком</h2><p>${changeSet.events.length} событий изменения.</p><button class="button primary" type="button" data-view-comparison="${escapeHtml(changeSet.id)}">Открыть сравнение</button></section>` : ""}`;
  }

  function renderComparison() {
    const changeSet = state.changeSets.find((item) => item.id === ui.selectedChangeSetId);
    if (!changeSet) return `<div class="empty-state"><h1>Сравнение не найдено</h1><button class="button secondary" type="button" data-route="snapshots">К снимкам</button></div>`;
    const from = state.snapshots.find((item) => item.id === changeSet.fromSnapshotId);
    const to = state.snapshots.find((item) => item.id === changeSet.toSnapshotId);
    return `
      <header class="page-header">
        <div><button class="text-button" type="button" data-back-project="${escapeHtml(changeSet.projectId)}">← К проекту</button><h1>Изменения: ${escapeHtml(projectName(changeSet.projectId))}</h1><p class="page-subtitle">${escapeHtml(formatDateTime(from?.capturedAt))} → ${escapeHtml(formatDateTime(to?.capturedAt))} · режим ${escapeHtml(changeSet.mode)}</p></div>
        <div class="button-row"><span class="badge ${changeSet.status === "active" ? "success" : "warning"}">${escapeHtml(changeSet.status)}</span><span class="badge info">${changeSet.events.length} событий</span></div>
      </header>
      ${changeSet.events.length ? `<div class="change-list">${changeSet.events.map(renderChangeEvent).join("")}</div>` : `<div class="empty-state"><h2>Значимых изменений нет</h2><p>После нормализации снимки эквивалентны.</p></div>`}`;
  }

  function renderChangeEvent(event) {
    const review = event.reviewDecision || getLatestReviewDecision(state, event.id);
    const reviewStatus = review?.decision || event.reviewStatus || "unreviewed";
    return `
      <article class="card change-card">
        <div class="section-heading"><div><span class="eyebrow">${escapeHtml(event.entityType)} · ${escapeHtml(event.field || "lifecycle")}</span><h2>${escapeHtml(EVENT_LABELS[event.eventType] || event.eventType)}</h2></div><div class="button-row"><span class="badge ${escapeHtml(event.severity)}">${escapeHtml(event.severity)}</span><span class="badge ${reviewStatus === "needs_attention" ? "critical" : reviewStatus === "expected" ? "success" : "info"}">${escapeHtml(reviewStatus)}</span></div></div>
        <p><strong>${escapeHtml(event.entityLabel)}</strong> · категория: <span class="badge info">${escapeHtml(event.category)}</span> · уверенность matching: <span class="badge ${event.matchConfidence === "exact" ? "exact" : "warning"}">${escapeHtml(event.matchConfidence)}</span></p>
        <div class="value-diff"><div><span>Было</span><strong>${escapeHtml(displayValue(event.oldValue))}</strong></div><div><span>Стало</span><strong>${escapeHtml(displayValue(event.newValue))}</strong></div></div>
        <details><summary>Почему событие создано</summary><p class="muted">Правило: <span class="mono">${escapeHtml(event.ruleId)}</span></p><ul>${event.evidence.map((item) => `<li><span class="mono">${escapeHtml(item.sourcePath)}</span> · ${escapeHtml(item.quality)}</li>`).join("")}</ul></details>
        <button class="button secondary section-gap" type="button" data-view-event="${escapeHtml(event.id)}">Открыть событие</button>
      </article>`;
  }

  function filterOptions(values, selected, labels) {
    return `<option value="">Все</option>${[...new Set(values.filter(Boolean))].sort().map((value) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(labels?.[value] || value)}</option>`).join("")}`;
  }

  function renderEvents() {
    if (ui.selectedEventId) {
      const located = findChangeEvent(state, ui.selectedEventId);
      if (located) return renderEventDetail(located.changeSet, located.event);
      ui.selectedEventId = null;
    }
    const allEvents = getChangeEvents(state, {});
    const events = getChangeEvents(state, ui.eventFilters);
    const filters = ui.eventFilters;
    return `
      <header class="page-header"><div><h1>События изменений</h1><p class="page-subtitle">Фильтры применяются к активным ChangeSets; superseded-расчёты остаются доступны из истории проекта.</p></div><span class="badge info">${events.length} результатов</span></header>
      <section class="card">
        <form class="filter-grid" data-event-filters>
          <div class="field"><label for="filter-project">Проект</label><select id="filter-project" name="projectId">${filterOptions(state.projects.map((item) => item.id), filters.projectId, Object.fromEntries(state.projects.map((item) => [item.id, item.displayName])))}</select></div>
          <div class="field"><label for="filter-from">Период от</label><input id="filter-from" name="dateFrom" type="date" value="${escapeHtml((filters.dateFrom || "").slice(0, 10))}"></div>
          <div class="field"><label for="filter-to">Период до</label><input id="filter-to" name="dateTo" type="date" value="${escapeHtml((filters.dateTo || "").slice(0, 10))}"></div>
          <div class="field"><label for="filter-entity">Сущность</label><select id="filter-entity" name="entityType">${filterOptions(allEvents.map((item) => item.entityType), filters.entityType)}</select></div>
          <div class="field"><label for="filter-category">Категория</label><select id="filter-category" name="category">${filterOptions(allEvents.map((item) => item.category), filters.category)}</select></div>
          <div class="field"><label for="filter-type">Тип</label><select id="filter-type" name="eventType">${filterOptions(allEvents.map((item) => item.eventType), filters.eventType, EVENT_LABELS)}</select></div>
          <div class="field"><label for="filter-severity">Важность</label><select id="filter-severity" name="severity">${filterOptions(allEvents.map((item) => item.severity), filters.severity)}</select></div>
          <div class="field"><label for="filter-confidence">Уверенность</label><select id="filter-confidence" name="matchConfidence">${filterOptions(allEvents.map((item) => item.matchConfidence), filters.matchConfidence)}</select></div>
          <div class="field"><label for="filter-review">Review</label><select id="filter-review" name="reviewStatus">${filterOptions(["unreviewed", "expected", "needs_attention", "false_match"], filters.reviewStatus)}</select></div>
          <div class="button-row"><button class="button primary" type="submit">Применить</button><button class="button secondary" type="button" data-clear-event-filters>Сбросить</button></div>
        </form>
      </section>
      ${events.length ? `<div class="change-list section-gap">${events.slice(0, 200).map(renderChangeEvent).join("")}</div>` : `<div class="empty-state section-gap"><h2>События не найдены</h2><p>Измените фильтры либо загрузите последовательные snapshots.</p></div>`}`;
  }

  function renderEventDetail(changeSet, originalEvent) {
    const event = getChangeEvents(state, { includeSuperseded: true }).find((item) => item.id === originalEvent.id) || originalEvent;
    const from = state.snapshots.find((item) => item.id === event.fromSnapshotId);
    const to = state.snapshots.find((item) => item.id === event.toSnapshotId);
    const decisions = state.reviewDecisions.filter((item) => item.changeEventId === event.id);
    return `
      <header class="page-header"><div><button class="text-button" type="button" data-back-events>← Все события</button><h1>${escapeHtml(EVENT_LABELS[event.eventType] || event.eventType)}</h1><p class="page-subtitle">${escapeHtml(formatDateTime(from?.capturedAt))} → ${escapeHtml(formatDateTime(to?.capturedAt))} · ${escapeHtml(changeSet.mode)} / ${escapeHtml(changeSet.status)}</p></div></header>
      ${renderChangeEvent(event)}
      <section class="card section-gap">
        <h2>Зафиксировать результат проверки</h2>
        <form class="review-form" data-review-event="${escapeHtml(event.id)}">
          <div class="field"><label for="review-decision">Решение</label><select id="review-decision" name="decision" required><option value="expected">Ожидаемое</option><option value="needs_attention">Требует внимания</option><option value="false_match">Ошибочное сопоставление</option></select></div>
          <div class="field"><label for="review-comment">Комментарий</label><input id="review-comment" name="comment" required placeholder="Основание решения"></div>
          <button class="button primary" type="submit">Сохранить решение</button>
        </form>
      </section>
      <section class="card section-gap"><h2>История review (${decisions.length})</h2><ul class="result-list">${decisions.map((decision) => `<li><div><strong>${escapeHtml(decision.decision)}</strong><br><span class="muted">${escapeHtml(decision.comment)} · ${escapeHtml(formatDateTime(decision.createdAt))}</span></div><span class="mono">${escapeHtml(decision.id)}</span></li>`).join("") || "<li>Решений пока нет</li>"}</ul></section>`;
  }

  function renderMatches() {
    const unresolved = getUnresolvedMatches(state);
    return `
      <header class="page-header"><div><h1>Неоднозначные сопоставления</h1><p class="page-subtitle">Ручное решение сохраняется отдельно и запускает контролируемый пересчёт зависимых ChangeSets.</p></div><span class="badge ${unresolved.length ? "warning" : "success"}">${unresolved.length} открытых</span></header>
      ${unresolved.length ? `<div class="match-list">${unresolved.map((item) => {
        const candidates = (item.observation.matchCandidates || []).map((candidate) => ({ candidate, asset: state.assets.find((asset) => asset.id === candidate.candidateAssetId) })).filter((item) => item.asset);
        return `<article class="card match-card"><div class="section-heading"><div><span class="eyebrow">${escapeHtml(projectName(item.projectId))} · ${escapeHtml(formatDateTime(item.snapshot.capturedAt))}</span><h2>${escapeHtml(observationLabel(item.observation))}</h2></div><span class="badge warning">${escapeHtml(item.observation.matchConfidence)}</span></div><p class="muted">Источники: ${escapeHtml(item.observation.sourcePaths.join(", "))}</p>
          <div class="candidate-grid">${candidates.map(({ candidate, asset }) => `<section><strong>${escapeHtml(asset.displayName)}</strong><p class="muted">${escapeHtml(asset.kind)} · ${escapeHtml(candidate.confidence)}</p><p><b>Совпало:</b> ${escapeHtml(candidate.matchedSignals.join(", ") || "нет")}</p><p><b>Конфликты:</b> ${escapeHtml(candidate.conflictingSignals.join(", ") || "нет")}</p></section>`).join("") || `<p>Автоматических кандидатов нет.</p>`}</div>
          ${item.latestDecision ? `<div class="info-panel">Последнее решение: ${escapeHtml(item.latestDecision.action)} — ${escapeHtml(item.latestDecision.reason)}</div>` : ""}
          <form class="match-form" data-resolve-match="${escapeHtml(item.snapshotId)}" data-observation-id="${escapeHtml(item.observation.id)}">
            <div class="field"><label>Действие</label><select name="action" required><option value="choose">Выбрать существующий Asset</option><option value="create_new">Создать новый Asset</option><option value="replace">Подтвердить замену</option><option value="unmatched">Оставить нерешённым</option></select></div>
            <div class="field"><label>Asset-кандидат</label><select name="selectedAssetId"><option value="">Не выбран</option>${candidates.map(({ asset }) => `<option value="${escapeHtml(asset.id)}">${escapeHtml(asset.displayName)}</option>`).join("")}</select></div>
            <div class="field"><label>Основание</label><input name="reason" required placeholder="Проверенные признаки"></div>
            <button class="button primary" type="submit">Сохранить и пересчитать</button>
          </form>
        </article>`;
      }).join("")}</div>` : `<div class="empty-state"><h2>Неоднозначных сопоставлений нет</h2><p>Все текущие наблюдения связаны с Asset либо новые snapshots ещё не загружены.</p></div>`}`;
  }

  function renderSettings(user) {
    const stateBytes = measureStateBytes(state);
    return `
      <header class="page-header">
        <div>
          <h1>${escapeHtml(MODULE_CATALOG.find((item) => item.route === "settings").title)}</h1>
        </div>
      </header>
      <div class="info-panel">После перезагрузки или закрытия страницы импортированные данные удаляются из памяти текущей вкладки.</div>
      <div class="card-grid">
        <section class="card">
          <h2>Сеансовый режим</h2>
          <p class="muted">localStorage и IndexedDB для рабочих данных не используются. При локальном запуске завершённые импорты сохраняются только в явно выбранную рабочую папку; сырые логи и пароли туда не копируются. Прямой index.html остаётся сеансовым. Экспорт незашифрованной резервной копии отключён.</p>
        </section>
        <section class="card">
          <h2>Использование памяти</h2>
          <p><strong>${formatBytes(stateBytes)}</strong> в текущей вкладке</p>
          <p class="muted">Фактический предел определяется доступной памятью браузера.</p>
        </section>
        ${canPerformAction(state, user.id, "configure_retention") ? `<section class="card">
          <h2>Retention</h2>
          <p class="muted">Проверяется при старте и вручную. Активный baseline не удаляется: он переходит в статус ожидания решения.</p>
          <form class="form-grid" data-retention-form>
            <div class="field">
              <label for="retention-days">Срок хранения, дней</label>
              <input id="retention-days" name="retentionDays" type="number" min="1" max="36500" step="1" value="${state.settings.retentionDays}" required>
            </div>
            <button class="button primary" type="submit">Сохранить и применить retention</button>
          </form>
          <p class="muted">Записей RetentionAudit: ${state.retentionAudits.length}.</p>
        </section>` : ""}
        ${canPerformAction(state, user.id, "manage_users") ? `<section class="card">
          <h2>Demo-пользователи</h2>
          <ul class="data-list">
            ${state.users.map((item) => `<li><span>${escapeHtml(item.name)}</span><span class="role-chip">${escapeHtml(ROLE_NAMES[item.role] || item.role)}</span></li>`).join("")}
          </ul>
        </section>` : ""}
        ${canPerformAction(state, user.id, "reset_state") ? `<section class="card">
          <h2>Сброс</h2>
          <p class="muted">Удаляет текущий local state после явного подтверждения.</p>
          <button class="button danger" type="button" data-reset-demo>Сбросить demo-state</button>
        </section>` : ""}
      </div>`;
  }

  async function handleClick(event) {
    if(event.target.closest("[data-dismiss-operation]")){ui.lastOperation=null;refreshOperationStrip();return;}
    if(ui.dbMode && event.target.closest("[data-db-sources]")) {ui.dbSourcesVisible=!ui.dbSourcesVisible;render();return;}
    if(ui.dbMode && event.target.closest("[data-db-context-retry]")) {
      ui.dbOperationalError=false;
      try{await activateDatabase();await loadOperationalContext();}catch{setMessage("Не удалось подтвердить рабочую базу. Проверьте выбранную папку.","error");render();}
      return;
    }
    if (ui.dbMode && dbViews.handleClick(event.target)) return;
    if (event.target.closest("[data-admin-lock]")) {
      try {
        await runtimeRequest("/api/admin/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        ui.adminAccess = { adminConfigured: true, adminUnlocked: false };
        credentialPoolSession = null;
        ui.credentialSummary = null;
        setMessage("Доступ к плану закрыт.", "success");
      } catch { setMessage("Не удалось закрыть доступ во время активного опроса.", "error"); }
      render();
      return;
    }
    const visibilityToggle = event.target.closest("[data-toggle-password]");
    if (visibilityToggle) {
      const password = visibilityToggle.closest(".credential-row")?.querySelector('[name="password"]');
      if (password) {
        const reveal = password.type === "password";
        password.type = reveal ? "text" : "password";
        visibilityToggle.textContent = reveal ? "Скрыть" : "Показать";
        visibilityToggle.setAttribute("aria-label", reveal ? "Скрыть пароль" : "Показать пароль");
        visibilityToggle.setAttribute("aria-pressed", String(reveal));
      }
      return;
    }
    if (event.target.closest("[data-add-credential]")) {
      const rows = document.querySelector("[data-credential-rows]");
      if (rows && rows.children.length < 10000) {
        const row = rows.firstElementChild.cloneNode(true);
        row.querySelectorAll("input").forEach((input) => { input.value = ""; });
        row.querySelector('[name="password"]').type = "password";
        const toggle = row.querySelector("[data-toggle-password]");
        toggle.textContent = "Показать";
        toggle.setAttribute("aria-label", "Показать пароль");
        toggle.setAttribute("aria-pressed", "false");
        rows.append(row);
        row.querySelector("input")?.focus();
      }
      return;
    }
    if (event.target.closest("[data-remove-credential]")) {
      const row = event.target.closest(".credential-row");
      const rows = row?.parentElement;
      if (rows?.children.length > 1) row.remove();
      else row?.querySelectorAll("input").forEach((input) => { input.value = ""; });
      return;
    }
    if (event.target.closest("[data-clear-credentials]")) {
      try { await runtimeRequest("/api/polling/credentials", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch { /* session may have ended */ }
      credentialPoolSession = null;
      ui.credentialSummary = null;
      ui.pollingPlanResult = null;
      render();
      return;
    }
    if (event.target.closest("[data-workspace-choose]")) {
      if (launchMode.kind !== "local" || ui.adminAccess?.adminUnlocked !== true) return;
      if (ui.logImportBusy || ui.workspaceSaveStatus === "restoring") return;
      if ((state.srImports.length || state.pollingResults.length || ui.logImportRows.length)
        && !global.confirm("Открытие другой рабочей базы может заменить данные текущей вкладки. Прежняя папка останется на диске. Продолжить?")) return;
      try {
        if (workspaceSaveInFlight) await workspaceSaveInFlight;
        const selected = await runtimeRequest("/api/workspace/choose", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: "{}" });
        ui.workspaceStatus = selected;
        if (dbViews || selected.hasSnapshot) await restoreWorkspaceAfterLogin(); else await queueWorkspaceSave();
        setMessage("Рабочая папка подключена.", "success");
      } catch (error) {
        if (error?.safeCode !== "workspace_selection_cancelled")
          setMessage("Папку не удалось выбрать. Можно указать её путь вручную.", "error");
      }
      render();
      return;
    }
    if (event.target.closest("[data-workspace-save-now]")) {
      const saved = await queueWorkspaceSave();
      setMessage(saved ? "Рабочая база сохранена." : "Рабочую базу не удалось сохранить; данные пока только в текущей вкладке.", saved ? "success" : "error");
      render();
      return;
    }
    const navigationAction = resolveNavigationAction(event.target);
    if (navigationAction?.type === "toggle_equipment") {
      const navigation = reduceNavigationState(ui, navigationAction);
      ui.route = navigation.route;
      ui.equipmentExpanded = navigation.equipmentExpanded;
      render();
      return;
    }
    if (event.target.closest("[data-cancel-polling-import]")) {
      ui.pollingCancelRequested = true;
      if (ui.pollingProgress) ui.pollingProgress.cancelRequested = true;
      render();
      return;
    }
    if (event.target.closest("[data-cancel-log-import]")) {
      ui.logImportCancelRequested = true;
      activeLogScanClient?.cancel();
      const button = event.target.closest("[data-cancel-log-import]");
      button.disabled = true;
      button.textContent = "Остановка…";
      return;
    }
    if (event.target.closest("[data-select-polling-output]")) {
      if (launchMode.kind !== "local" || typeof global.showDirectoryPicker !== "function") {
        setMessage("Для выбора папки и автоматического опроса откройте START_MVP_SPHERE_SR.py установленным Python 3.11 или новее.", "error");
        render();
        return;
      }
      try {
        const handle = await global.showDirectoryPicker({ id: "mvp-sphere-polling-output", mode: "readwrite" });
        if (!await ensurePollingOutputPermission(handle)) throw new Error("permission_denied");
        pollingOutputRootHandle = handle;
        ui.pollingOutputFolderName = handle.name || "выбранная папка";
        const foundRecovery = await findPollingRecovery(handle);
        if (foundRecovery || selectedPollingRecovery?.manifest.plan.collectJson !== false) selectedPollingRecovery = foundRecovery;
        ui.pollingRecoverySummary = selectedPollingRecovery ? { folder: selectedPollingRecovery.runDirectory.name, remaining: selectedPollingRecovery.manifest.plan.devices.length - selectedPollingRecovery.manifest.savedIndices.length, requiresReview: selectedPollingRecovery.manifest.requiresReview?.length || 0 } : null;
        await reattachPollingIfPossible();
        setMessage(selectedPollingRecovery ? `Найден незавершённый опрос в папке ${selectedPollingRecovery.runDirectory.name}. Введите учётные данные и нажмите «Продолжить опрос».` : `Общая папка результатов выбрана: ${ui.pollingOutputFolderName}.`, selectedPollingRecovery ? "warning" : "success");
      } catch (error) {
        if (error?.name !== "AbortError") setMessage("Папка не выбрана или запись в неё не разрешена.", "error");
      }
      render();
      return;
    }
    if (event.target.closest("[data-select-log-output]")) {
      if (launchMode.kind !== "local" || typeof global.showDirectoryPicker !== "function") {
        setMessage("Автоматический сбор логов доступен только через START_MVP_SPHERE_SR.py.", "error");
        render();
        return;
      }
      try {
        const handle = await global.showDirectoryPicker({ id: "mvp-sphere-log-output", mode: "readwrite" });
        if (!await ensurePollingOutputPermission(handle)) throw new Error("permission_denied");
        logOutputRootHandle = handle;
        ui.logOutputFolderName = handle.name || "выбранная папка";
        const foundRecovery = await findPollingRecovery(handle);
        if (foundRecovery?.manifest.plan.collectJson === false) selectedPollingRecovery = foundRecovery;
        ui.pollingRecoverySummary = selectedPollingRecovery ? { folder: selectedPollingRecovery.runDirectory.name, remaining: selectedPollingRecovery.manifest.plan.devices.length - selectedPollingRecovery.manifest.savedIndices.length, requiresReview: selectedPollingRecovery.manifest.requiresReview?.length || 0 } : null;
        await reattachPollingIfPossible();
        setMessage("Отдельная папка логов выбрана для текущего сеанса.", "success");
      } catch (error) {
        if (error?.name !== "AbortError") setMessage("Папка логов не выбрана или запись в неё не разрешена.", "error");
      }
      render();
      return;
    }
    if (event.target.closest("[data-cancel-automatic-polling]")) {
      const jobId = ui.automaticPolling?.id || ui.automaticPolling?.jobId;
      if (jobId) {
        try {
          await runtimeRequest(`/api/polling/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
          setMessage("Запрошена отмена автоматического опроса.", "warning");
        } catch { setMessage("Не удалось передать отмену локальному исполнителю.", "error"); }
        render();
      }
      return;
    }
    if (event.target.closest("[data-resume-automatic-polling]")) {
      if(!databaseTargetsReady()){setMessage("Дождитесь завершения импорта и подтверждения актуальной SR в базе перед продолжением опроса.","warning");render();return;}
      if(!await confirmDatabaseTargetsCurrent())return;
      try { await resumeAutomaticPolling(); }
      catch (error) {
        setMessage(({ recovery_unavailable: "Незавершённый опрос не найден в выбранной папке.", recovery_source_required: "Перед продолжением повторно загрузите исходную выгрузку SR или тот же отдельный список закрытия портов: IP, модель и производитель должны совпасть с журналом.", recovery_nothing_to_poll: "Повторный опрос не требуется. Для устройств с неизвестным исходом задачи управления проверьте состояние вручную." })[error.safeCode] || automaticPollingErrorMessage(error.safeCode || "local_runtime_error"), "warning");
        render();
      }
      return;
    }
    const downloadPollingPlan = event.target.closest("[data-download-polling-plan]");
    if (downloadPollingPlan) {
      const exported = buildPollingPlanExport(state, downloadPollingPlan.dataset.downloadPollingPlan);
      if (!exported.ok) { setMessage(exported.errors.join("; "), "error"); render(); return; }
      downloadBlob(JSON.stringify(exported.payload, null, 2), exported.filename, "application/json;charset=utf-8");
      setMessage(`План сохранён: ${exported.payload.devices.length} устройств. Файл не содержит логинов и паролей.`, "success");
      render();
      return;
    }

    if (event.target.closest("[data-start-local-session]")) {
      const user = state.users.find((item) => item.active && item.role === "administrator");
      if (!user) { setMessage("Локальный профиль администратора недоступен.", "error"); render(); return; }
      let next = deepClone(state);
      next.currentUserId = null;
      next = appendHistory(next, { actorId: user.id, actorName: user.name, action: "Начат локальный сеанс", entityType: "session" });
      const sessionResult = writeSessionUserId(next, user.id, sessionStorageRef);
      if (!sessionResult.ok) { setMessage(`Локальный сеанс не создан: ${sessionResult.errors.join("; ")}`, "error"); render(); return; }
      sessionUserId = user.id;
      ui.route = "dashboard";
      if (!commitState(next)) { clearSessionUserId(sessionStorageRef); sessionUserId = null; render(); }
      return;
    }

    const helpTarget = event.target.closest("[data-help-topic]");
    if (helpTarget) {
      const entry = HELP_SECTIONS.flatMap((section) => section.entries).find((item) => item.id === helpTarget.dataset.helpTopic);
      ui.route = "reference";
      ui.helpTopicId = entry?.id || null;
      ui.helpQuery = entry?.title || "";
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-clear-help-search]")) {
      ui.helpQuery = "";
      ui.helpTopicId = null;
      render();
      return;
    }

    const dashboardDevice = event.target.closest("[data-dashboard-device]");
    if (dashboardDevice) {
      ui.route = Object.fromEntries(EQUIPMENT_CATEGORY_CATALOG.map((item) => [item.id, item.route]))[dashboardDevice.dataset.dashboardCategory] || "dashboard";
      ui.selectedInventoryDeviceId = dashboardDevice.dataset.dashboardDevice;
      setMessage(null);
      render();
      return;
    }

    const dashboardRoute = event.target.closest("[data-dashboard-route]");
    if (dashboardRoute) {
      ui.route = dashboardRoute.dataset.dashboardRoute;
      ui.selectedInventoryDeviceId = null;
      ui.inventoryFilters = { ...DEFAULT_INVENTORY_FILTERS };
      Object.entries(dashboardRoute.dataset).forEach(([key, value]) => {
        if (!key.startsWith("filter") || !value) return;
        const filterKey = key.slice(6);
        ui.inventoryFilters[filterKey.charAt(0).toLowerCase() + filterKey.slice(1)] = value;
      });
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-clear-dashboard-filters]")) {
      ui.dashboardFilters = { period: "latest_run" };
      render();
      return;
    }

    if (event.target.closest("[data-clear-reboot-filters]")) {
      ui.rebootFilters = { period: "all", logSilenceMinutes: "60" };
      ui.powerHeatmapCell = null;
      ui.accountedDeviceId = null;
      ui.accountedHeatmapCell = null;
      render();
      return;
    }
    const rebootSubmodule = event.target.closest("[data-reboot-submodule]");
    if (rebootSubmodule) {
      ui.rebootSubmodule = rebootSubmodule.dataset.rebootSubmodule === "power" ? "power" : "reboots";
      ui.rebootView = null;
      ui.accountedHeatmapKind = ui.rebootSubmodule === "power" ? "power_off" : "confirmed_reboot";
      ui.accountedView = ui.rebootSubmodule === "power" ? "power_confirmed" : "reboot";
      ui.accountedHeatmapCell = null;
      ui.accountedDeviceId = null;
      render();
      return;
    }
    const durationChoice = event.target.closest("[data-power-duration]");
    if (durationChoice) {
      ui.powerDurationBucket = POWER_DURATION_BUCKETS.some((item) => item.id === durationChoice.dataset.powerDuration) ? durationChoice.dataset.powerDuration : "over_year";
      render();
      return;
    }
    const heatmapKind = event.target.closest("[data-power-heatmap-kind]");
    if (heatmapKind) {
      ui.powerHeatmapKind = heatmapKind.dataset.powerHeatmapKind === "suspected" ? "suspected" : "confirmed";
      ui.powerHeatmapCell = null;
      render();
      return;
    }
    const heatmapCell = event.target.closest("[data-power-heatmap-cell]");
    if (heatmapCell) {
      ui.powerHeatmapCell = /^([0-6]):(\d|1\d|2[0-3])$/.test(heatmapCell.dataset.powerHeatmapCell || "") ? heatmapCell.dataset.powerHeatmapCell : null;
      render();
      return;
    }
    const accountedView = event.target.closest("[data-accounted-view]");
    if (accountedView) {
      ui.accountedView = ["reboot", "power_confirmed", "power_suspected", "none"].includes(accountedView.dataset.accountedView) ? accountedView.dataset.accountedView : "reboot";
      if (ui.accountedView !== "none") ui.accountedHeatmapKind = ui.accountedView === "reboot" ? "confirmed_reboot" : ui.accountedView === "power_confirmed" ? "power_off" : "suspected_power_loss";
      ui.accountedDeviceId = null;
      ui.accountedHeatmapCell = null;
      render();
      return;
    }
    const accountedDevice = event.target.closest("[data-accounted-device]");
    if (accountedDevice) {
      ui.accountedView = ["reboot", "power_confirmed", "power_suspected"].includes(accountedDevice.dataset.accountedKind) ? accountedDevice.dataset.accountedKind : "reboot";
      ui.accountedHeatmapKind = ui.accountedView === "reboot" ? "confirmed_reboot" : ui.accountedView === "power_confirmed" ? "power_off" : "suspected_power_loss";
      ui.accountedDeviceId = accountedDevice.dataset.accountedDevice;
      ui.accountedHeatmapCell = null;
      render();
      return;
    }
    const accountedKind = event.target.closest("[data-accounted-heatmap-kind]");
    if (accountedKind) {
      ui.accountedHeatmapKind = ["confirmed_reboot", "power_off", "suspected_power_loss"].includes(accountedKind.dataset.accountedHeatmapKind) ? accountedKind.dataset.accountedHeatmapKind : "confirmed_reboot";
      ui.accountedView = ui.accountedHeatmapKind === "confirmed_reboot" ? "reboot" : ui.accountedHeatmapKind === "power_off" ? "power_confirmed" : "power_suspected";
      ui.accountedHeatmapCell = null;
      ui.accountedDeviceId = null;
      render();
      return;
    }
    const accountedCell = event.target.closest("[data-accounted-heatmap-cell]");
    if (accountedCell) {
      ui.accountedHeatmapCell = /^([0-6]):(\d|1\d|2[0-3])$/.test(accountedCell.dataset.accountedHeatmapCell || "") ? accountedCell.dataset.accountedHeatmapCell : null;
      ui.accountedView = ui.accountedHeatmapKind === "confirmed_reboot" ? "reboot" : ui.accountedHeatmapKind === "power_off" ? "power_confirmed" : "power_suspected";
      ui.accountedDeviceId = null;
      render();
      return;
    }
    if (event.target.closest("[data-accounted-clear-detail]")) {
      ui.accountedDeviceId = null;
      ui.accountedHeatmapCell = null;
      render();
      return;
    }
    const accountedDownload = event.target.closest("[data-download-accounted]");
    if (accountedDownload) {
      const kind = accountedDownload.dataset.downloadAccounted;
      const file = buildAccountedVcsXlsx(currentAccountedAnalytics(), kind);
      if (!file.ok || !downloadBlob(file.bytes, `${kind === "reboot" ? "vcs-reboots" : "vcs-power"}-accounted-${nowIso().slice(0, 10)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
        setMessage("XLSX-список терминалов в учёте не сформирован.", "error");
      } else setMessage("Отфильтрованный список терминалов сохранён локально.", "success");
      render();
      return;
    }
    const rebootCard = event.target.closest("[data-reboot-view]");
    if (rebootCard) {
      ui.rebootView = ui.rebootView === rebootCard.dataset.rebootView ? null : rebootCard.dataset.rebootView;
      render();
      if (ui.rebootView) document.getElementById("reboot-detail")?.scrollIntoView({ behavior: global.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      return;
    }
    if (event.target.closest("[data-close-reboot-view]")) {
      ui.rebootView = null;
      render();
      return;
    }
    const analyticsPageButton = event.target.closest("[data-analytics-page]");
    if (analyticsPageButton) {
      const [key, pageText] = String(analyticsPageButton.dataset.analyticsPage || "").split(":");
      if (Object.hasOwn(ui.analyticsPage, key) && Number.isSafeInteger(Number(pageText)) && Number(pageText) >= 0) {
        ui.analyticsPage[key] = Number(pageText);
        render();
      }
      return;
    }

    if (navigationAction?.type === "navigate") {
      const previousRoute = ui.route;
      const navigation = reduceNavigationState(ui, navigationAction);
      ui.route = navigation.route;
      if (ui.route === "reboots" && previousRoute !== "reboots") ui.rebootView = null;
      ui.equipmentExpanded = navigation.equipmentExpanded;
      if (ui.route === "reference") {
        ui.helpQuery = "";
        ui.helpTopicId = null;
      }
      ui.selectedProjectId = null;
      ui.selectedSnapshotId = null;
      ui.selectedChangeSetId = null;
      ui.selectedEventId = null;
      ui.selectedInventoryDeviceId = null;
      setMessage(null);
      render();
      return;
    }

    const vcsTableViewButton = event.target.closest("[data-vcs-table-view]");
    if (vcsTableViewButton) {
      ui.vcsTableView = vcsTableViewButton.dataset.vcsTableView === "siteName" ? "siteName" : "devices";
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-download-site-name]")) {
      const rows = buildVcsSiteNameRows(state, ui.inventoryFilters);
      if (!rows.length) { setMessage("Нет терминалов ВКС для выгрузки по выбранным фильтрам.", "error"); render(); return; }
      const file = buildVcsSiteNameXlsx(rows);
      if (!file.ok || !downloadBlob(file.bytes, `site-name-${nowIso().slice(0, 10)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
        setMessage(file.errors?.[0] || "Не удалось скачать таблицу Site name.", "error");
      } else {
        setMessage("Таблица Site name скачана.", "success");
      }
      render();
      return;
    }

    if (event.target.closest("[data-download-device-settings-audit]")) {
      if(ui.exportActivity)return;
      ui.exportActivity={label:"Экспорт фактических настроек",detail:"Получение последних опросов"};refreshOperationStrip();
      try {
      await cooperativeBrowserYield();
      const targetList=managementTargetListSession;
      let auditState=state;
      if(ui.dbMode) {
        try {
          const revision=dbViews.revision;
          const ips=[...new Set((targetList?.devices||[]).map((device)=>device.ipNormalized).filter(Boolean))];
          const pollingResults=[];
          for(let offset=0;offset<ips.length;offset+=50) {
            const data=await dbRequest("latest",{revision,ips:ips.slice(offset,offset+50)});
            pollingResults.push(...data.rows);
          }
          if(revision!==dbViews.revision)throw new Error("workspace_revision_conflict");
          auditState={...state,pollingResults};
        }catch{throw new Error("audit_facts_unavailable");}
      }
      const file = buildDeviceSettingsAuditXlsx(targetList, auditState);
      if (!file.ok || !downloadBlob(file.bytes, `device-settings-audit-${nowIso().slice(0, 10)}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
        setMessage(file.errors?.[0] || "Не удалось скачать таблицу фактических настроек.", "error");
      } else {
        setMessage(`Таблица скачана: строк ${file.total}, с подтверждёнными фактами ${file.withFacts}.`, "success");
      }
      ui.lastOperation={message:ui.message.text,type:ui.message.type==="error"?"error":"info"};
      }catch{ui.lastOperation={message:"Экспорт фактических настроек не завершён. Прежние данные не изменены.",type:"error"};setMessage(ui.lastOperation.message,"error");}
      finally{ui.exportActivity=null;refreshOperationStrip();}
      render();
      return;
    }

    const inventoryButton = event.target.closest("[data-view-inventory]");
    if (inventoryButton) {
      ui.selectedInventoryDeviceId = inventoryButton.dataset.viewInventory;
      setMessage(null);
      render();
      return;
    }

    const backInventory = event.target.closest("[data-back-inventory]");
    if (backInventory) {
      ui.selectedInventoryDeviceId = null;
      ui.route = backInventory.dataset.backInventory;
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-clear-inventory-filters]")) {
      ui.inventoryFilters = { ...DEFAULT_INVENTORY_FILTERS };
      render();
      return;
    }

    const eventButton = event.target.closest("[data-view-event]");
    if (eventButton) {
      ui.selectedEventId = eventButton.dataset.viewEvent;
      ui.route = "events";
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-back-events]")) {
      ui.selectedEventId = null;
      ui.route = "events";
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-clear-event-filters]")) {
      ui.eventFilters = {};
      ui.selectedEventId = null;
      setMessage(null);
      render();
      return;
    }

    const projectButton = event.target.closest("[data-view-project]");
    if (projectButton) {
      ui.selectedProjectId = projectButton.dataset.viewProject;
      ui.selectedSnapshotId = null;
      ui.selectedChangeSetId = null;
      ui.route = "projects";
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-back-projects]")) {
      ui.selectedProjectId = null;
      ui.selectedSnapshotId = null;
      ui.selectedChangeSetId = null;
      ui.route = "projects";
      setMessage(null);
      render();
      return;
    }

    const backProject = event.target.closest("[data-back-project]");
    if (backProject) {
      ui.selectedProjectId = backProject.dataset.backProject;
      ui.selectedSnapshotId = null;
      ui.selectedChangeSetId = null;
      ui.route = "projects";
      setMessage(null);
      render();
      return;
    }

    const snapshotButton = event.target.closest("[data-view-snapshot]");
    if (snapshotButton) {
      ui.selectedSnapshotId = snapshotButton.dataset.viewSnapshot;
      ui.selectedChangeSetId = null;
      ui.route = "snapshots";
      setMessage(null);
      render();
      return;
    }

    const comparisonButton = event.target.closest("[data-view-comparison]");
    if (comparisonButton) {
      ui.selectedChangeSetId = comparisonButton.dataset.viewComparison;
      ui.selectedProjectId = state.changeSets.find((item) => item.id === ui.selectedChangeSetId)?.projectId || ui.selectedProjectId;
      ui.route = "comparison";
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-back-snapshots]")) {
      ui.route = "snapshots";
      ui.selectedSnapshotId = null;
      ui.selectedChangeSetId = null;
      setMessage(null);
      render();
      return;
    }

    if (event.target.closest("[data-logout]")) {
      const user = currentUser();
      let next = deepClone(state);
      next.currentUserId = null;
      next = appendHistory(next, {
        actorId: user?.id,
        actorName: user?.name,
        action: "Выход из demo-интерфейса",
        entityType: "session"
      });
      clearSessionUserId(sessionStorageRef);
      sessionUserId = null;
      ui.route = "dashboard";
      commitState(next);
      return;
    }

    if (event.target.closest("[data-export-backup]")) {
      if (!canPerformAction(state, currentUser()?.id, "export_backup")) {
        setMessage("Это действие недоступно текущей demo-роли.", "error");
        render();
        return;
      }
      const backup = createBackup(state);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(JSON.stringify(backup, null, 2), `mvp-sphere-sr-backup-${date}.json`, "application/json;charset=utf-8");
      setMessage("Backup подготовлен для скачивания.", "success");
      render();
      return;
    }

    if (event.target.closest("[data-reset-demo]")) {
      if (!canPerformAction(state, currentUser()?.id, "reset_state")) {
        setMessage("Сброс доступен только Администратору МЦТП.", "error");
        render();
        return;
      }
      if (global.confirm("Сбросить все локальные аналитические данные? Действие нельзя отменить.")) {
        const fresh = createDemoState();
        clearSessionUserId(sessionStorageRef);
        sessionUserId = null;
        commitState(fresh, "Локальные аналитические данные сброшены.");
      }
      return;
    }

    if (event.target.closest("[data-download-corrupt]")) {
      downloadBlob(recovery?.raw || "", "mvp-sphere-sr-corrupt-state.txt", "text/plain;charset=utf-8");
      return;
    }

    if (event.target.closest("[data-reset-corrupt]")) {
      if (global.confirm("Безвозвратно заменить повреждённое значение чистым локальным состоянием?")) {
        const fresh = createDemoState();
        clearSessionUserId(sessionStorageRef);
        sessionUserId = null;
        if (commitState(fresh, "Повреждённое значение заменено чистым локальным состоянием.")) recovery = null;
      }
    }
  }

  async function handleSubmit(event) {
    const dbForm = event.target.closest("[data-db-filters]");
    if (ui.dbMode && dbForm) { event.preventDefault(); dbViews.handleSubmit(dbForm); return; }
    const adminForm = event.target.closest("[data-admin-access-form]");
    if (adminForm) {
      event.preventDefault();
      if (launchMode.kind !== "local" || !ui.adminAccess || ui.adminAccess.error) return;
      const fields = new FormData(adminForm);
      const username = String(fields.get("adminUsername") || "");
      const password = String(fields.get("adminPassword") || "");
      const confirm = String(fields.get("adminPasswordConfirm") || "");
      const setup = !ui.adminAccess.adminConfigured;
      adminForm.querySelectorAll("input").forEach((input) => { input.value = ""; });
      if (setup && password !== confirm) { setMessage("Пароли не совпадают.", "error"); render(); return; }
      try {
        await runtimeRequest(setup ? "/api/admin/setup" : "/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
        ui.adminAccess = { adminConfigured: true, adminUnlocked: true };
        setMessage("Доступ к плану открыт для текущего запуска.", "success");
        await restoreWorkspaceAfterLogin();
      } catch (error) {
        if (error.safeCode === "admin_already_configured") ui.adminAccess = { adminConfigured: true, adminUnlocked: false };
        setMessage(setup ? "Не удалось создать доступ. Используйте логин до 64 символов и пароль от 12 символов." : "Неверный логин или пароль либо вход временно ограничен.", "error");
      }
      render();
      return;
    }
    const workspaceForm = event.target.closest("[data-workspace-select-form]");
    if (workspaceForm) {
      event.preventDefault();
      if (launchMode.kind !== "local" || ui.adminAccess?.adminUnlocked !== true) return;
      if (ui.logImportBusy || ui.workspaceSaveStatus === "restoring") return;
      const path = String(new FormData(workspaceForm).get("workspacePath") || "").trim();
      if (!path) { setMessage("Укажите локальную папку рабочей базы.", "error"); render(); return; }
      if (ui.workspaceStatus?.status === "ready" && path === ui.workspaceStatus.path) return;
      if ((state.srImports.length || state.pollingResults.length || ui.logImportRows.length)
        && !global.confirm("Подключение другой рабочей базы может заменить данные текущей вкладки после восстановления. Прежняя папка останется на диске. Продолжить?")) return;
      try {
        if (workspaceSaveInFlight) await workspaceSaveInFlight;
        const selected = await runtimeRequest("/api/workspace/select", { method: "POST",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
        ui.workspaceStatus = selected;
        if (dbViews || selected.hasSnapshot) await restoreWorkspaceAfterLogin();
        else await queueWorkspaceSave();
        setMessage("Рабочая папка подключена. Завершённые данные будут сохраняться локально.", "success");
      } catch (error) {
        setMessage(error?.safeCode === "workspace_path_invalid" ? "Выберите существующую отдельную локальную папку вне каталога проекта."
          : "Рабочую папку не удалось подключить; прежние данные не удалены.", "error");
      }
      render();
      return;
    }
    const referenceSearchForm = event.target.closest("[data-reference-search]");
    if (referenceSearchForm) {
      event.preventDefault();
      ui.helpQuery = String(new FormData(referenceSearchForm).get("query") || "").trim();
      ui.helpTopicId = null;
      render();
      return;
    }

    const dashboardFilterForm = event.target.closest("[data-dashboard-filters]");
    if (dashboardFilterForm) {
      event.preventDefault();
      const formData = new FormData(dashboardFilterForm);
      ui.dashboardFilters = Object.fromEntries(["period", "dateFrom", "dateTo", "category", "manufacturer", "model", "locationId", "vip", "pollStatus"].map((key) => [key, String(formData.get(key) || "")]));
      render();
      return;
    }

    const rebootFilterForm = event.target.closest("[data-reboot-filters]");
    if (rebootFilterForm) {
      event.preventDefault();
      const formData = new FormData(rebootFilterForm);
      ui.rebootFilters = Object.fromEntries(["period", "dateFrom", "dateTo", "category", "domain", "vip", "manufacturer", "model", "locationId", "address", "logSilenceMinutes"].map((key) => [key, String(formData.get(key) || "")]));
      ui.powerHeatmapCell = null;
      ui.accountedDeviceId = null;
      ui.accountedHeatmapCell = null;
      render();
      return;
    }

    const inventoryFilterForm = event.target.closest("[data-inventory-filters]");
    if (inventoryFilterForm) {
      event.preventDefault();
      const formData = new FormData(inventoryFilterForm);
      ui.inventoryFilters = Object.fromEntries(["search", "manufacturer", "model", "locationId", "current", "pollStatus", "ping", "changed", "support", "vip"].map((key) => [key, String(formData.get(key) || "")]));
      ui.route = String(formData.get("route") || ui.route);
      render();
      return;
    }

    const srImportForm = event.target.closest("[data-sr-import-form]");
    if (srImportForm) {
      event.preventDefault();
      if (ui.logImportBusy || ui.inventoryBusy || ui.workspaceSaveStatus === "restoring") {setMessage("Дождитесь завершения текущего импорта и сохранения. Ход операции показан над рабочей областью.","warning");render();return;}
      await handleSrImport(srImportForm);
      return;
    }

    const logImportForm = event.target.closest("[data-log-import-form]");
    if (logImportForm) {
      event.preventDefault();
      const blocked=logImportBlockReason(ui,launchMode.kind,dbViews?.revision);
      if(blocked){setLogImportFeedback(blocked,"warning");return;}
      let files,forceRescan;
      try {
        const recoveryFile=POLLING_RECOVERY?.FILE||"polling-recovery.json";
        files=Array.from(logImportForm.querySelector('[name="logFiles"]')?.files||[]).filter((file)=>file.name!==recoveryFile&&!["Thumbs.db",".DS_Store"].includes(file.name));
        forceRescan=new FormData(logImportForm).get("forceRescan")==="on";
      }catch{
        setLogImportFeedback("Не удалось получить выбранные файлы. Выберите папку повторно; прежние данные базы не изменены.","error");return;
      }
      if(!files.length){setLogImportFeedback("Выберите общую папку логов.","warning");return;}
      ui.logImportBusy = true;
      startImport("logs");
      ui.logImportCancelRequested = false;
      ui.logImportFeedback=null;
      const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
      ui.logImportProgress = { phase: "preparing", processed: 0, total: files.length, bytesRead: 0, totalBytes };
      try {
        render();
        await cooperativeBrowserYield();
        let nativeToken = null;
        let databaseExisting = null;
        if(ui.dbMode) {
          const [rows,registry] = await Promise.all([dbContextRows("logRows"),dbContextRows("logRegistry")]);
          if(registry.length) databaseExisting={rows,registry,indexes:{te:{events:[],sourceSrSha256:dbViews.bootstrap?.logSourceSha||null}}};
        }
        const imported = await prepareDeviceLogImport(files, state, {
          shouldCancel: () => ui.logImportCancelRequested,
          onClient: (client) => { activeLogScanClient = client; if (ui.logImportCancelRequested) client.cancel(); },
          onProgress: (progress) => updateLogImportProgress(progress),
          existing: databaseExisting || (ui.logFileRegistry.length ? { rows: ui.logImportRows, summary: ui.logImportSummary,
            indexes: { te: ui.teLogIndex, huawei310: ui.huawei310LogIndex,
              huawei300Bar: ui.huawei300BarLogIndex, huawei300Box: ui.huawei300BoxLogIndex }, registry: ui.logFileRegistry } : null),
          forceRescan,
          checkpoint: currentLogCheckpointStore(),
          ...(ui.dbMode ? {
            onStart: async ({fullRecheck})=>{nativeToken=await dbImportBegin(fullRecheck?"logs-replace":"logs");},
            onEntry: async ({row,registry,indexes})=>{
              await dbSendRows(nativeToken,"logRows",[row]);
              await dbSendRows(nativeToken,"logRegistry",[registry]);
              for(const [family,index] of Object.entries(indexes)) await dbSendRows(nativeToken,"events:"+family,index.events);
            }
          } : {})
        });
        if (ui.logImportCancelRequested) throw new Error("log_import_cancelled");
        ui.teLogIndex = imported.indexes.te;
        ui.huawei310LogIndex = imported.indexes.huawei310;
        ui.huawei300BarLogIndex = imported.indexes.huawei300Bar;
        ui.huawei300BoxLogIndex = imported.indexes.huawei300Box;
        ui.logImportRows = imported.rows;
        ui.logImportSummary = { ...imported.summary, skippedFiles: imported.skippedFiles };
        ui.logFileRegistry = imported.registry;
        ui.logCompletedCheckpoint = imported.checkpoint;
        if (ui.workspaceStatus?.status === "ready") {
          ui.logImportProgress = { ...ui.logImportProgress, phase: "saving" };
          render();
          await cooperativeBrowserYield();
        }
        let workspaceSaved;
        if(ui.dbMode) {
          await dbImportFinish(nativeToken); workspaceSaved=true;
          try { if(imported.checkpoint) {
            for(let offset=0;offset<imported.checkpoint.keys.length;offset+=512) {
              const cleared=await dbRequest("clear",{revision:dbViews.revision,scope:imported.checkpoint.scope,keys:imported.checkpoint.keys.slice(offset,offset+512)});
              ui.workspaceStatus.pendingLogFiles=cleared.pending;
            }
            ui.logCompletedCheckpoint=null;
          }} catch { /* Published analytics is safe; unused checkpoints can be cleaned on a repeat. */ }
        }
        else workspaceSaved = ui.workspaceStatus?.status !== "ready" || await queueWorkspaceSave();
        const outcome=workspaceSaved ? "Метаданные логов загружены: " + imported.summary.files + " файлов, сопоставлено: " + imported.summary.matched + ", без повторного чтения: " + imported.skippedFiles + ", восстановлено после остановки: " + imported.recoveredFiles + ". Исходные файлы не изменены."
          : "Логи импортированы, но рабочую базу сохранить не удалось. До закрытия вкладки повторите сохранение.";
        setMessage(outcome,workspaceSaved?"success":"warning");
        setLogImportFeedback(outcome,workspaceSaved?"info":"warning");
        finishImport("logs",!workspaceSaved?"failed":imported.summary.issues?"partial":"completed",outcome);
      } catch (error) {
        if (error?.safeCode) ui.workspaceSaveError = workspaceErrorLabel(error.safeCode);
        const message=error?.message === "log_full_reimport_required" ? "Один из прежних файлов или выгрузка SR изменились. Для точной перепроверки выберите полную папку всех ранее импортированных логов; прежняя аналитика сохранена."
          : error?.message === "log_recheck_incomplete" ? "Полная перепроверка одного из прежних логов не завершилась. Старая аналитика сохранена без потери доказательств."
          : ui.logImportCancelRequested || error?.message === "log_import_cancelled"
          ? "Импорт логов остановлен. Прежняя аналитика сохранена; подтверждённые промежуточные результаты можно использовать при продолжении."
          : ui.logImportProgress?.phase==="preparing" ? "Не удалось начать импорт: не получены прежние результаты из рабочей базы. Прежние данные не удалены."
          : "Импорт логов не завершён. Прежняя аналитика и записанные контрольные точки не удалены.";
        const safeCode=typeof error?.safeCode==="string"&&/^[a-z0-9_]{3,80}$/.test(error.safeCode)?error.safeCode:null;
        setMessage(message,ui.logImportCancelRequested?"warning":"error");
        setLogImportFeedback(message+(safeCode?" Код: "+safeCode+".":""),ui.logImportCancelRequested?"warning":"error");
        finishImport("logs",ui.logImportCancelRequested?"cancelled":"failed",message);
      } finally {
        activeLogScanClient = null;
        ui.logImportBusy = false;
        ui.logImportCancelRequested = false;
        ui.logImportProgress = null;
        render();
      }
      return;
    }

    const pollingImportForm = event.target.closest("[data-polling-import-form]");
    if (pollingImportForm) {
      event.preventDefault();
      if (ui.logImportBusy || ui.inventoryBusy || ui.workspaceSaveStatus === "restoring") {setMessage("Дождитесь завершения текущего импорта и сохранения. Ход операции показан над рабочей областью.","warning");render();return;}
      await handlePollingImport(pollingImportForm);
      return;
    }

    const credentialImportForm = event.target.closest("[data-credential-entry-form]");
    if (credentialImportForm) {
      event.preventDefault();
      if (launchMode.kind === "local" && ui.adminAccess?.adminUnlocked !== true) { setMessage("Сначала войдите в план опроса.", "error"); render(); return; }
      if (launchMode.kind !== "local") { setMessage(automaticPollingErrorMessage("runtime_required"), "error"); render(); return; }
      const pairs = Array.from(credentialImportForm.querySelectorAll(".credential-row"), (row) => ({ username: row.querySelector('[name="username"]')?.value.trim() || "", password: row.querySelector('[name="password"]')?.value || "" }));
      const payload = JSON.stringify({ pairs });
      try {
        const response = await runtimeRequest("/api/polling/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
        credentialPoolSession = { sourceSha256: response.sourceSha256 };
        ui.credentialSummary = { acceptedCount: response.summary.acceptedCount };
        ui.pollingPlanResult = null;
        setMessage(`Учётные данные готовы к опросу. Пар: ${response.summary.acceptedCount}.`, "success");
      } catch {
        credentialPoolSession = null;
        ui.credentialSummary = null;
        setMessage("Учётные данные не приняты. Проверьте пары и отсутствие повторов.", "error");
      } finally {
        pairs.forEach((pair) => { pair.username = ""; pair.password = ""; });
        credentialImportForm.querySelectorAll("input").forEach((input) => { input.value = ""; });
      }
      render();
      return;
    }

    const pollingPlanForm = event.target.closest("[data-polling-plan-form]");
    if (pollingPlanForm) {
      event.preventDefault();
      if (launchMode.kind === "local" && ui.adminAccess?.adminUnlocked !== true) { setMessage("Сначала войдите в план опроса.", "error"); render(); return; }
      if(!databaseTargetsReady()){setMessage("План временно заблокирован: импорт ещё не опубликован или актуальные цели не загружены из базы.","warning");render();return;}
      if(!await confirmDatabaseTargetsCurrent())return;
      const formData = new FormData(pollingPlanForm);
      ui.pollingPlanSelection.mode = formData.get("pollingMode") === POLLING_SELECTION_MODE_SINGLE_IP ? POLLING_SELECTION_MODE_SINGLE_IP : POLLING_SELECTION_MODE_FILTERS;
      if (ui.pollingPlanSelection.mode === POLLING_SELECTION_MODE_SINGLE_IP) ui.pollingPlanSelection.ipAddress = String(formData.get("ipAddress") || "");
      ui.pollingPlanSelection.scheduledAt = String(formData.get("scheduledAt") || "");
      ui.pollingPlanSelection.intervalMinSeconds = String(formData.get("intervalMinSeconds") ?? "");
      ui.pollingPlanSelection.intervalMaxSeconds = String(formData.get("intervalMaxSeconds") ?? "");
      ui.pollingPlanSelection.allowInsecureTls = formData.get("allowInsecureTls") === "on";
      ui.pollingPlanSelection.disableInsecureManagementServices = formData.get("disableInsecureManagementServices") === "on";
      ui.pollingPlanSelection.collectLogs = formData.get("collectLogs") === "on";
      ui.pollingPlanSelection.collectJson = formData.get("collectJson") === "on";
      ui.pollingPlanSelection.te20AnswerMode = ["automatic", "manual"].includes(formData.get("te20AnswerMode")) ? String(formData.get("te20AnswerMode")) : "";
      ui.pollingPlanSelection.teFamilyAnswerMode = ["automatic", "manual"].includes(formData.get("teFamilyAnswerMode")) ? String(formData.get("teFamilyAnswerMode")) : "";
      ui.pollingPlanSelection.huawei310AnswerMode = ["automatic", "manual"].includes(formData.get("huawei310AnswerMode")) ? String(formData.get("huawei310AnswerMode")) : "";
      ui.pollingPlanSelection.huawei300AnswerMode = ["automatic", "manual"].includes(formData.get("huawei300AnswerMode")) ? String(formData.get("huawei300AnswerMode")) : "";
      ui.pollingPlanSelection.polycomPointToPointAnswerMode = ["automatic", "manual"].includes(formData.get("polycomPointToPointAnswerMode")) ? String(formData.get("polycomPointToPointAnswerMode")) : "";
      ui.pollingPlanSelection.polycomMultipointAnswerMode = ["automatic", "manual"].includes(formData.get("polycomMultipointAnswerMode")) ? String(formData.get("polycomMultipointAnswerMode")) : "";
      ui.pollingPlanSelection.te20HttpMode = ["open", "close"].includes(formData.get("te20HttpMode")) ? String(formData.get("te20HttpMode")) : "";
      ui.pollingPlanSelection.te20TelnetMode = ["open", "close"].includes(formData.get("te20TelnetMode")) ? String(formData.get("te20TelnetMode")) : "";
      ui.pollingPlanSelection.te20AutoUpdateMode = formData.get("te20AutoUpdateMode") === "disable" ? "disable" : "";
      ui.pollingPlanSelection.te20SshMode = ["enable", "disable"].includes(formData.get("te20SshMode")) ? String(formData.get("te20SshMode")) : "";
      ui.pollingPlanSelection.te20NtpEnabled = ["enable", "disable"].includes(formData.get("te20NtpEnabled")) ? String(formData.get("te20NtpEnabled")) : "";
      ui.pollingPlanSelection.te20NtpMode = ["automatic", "manual"].includes(formData.get("te20NtpMode")) ? String(formData.get("te20NtpMode")) : "";
      ui.pollingPlanSelection.te20NtpServerMode = formData.get("te20NtpServerMode") === "set" ? "set" : "";
      ui.pollingPlanSelection.te20NtpServerValue = String(formData.get("te20NtpServerValue") || "");
      ui.pollingPlanSelection.te20ShutdownRestart = ["enable", "disable"].includes(formData.get("te20ShutdownRestart")) ? String(formData.get("te20ShutdownRestart")) : "";
      ui.pollingPlanSelection.te20SleepMinutes = String(formData.get("te20SleepMinutes") ?? "");
      ui.pollingPlanSelection.te20ScheduledRestart = ["enable", "disable"].includes(formData.get("te20ScheduledRestart")) ? String(formData.get("te20ScheduledRestart")) : "";
      ui.pollingPlanSelection.te20RestartTime = String(formData.get("te20RestartTime") || "");
      ui.zeroIntervalAcknowledged = isZeroIntervalRange(ui.pollingPlanSelection) && formData.get("confirmNoInterval") === "on";
      if (isZeroIntervalRange(ui.pollingPlanSelection) && !ui.zeroIntervalAcknowledged) { setMessage("Подтвердите запуск опроса без интервалов между устройствами.", "warning"); render(); return; }
      if (launchMode.kind !== "local") { setMessage("Для автоматического опроса откройте START_MVP_SPHERE_SR.py установленным Python 3.11 или новее.", "error"); render(); return; }
      if (ui.pollingPlanSelection.collectJson && !pollingOutputRootHandle) { setMessage("Для JSON-опросов выберите общую папку результатов.", "error"); render(); return; }
      if (ui.pollingPlanSelection.collectLogs && !logOutputRootHandle) { setMessage("Для сбора логов выберите отдельную папку логов.", "error"); render(); return; }
      const result = createPollingPlan(state, { ...ui.pollingPlanSelection, managementTargetDevices: managementTargetListSession?.devices || [], managementTargetSourceSha256: managementTargetListSession?.sourceSha256 || "", credentialsReady: Boolean(credentialPoolSession?.sourceSha256), credentialSourceSha256: credentialPoolSession?.sourceSha256 || "", actorId: currentUser()?.id || "system" });
      if (!result.ok) { setMessage(result.errors.join("; "), "error"); render(); return; }
      if (ui.pollingPlanSelection.disableInsecureManagementServices && !global.confirm(`Для точных Huawei TE20/TE30/TE40/TE50/TE60 будут применены подтверждённые настройки HTTP и Telnet; для Bar 310, Box 310 и Box 610 — только HTTP. Отсутствующее управление Telnet на моделях 310 будет отмечено в результате без изменения настройки. HTTP-запись на Box 310/610 ещё не проверена на реальном устройстве: сначала проверьте одну точную модель по IP. Поддерживается целей: ${result.plan.selectionSummary.managementEligible}; будет пропущено: ${result.plan.selectionSummary.managementSkipped}. Продолжить?`)) return;
      if (ui.pollingPlanSelection.te20AnswerMode && !global.confirm(`Answer mode Huawei TE20: ${result.plan.selectionSummary.total} устройств, целевой режим «${ui.pollingPlanSelection.te20AnswerMode === "automatic" ? "Автоматически" : "Вручную"}». ${result.plan.selectionSummary.total > 1 ? "Это массовое изменение. " : ""}Изменится обработка входящих вызовов. Каждое устройство будет проверено отдельно до и после записи. Продолжить?`)) return;
      if (ui.pollingPlanSelection.teFamilyAnswerMode && !global.confirm(`Answer mode Huawei TE30/40/50/60: ${result.plan.selectionSummary.total} устройств, целевой режим «${ui.pollingPlanSelection.teFamilyAnswerMode === "automatic" ? "Автоматически" : "Вручную"}». ${result.plan.selectionSummary.total > 1 ? "Это массовое изменение. " : ""}Изменится обработка входящих вызовов. Каждое устройство будет проверено отдельно до и после записи. Продолжить?`)) return;
      if (ui.pollingPlanSelection.huawei310AnswerMode && !global.confirm(`Answer mode Huawei Bar 310/Box 310/Box 610: ${result.plan.selectionSummary.total} устройств, целевой режим «${ui.pollingPlanSelection.huawei310AnswerMode === "automatic" ? "Автоматически" : "Вручную"}». ${result.plan.selectionSummary.total > 1 ? "Это массовое изменение. " : ""}Изменится обработка входящих вызовов. Каждое устройство будет проверено отдельно до и после записи. Продолжить?`)) return;
      if (ui.pollingPlanSelection.huawei300AnswerMode && !global.confirm(`Answer mode Huawei Bar 300/Box 300/Box 600: ${result.plan.selectionSummary.total} устройств, целевой режим «${ui.pollingPlanSelection.huawei300AnswerMode === "automatic" ? "Автоматически" : "Вручную"}». ${result.plan.selectionSummary.total > 1 ? "Это массовое изменение. " : ""}Изменится обработка входящих вызовов. Каждое устройство будет проверено отдельно до и после максимум одной записи. На Box 300/600 запись пока предварительная до реальной проверки каждой модели. Продолжить?`)) return;
      if (result.plan.managementTasks.includes(MANAGEMENT_TASK_POLYCOM_ANSWER) && !global.confirm(`Answer mode Polycom Group: ${result.plan.selectionSummary.total} устройств. Одноточечные вызовы — ${ui.pollingPlanSelection.polycomPointToPointAnswerMode === "automatic" ? "Автоматически" : ui.pollingPlanSelection.polycomPointToPointAnswerMode === "manual" ? "Вручную" : "Не менять"}; многоточечные — ${ui.pollingPlanSelection.polycomMultipointAnswerMode === "automatic" ? "Автоматически" : ui.pollingPlanSelection.polycomMultipointAnswerMode === "manual" ? "Вручную" : "Не менять"}. ${result.plan.selectionSummary.total > 1 ? "Это массовое изменение. " : ""}Обработка входящих вызовов изменится; на Group 300/500/700 запись предварительная до проверки каждой модели. Каждое устройство проверяется до и после максимум одного запроса записи. Продолжить?`)) return;
      if ((ui.pollingPlanSelection.te20HttpMode || ui.pollingPlanSelection.te20TelnetMode) && !global.confirm(`На одном выбранном Huawei TE20 будут изменены настройки: HTTP — ${ui.pollingPlanSelection.te20HttpMode === "open" ? "открыть" : ui.pollingPlanSelection.te20HttpMode === "close" ? "закрыть" : "не менять"}; Telnet — ${ui.pollingPlanSelection.te20TelnetMode === "open" ? "открыть" : ui.pollingPlanSelection.te20TelnetMode === "close" ? "закрыть" : "не менять"}. Открытие включает соответствующий сетевой сервис. Каждое выбранное поле будет прочитано повторно после записи; состояние TCP listener этим не проверяется. Продолжить?`)) return;
      if (ui.pollingPlanSelection.te20AutoUpdateMode === "disable" && !global.confirm("На одном выбранном Huawei TE20 будет отключено автообновление. Перед записью и после неё инструмент прочитает значение настройки. Продолжить?")) return;
      if (ui.pollingPlanSelection.te20SshMode && !global.confirm(`На одном выбранном Huawei TE20 SSH будет ${ui.pollingPlanSelection.te20SshMode === "enable" ? "включён" : "отключён"}. Перед записью и после неё инструмент прочитает значение настройки. Отключение SSH может прекратить удалённый доступ. Продолжить?`)) return;
      if (result.plan.managementTasks.includes(MANAGEMENT_TASK_TE20_NTP) && !global.confirm("На одном выбранном Huawei TE20 будут изменены только выбранные настройки NTP. Это может изменить время устройства. Будет выполнено чтение до записи и повторное чтение после неё. Продолжить?")) return;
      if (result.plan.managementTasks.includes(MANAGEMENT_TASK_TE20_POWER) && !global.confirm("На одном выбранном Huawei TE20 будут изменены только выбранные настройки питания. Включённое расписание может автоматически перезагрузить терминал в указанное время. Перед записью и после неё инструмент прочитает значения. Продолжить?")) return;
      ui.pollingPlanResult = { ...result.plan.selectionSummary, planId: result.plan.id };
      if (!commitState(result.state, `План сформирован: ${result.plan.selectionSummary.implemented} устройств готовы для автоматического опроса.`)) return;
      try {
        await startAutomaticPolling(result.plan.id, ui.pollingPlanSelection.allowInsecureTls);
        ui.zeroIntervalAcknowledged = false;
        setMessage("План сформирован и передан локальному исполнителю. Опрос запустится в указанное время.", "success");
        render();
      } catch (error) {
        ui.zeroIntervalAcknowledged = false;
        credentialPoolSession = null;
        ui.credentialSummary = null;
        setMessage(automaticPollingErrorMessage(error.safeCode || "local_runtime_error"), "error");
        render();
      }
      return;
    }

    const retentionForm = event.target.closest("[data-retention-form]");
    if (retentionForm) {
      event.preventDefault();
      const user = currentUser();
      if (!canPerformAction(state, user?.id, "configure_retention")) {
        setMessage("Настройка retention доступна только demo-администратору.", "error");
        render();
        return;
      }
      const days = Number(new FormData(retentionForm).get("retentionDays"));
      if (!Number.isInteger(days) || days < 1 || days > 36500) {
        setMessage("Срок retention должен быть целым числом от 1 до 36500 дней.", "error");
        render();
        return;
      }
      const configured = deepClone(state);
      configured.settings.retentionDays = days;
      const retained = applyRetention(configured, {
        actorId: user.id,
        reason: `Manual retention (${days} days)`
      });
      if (!retained.ok) {
        setMessage(`Retention не выполнен: ${retained.errors.join("; ")}`, "error");
        render();
        return;
      }
      commitState(
        retained.state,
        `Retention применён атомарно: удалено snapshots ${retained.expiredCount}; baselines ожидают решения ${retained.pendingBaselineCount}.`
      );
      return;
    }

    const uploadForm = event.target.closest("[data-upload-form]");
    if (uploadForm) {
      event.preventDefault();
      await handleSnapshotUpload(uploadForm);
      return;
    }

    const filterForm = event.target.closest("[data-event-filters]");
    if (filterForm) {
      event.preventDefault();
      const formData = new FormData(filterForm);
      const dateFrom = String(formData.get("dateFrom") || "");
      const dateTo = String(formData.get("dateTo") || "");
      ui.eventFilters = {
        projectId: String(formData.get("projectId") || ""),
        dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : "",
        dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : "",
        entityType: String(formData.get("entityType") || ""),
        category: String(formData.get("category") || ""),
        eventType: String(formData.get("eventType") || ""),
        severity: String(formData.get("severity") || ""),
        matchConfidence: String(formData.get("matchConfidence") || ""),
        reviewStatus: String(formData.get("reviewStatus") || "")
      };
      render();
      return;
    }

    const reviewForm = event.target.closest("[data-review-event]");
    if (reviewForm) {
      event.preventDefault();
      if (!canPerformAction(state, currentUser()?.id, "review_event")) {
        setMessage("Review недоступен текущей demo-роли.", "error");
        render();
        return;
      }
      const formData = new FormData(reviewForm);
      const result = addReviewDecision(state, reviewForm.dataset.reviewEvent, {
        decision: String(formData.get("decision") || ""),
        comment: String(formData.get("comment") || ""),
        actorId: currentUser()?.id || "system"
      });
      if (!result.ok && !result.cancelled) {
        setMessage(`Review не сохранён: ${result.errors.join("; ")}`, "error");
        render();
        return;
      }
      ui.selectedEventId = reviewForm.dataset.reviewEvent;
      ui.route = "events";
      commitState(result.state, "Review-решение добавлено; предыдущая история сохранена.");
      return;
    }

    const matchForm = event.target.closest("[data-resolve-match]");
    if (matchForm) {
      event.preventDefault();
      if (!canPerformAction(state, currentUser()?.id, "resolve_match")) {
        setMessage("Решение matching недоступно текущей demo-роли.", "error");
        render();
        return;
      }
      const formData = new FormData(matchForm);
      const result = resolveMatchDecision(state, matchForm.dataset.resolveMatch, matchForm.dataset.observationId, {
        action: String(formData.get("action") || ""),
        selectedAssetId: String(formData.get("selectedAssetId") || ""),
        reason: String(formData.get("reason") || ""),
        actorId: currentUser()?.id || "system"
      });
      if (!result.ok) {
        setMessage(`Решение matching не сохранено: ${result.errors.join("; ")}`, "error");
        render();
        return;
      }
      ui.route = "matches";
      commitState(result.state, "MatchDecision сохранено; зависимые сравнения пересчитаны без удаления истории.");
      return;
    }

    const baselineForm = event.target.closest("[data-assign-baseline]");
    if (baselineForm) {
      event.preventDefault();
      const formData = new FormData(baselineForm);
      const projectId = baselineForm.dataset.assignBaseline;
      const snapshotId = String(formData.get("snapshotId") || "");
      const reason = String(formData.get("reason") || "");
      const active = getActiveBaselineAssignment(state, projectId);
      let confirmReplace = false;
      if (active && active.snapshotId !== snapshotId) {
        confirmReplace = global.confirm("Заменить текущий baseline? Предыдущее назначение и расчёты останутся в истории.");
        if (!confirmReplace) return;
      }
      const result = assignBaseline(state, projectId, snapshotId, {
        actorId: currentUser()?.id || "system",
        reason,
        confirmReplace
      });
      if (!result.ok) {
        setMessage(`Baseline не изменён: ${result.errors.join("; ")}`, "error");
        render();
        return;
      }
      ui.selectedProjectId = projectId;
      ui.route = "projects";
      commitState(result.state, result.reused ? "Этот snapshot уже является baseline." : active ? "Baseline заменён; история сохранена." : "Baseline назначен.");
      return;
    }

    const endBaselineForm = event.target.closest("[data-end-baseline]");
    if (endBaselineForm) {
      event.preventDefault();
      const projectId = endBaselineForm.dataset.endBaseline;
      const active = getActiveBaselineAssignment(state, projectId);
      const warning = active?.status === "expiration_pending"
        ? "Baseline ожидает решения retention. Явно завершить его и убрать активный drift?"
        : "Завершить активный baseline? История назначений и расчётов останется сохранена.";
      if (!global.confirm(warning)) return;
      const formData = new FormData(endBaselineForm);
      const result = endBaseline(state, projectId, {
        actorId: currentUser()?.id || "system",
        reason: String(formData.get("reason") || ""),
        confirmExpiration: true
      });
      if (!result.ok) {
        setMessage(`Baseline не завершён: ${result.errors.join("; ")}`, "error");
        render();
        return;
      }
      ui.selectedProjectId = projectId;
      ui.route = "projects";
      commitState(result.state, "Baseline завершён; история сохранена.");
      return;
    }

    const comparisonForm = event.target.closest("[data-selected-comparison]");
    if (comparisonForm) {
      event.preventDefault();
      const formData = new FormData(comparisonForm);
      const result = createSelectedComparison(
        state,
        comparisonForm.dataset.selectedComparison,
        String(formData.get("fromSnapshotId") || ""),
        String(formData.get("toSnapshotId") || "")
      );
      if (!result.ok) {
        setMessage(`Сравнение не создано: ${result.errors.join("; ")}`, "error");
        render();
        return;
      }
      let next = result.state;
      if (!result.reused) {
        next = appendHistory(next, {
          actorId: currentUser()?.id || "system",
          actorName: currentUser()?.name || "System",
          action: "Создано сравнение выбранных дат",
          entityType: "change_set",
          entityId: result.changeSetId,
          projectId: comparisonForm.dataset.selectedComparison
        });
      }
      ui.selectedProjectId = comparisonForm.dataset.selectedComparison;
      ui.selectedChangeSetId = result.changeSetId;
      ui.route = "comparison";
      commitState(next, result.reused ? "Открыто ранее рассчитанное сравнение." : "Сравнение выбранных дат создано.");
      return;
    }

    const mappingForm = event.target.closest("[data-map-snapshot]");
    if (mappingForm) {
      event.preventDefault();
      const formData = new FormData(mappingForm);
      const mapped = mapSnapshotToProject(state, mappingForm.dataset.mapSnapshot, {
        existingProjectId: String(formData.get("existingProjectId") || ""),
        displayName: String(formData.get("displayName") || ""),
        actorId: currentUser()?.id || "system"
      });
      if (!mapped.ok) {
        setMessage(`Связь не сохранена: ${mapped.errors.join("; ")}`, "error");
        render();
        return;
      }
      ui.selectedSnapshotId = mapped.snapshotId;
      commitState(mapped.state, "Снимок связан с проектом и обработан.");
      return;
    }

    return;
  }

  function readFileText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result || "")));
      reader.addEventListener("error", () => reject(reader.error || new Error("Не удалось прочитать файл")));
      reader.readAsText(file);
    });
  }

  function readFileArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error || new Error("Не удалось прочитать файл")));
      reader.readAsArrayBuffer(file);
    });
  }

  async function handleSrImport(form) {
    const file = form.elements.srFile?.files?.[0];
    if (!file) return;
    if (launchMode.kind === "local" && ui.workspaceStatus?.status !== "ready") {
      setMessage("Сначала войдите и подключите рабочую папку для сохранения SR.", "error"); render(); return;
    }
    ui.inventoryBusy = true;
    ui.inventoryImportKind="sr";
    startImport("sr");
    ui.srImportResults = [];
    ui.srProgress = { stage: "Чтение выгрузки SR", processed: 0, total: 0, accepted: 0, rejected: 0 };
    render();
    let workspaceSaved = true;
    try {
      const result = await importSrWorkbook(state, { filename: file.name, arrayBuffer: await readFileArrayBuffer(file), actorId: currentUser()?.id || "system", onProgress(progress) { ui.srProgress = progress;advanceImport("sr",{phase:"analyzing",done:progress.processed,total:progress.total,caption:progress.stage},false);render(); } });
      if (result.ok && result.outcome !== "duplicate") {
        state = result.state;
        if(ui.workspaceStatus?.status==="ready"){
          ui.srProgress={...ui.srProgress,stage:"Запись SR в рабочую базу",status:"saving"};
          render();await cooperativeBrowserYield();
        }
        if(ui.dbMode) await saveDatabaseImport("sr",["inventoryDevices","locations","srImports","inventoryIssues"]);
        else if (ui.workspaceStatus?.status === "ready") workspaceSaved = await queueWorkspaceSave();
        pollingImportContextCache = null;
        ui.pollingPlanSelection = { mode: POLLING_SELECTION_MODE_FILTERS, ipAddress: "", domains: [POLLING_ALL], categories: [POLLING_ALL], manufacturers: [POLLING_ALL], models: [POLLING_ALL], scheduledAt: ui.pollingPlanSelection.scheduledAt || "", intervalMinSeconds: ui.pollingPlanSelection.intervalMinSeconds ?? "0", intervalMaxSeconds: ui.pollingPlanSelection.intervalMaxSeconds ?? "0", allowInsecureTls: ui.pollingPlanSelection.allowInsecureTls === true, disableInsecureManagementServices: false };
        ui.pollingPlanResult = null;
      }
      ui.srImportResults.push({ name: file.name, ok: result.ok, label: result.outcome, detail: result.ok ? `Принято ${result.acceptedCount ?? 0}, отклонено ${result.rejectedCount ?? 0}` : result.errors.join("; ") });
      setMessage(result.ok ? workspaceSaved ? launchMode.kind === "local" ? "Выгрузка SR обработана и сохранена." : "Выгрузка SR обработана в текущем сеансе."
        : "Выгрузка SR обработана, но рабочая база не сохранена."
        : "Выгрузка SR не импортирована.", result.ok ? workspaceSaved ? "success" : "warning" : "error");
      ui.srProgress={...ui.srProgress,status:result.ok&&workspaceSaved?"completed":"failed",stage:result.ok&&workspaceSaved?launchMode.kind==="local"?"SR обработана и сохранена":"SR обработана в текущем сеансе":"Импорт SR не завершён"};
      ui.lastOperation={message:ui.srProgress.stage,type:result.ok&&workspaceSaved?"info":"error"};
      finishImport("sr",!result.ok||!workspaceSaved?"failed":result.rejectedCount>0?"partial":"completed",ui.message.text);
    } catch (error) {
      if(ui.dbMode)ui.dbOperationalRevision=null;
      ui.srImportResults.push({ name: file.name, ok: false, label: "failed", detail: `Не удалось обработать файл ${file.name}. Проверьте структуру XLSX и обязательные столбцы.` });
      setMessage(`Не удалось загрузить выгрузку SR ${file.name}. Прежние данные сохранены; проверьте файл и повторите попытку.`, "error");
      ui.srProgress={...ui.srProgress,status:"failed",stage:"Ошибка импорта SR"};
      ui.lastOperation={message:"Импорт SR не завершён. Прежняя база не изменена.",type:"error"};
      finishImport("sr","failed",ui.lastOperation.message);
    }
    ui.inventoryBusy = false;
    ui.inventoryImportKind=null;
    render();
  }

  async function handlePollingImport(form) {
    const selectedFiles = Array.from(form.elements.pollingFiles?.files || []);
    const fullRecheck = new FormData(form).get("forcePollingRescan") === "on";
    if (launchMode.kind === "local" && ui.workspaceStatus?.status !== "ready") {
      setMessage("Сначала войдите и подключите рабочую папку для сохранения JSON-опросов.", "error"); render(); return;
    }
    if (!selectedFiles.length) {
      setMessage("Выберите главную папку с результатами опросов.", "error"); render(); return;
    }
    ui.inventoryBusy = true;
    ui.inventoryImportKind="json";
    startImport("json");
    ui.pollingCancelRequested = false;
    ui.pollingImportResults = [];
    ui.pollingImportSummary = null;
    ui.pollingProgress = { stage: "Поиск файлов", total: selectedFiles.length, processed: 0, succeeded: 0, errors: 0, duplicates: 0, currentRun: null, filesPerSecond: 0, etaSeconds: null, status: "running" };
    render();
    let workspaceSaved = true;
    try {
      const descriptors = selectedFiles.map((file) => ({ name: file.name, relativePath: file.webkitRelativePath || file.name,
        lastModified: file.lastModified, size: file.size, sourceFile: file }));
      let checked=0;
      const selected = await selectNewPollingFiles(descriptors, fullRecheck ? [] : state.pollingResults, async (descriptor) => {
        const prefix = new Uint8Array(await descriptor.sourceFile.slice(0, 2048).arrayBuffer());
        const hash = await sha256Bytes(prefix);
        prefix.fill(0);
        advanceImport("json",{phase:"classifying",done:++checked,total:descriptors.length,caption:"Проверка ранее загруженных JSON"});
        return hash;
      });
      if(ui.dbMode && !fullRecheck) {
        const pending=[];
        for(let offset=0;offset<selected.pending.length;offset+=256) {
          const batch=selected.pending.slice(offset,offset+256);
          const {skip}=await dbRequest("files",{files:batch.map((file)=>({path:normalizePollingRelativePath(file.relativePath),size:file.size,mtime:file.lastModified,prefix:file.sourcePrefixSha256}))});
          batch.forEach((file,index)=>{if(skip[index]) selected.skipped.push(file);else pending.push(file);});
        }
        selected.pending=pending;
      }
      const nativeToken=ui.dbMode ? await dbImportBegin("json") : null;
      let neighborSeeds=new Map();
      if(nativeToken) {state.pollingRuns=await dbContextRows("pollingRuns");pollingImportContextCache=null;}
      const result = selected.pending.length ? await processPollingImportBatches(state, {
        actorId: currentUser()?.id || "system",
        files: selected.pending,
        context: pollingImportContextCache,
        readText: (descriptor) => readFileText(descriptor.sourceFile),
        shouldCancel: () => ui.pollingCancelRequested,
        onProgress: (progress) => updatePollingProgress(ui.dbMode&&progress.status==="completed"
          ?{...progress,stage:"Публикация JSON-опросов в рабочей базе",status:"saving"}:progress, progress.status !== "running"),
        ...(nativeToken ? {
          seedBatch:async(metadata)=>{
            const {seeds}=await dbRequest("neighbors-batch",{token:nativeToken,results:metadata});
            const expected=new Map(metadata.map((row)=>[row.id,row]));
            neighborSeeds=new Map(seeds.map((seed)=>[seed.id,{...seed,expected:expected.get(seed.id)}]));
          },
          seedHistory:async(result)=>{
            const seed=neighborSeeds.get(result.id);
            if(seed && seed.expected.rawSha256===result.rawSha256 && (seed.duplicate ||
                seed.expected.deviceId===result.deviceId && seed.expected.capturedAt===result.capturedAt))return seed;
            return dbRequest("neighbors",{token:nativeToken,result:Object.fromEntries(
              ["id","deviceId","capturedAt","runId","filename","rawSha256","parseStatus"].map((key)=>[key,result[key]]))});
          },
          onBatch:async (batchState,context,run)=>{
          const pairs=[...(context.removedPairs?.values()||[])];
          for(let offset=0;offset<pairs.length;offset+=500)await dbRequest("remove-pairs",{token:nativeToken,pairs:pairs.slice(offset,offset+500)});
          for(const label of ["pollingResults","deviceChanges","inventoryIssues","history"]) await dbSendRows(nativeToken,label,batchState[label]);
          if(run)await dbSendRows(nativeToken,"pollingRuns",[run]);
          neighborSeeds.clear();
          batchState.pollingResults=[];batchState.deviceChanges=[];batchState.inventoryIssues=[];batchState.history=[];
          return true;
        }} : {})
      }) : { ok: true, cancelled: false, outcome: "duplicate", state, context: pollingImportContextCache,
        importedFolderCount: 0, summary: { processed: 0, succeeded: 0, duplicates: 0 }, errorCount: 0, ignored: [] };
      if (!result.ok) {
        ui.pollingImportSummary = { title: "Импорт не завершён", folders: 0, files: 0, succeeded: 0, duplicates: 0, errors: result.rejected?.length || 0, ignored: result.ignored?.length || 0 };
        setMessage(result.errors.join("; "), "error");
        ui.lastOperation={message:"Импорт JSON не завершён. Проверьте структуру выбранной папки.",type:"error"};
        finishImport("json","failed",ui.lastOperation.message);
        ui.inventoryBusy = false;
        ui.inventoryImportKind=null;
        ui.pollingCancelRequested = false;
        pollingImportContextCache = result.context;
        if (pollingProgressRenderTimer) clearTimeout(pollingProgressRenderTimer);
        pollingProgressRenderTimer = null;
        render();
        return;
      }
      state = result.state;
      if(nativeToken) await dbImportFinish(nativeToken);
      else if (ui.workspaceStatus?.status === "ready") workspaceSaved = await queueWorkspaceSave();
      ui.pollingProgress={...ui.pollingProgress,status:result.cancelled?"cancelled":workspaceSaved?"completed":"failed",stage:result.cancelled?"Импорт остановлен":workspaceSaved?"JSON обработаны":"Сохранение не подтверждено"};
      pollingImportContextCache = result.context;
      ui.pollingImportSummary = { title: result.cancelled ? "Импорт остановлен" : result.outcome === "duplicate" ? "Новых опросов нет" : result.outcome === "partial" ? "Импорт завершён частично" : "Папка импортирована", folders: result.importedFolderCount,
        files: result.summary.processed + selected.skipped.length, succeeded: result.summary.succeeded,
        duplicates: result.summary.duplicates + selected.skipped.length, errors: result.errorCount, ignored: result.ignored.length };
      if (result.cancelled) setMessage("Загрузка остановлена пользователем.", "warning");
      else setMessage(workspaceSaved ? `Обработано папок опросов: ${result.importedFolderCount}; JSON-файлов: ${result.summary.processed + selected.skipped.length}; успешно: ${result.summary.succeeded}; без повторного чтения: ${selected.skipped.length}; дубликатов: ${result.summary.duplicates}; ошибок: ${result.errorCount}; проигнорировано не-JSON: ${result.ignored.length}.`
        : "JSON-опросы загружены, но рабочая база не сохранена. Повторите сохранение до закрытия вкладки.", result.outcome === "partial" || !workspaceSaved ? "warning" : "success");
      ui.lastOperation={message:result.cancelled?"Импорт JSON остановлен. Обработанная часть "+(launchMode.kind==="local"?"сохранена в базе.":"остаётся в текущем сеансе."):workspaceSaved?launchMode.kind==="local"?"JSON-опросы обработаны и сохранены в базе.":"JSON-опросы обработаны в текущем сеансе.":"Сохранение JSON не подтверждено.",type:!workspaceSaved?"error":result.cancelled||result.outcome==="partial"?"warning":"info"};
      finishImport("json",!workspaceSaved?"failed":result.cancelled?"cancelled":result.outcome==="partial"?"partial":"completed",ui.lastOperation.message);
    } catch (error) {
      if(ui.dbMode){state.pollingResults=[];state.deviceChanges=[];state.inventoryIssues=[];state.history=[];pollingImportContextCache=null;ui.dbOperationalRevision=null;}
      ui.pollingImportSummary = { title: "Импорт не завершён", folders: 0, files: 0, succeeded: 0, duplicates: 0, errors: 1, ignored: 0 };
      setMessage("Импорт результатов опросов не завершён. Прежние данные сохранены.", "error");
      ui.lastOperation={message:"Импорт JSON не завершён. Прежняя база не изменена.",type:"error"};
      finishImport("json","failed",ui.lastOperation.message);
    }
    ui.inventoryBusy = false;
    ui.inventoryImportKind=null;
    ui.pollingCancelRequested = false;
    if (pollingProgressRenderTimer) clearTimeout(pollingProgressRenderTimer);
    pollingProgressRenderTimer = null;
    render();
  }

  function uploadOutcomeLabel(outcome) {
    return {
      processed: "Обработан",
      partial: "Частично обработан",
      needs_mapping: "Нужно связать проект",
      duplicate: "Дубликат",
      unsupported: "Не поддерживается",
      failed: "Ошибка",
      quota_rejected: "Не сохранён: quota"
    }[outcome] || outcome;
  }

  async function handleSnapshotUpload(form) {
    const files = Array.from(form.elements.snapshots?.files || []);
    const confirmed = Boolean(form.elements.sanitized?.checked);
    if (!files.length || !confirmed) {
      setMessage("Выберите JSON-файлы и подтвердите, что данные sanitized.", "error");
      render();
      return;
    }
    ui.uploadBusy = true;
    ui.uploadResults = [];
    setMessage(null);
    render();
    for (const file of files) {
      try {
        const text = await readFileText(file);
        const result = await ingestSnapshotText(state, {
          name: file.name,
          text,
          uploadedById: currentUser()?.id || "system"
        });
        const shouldPersist = result.outcome !== "duplicate" && result.outcome !== "quota_rejected";
        let persisted = true;
        if (shouldPersist) {
          const saved = saveState(result.state, persistenceStorage);
          persisted = saved.ok;
          if (persisted) { state = deepClone(result.state); void queueWorkspaceSave(); }
        }
        const ok = persisted && !["failed", "unsupported", "quota_rejected"].includes(result.outcome);
        ui.uploadResults.push({
          name: file.name,
          ok,
          label: persisted ? uploadOutcomeLabel(result.outcome) : "Ошибка сохранения",
          detail: persisted ? (result.errors || []).join("; ") : "Предыдущее локальное состояние сохранено без изменений"
        });
      } catch (error) {
        ui.uploadResults.push({ name: file.name, ok: false, label: "Ошибка чтения", detail: error.message || String(error) });
      }
    }
    ui.uploadBusy = false;
    const successful = ui.uploadResults.filter((item) => item.ok).length;
    setMessage(`Обработано файлов: ${ui.uploadResults.length}; успешных результатов: ${successful}.`, successful ? "success" : "warning");
    render();
  }

  function syncZeroIntervalConsent(form) {
    const required = isZeroIntervalRange(ui.pollingPlanSelection);
    const warning = form.querySelector("[data-zero-interval-warning]");
    if (warning) warning.hidden = !required;
    const checkbox = form.querySelector("[data-confirm-zero-interval]");
    if (checkbox) checkbox.checked = required && ui.zeroIntervalAcknowledged;
    const startButton = form.querySelector("[data-start-automatic-polling]");
    if (startButton) startButton.disabled = !databaseTargetsReady() || !pollingStartEnabled(ui.pollingPlanSelection, ui.zeroIntervalAcknowledged, Boolean(automaticPollingMonitor));
  }

  async function handleChange(event) {
    const dbFilterForm=event.target.closest("[data-db-filters]");
    if(ui.dbMode&&dbFilterForm){dbViews.handleChange(event.target,dbFilterForm);return;}
    const pollingPlanForm = event.target.closest("[data-polling-plan-form]");
    if (pollingPlanForm && event.target.name === "te20AnswerMode") {
      ui.pollingPlanSelection.te20AnswerMode = ["automatic", "manual"].includes(event.target.value) ? event.target.value : "";
      return;
    }
    if (pollingPlanForm && event.target.name === "teFamilyAnswerMode") {
      ui.pollingPlanSelection.teFamilyAnswerMode = ["automatic", "manual"].includes(event.target.value) ? event.target.value : "";
      return;
    }
    if (pollingPlanForm && event.target.name === "huawei310AnswerMode") {
      ui.pollingPlanSelection.huawei310AnswerMode = ["automatic", "manual"].includes(event.target.value) ? event.target.value : "";
      return;
    }
    if (pollingPlanForm && event.target.name === "huawei300AnswerMode") {
      ui.pollingPlanSelection.huawei300AnswerMode = ["automatic", "manual"].includes(event.target.value) ? event.target.value : "";
      return;
    }
    if (pollingPlanForm && ["polycomPointToPointAnswerMode", "polycomMultipointAnswerMode"].includes(event.target.name)) {
      ui.pollingPlanSelection[event.target.name] = ["automatic", "manual"].includes(event.target.value) ? event.target.value : "";
      return;
    }
    if (pollingPlanForm && ["te20HttpMode", "te20TelnetMode"].includes(event.target.name)) {
      ui.pollingPlanSelection[event.target.name] = ["open", "close"].includes(event.target.value) ? event.target.value : "";
      return;
    }
    if (pollingPlanForm && event.target.name === "te20AutoUpdateMode") {
      ui.pollingPlanSelection.te20AutoUpdateMode = event.target.value === "disable" ? "disable" : "";
      return;
    }
    if (pollingPlanForm && event.target.name === "te20SshMode") {
      ui.pollingPlanSelection.te20SshMode = ["enable", "disable"].includes(event.target.value) ? event.target.value : "";
      return;
    }
    if (pollingPlanForm && ["te20NtpEnabled", "te20NtpMode", "te20NtpServerMode"].includes(event.target.name)) {
      ui.pollingPlanSelection[event.target.name] = String(event.target.value || "");
      if (event.target.name === "te20NtpServerMode") {
        const serverInput = pollingPlanForm.querySelector('[name="te20NtpServerValue"]');
        if (serverInput) serverInput.disabled = event.target.value !== "set";
      }
      ui.pollingPlanResult = null;
      return;
    }
    if (pollingPlanForm && ["te20ShutdownRestart", "te20SleepMinutes", "te20ScheduledRestart"].includes(event.target.name)) {
      ui.pollingPlanSelection[event.target.name] = String(event.target.value || "");
      ui.pollingPlanResult = null;
      return;
    }
    if (pollingPlanForm && event.target.name === "confirmNoInterval") {
      ui.zeroIntervalAcknowledged = event.target.checked === true && isZeroIntervalRange(ui.pollingPlanSelection);
      syncZeroIntervalConsent(pollingPlanForm);
      return;
    }
    if (pollingPlanForm && event.target.name === "managementTargetListFile") {
      const file = event.target.files?.[0];
      if (!file || !/\.xlsx$/i.test(file.name)) {
        setMessage("Выберите список устройств в формате XLSX.", "error");
        event.target.value = "";
        render();
        return;
      }
      let fileBuffer = null;
      if(ui.managementTargetBusy)return;
      ui.managementTargetBusy=true;refreshOperationStrip();
      try {
        await cooperativeBrowserYield();
        fileBuffer = await readFileArrayBuffer(file);
        const parsed = await parseManagementTargetWorkbook({ arrayBuffer: fileBuffer });
        if (!parsed.ok) throw Object.assign(new Error("management_target_list_invalid"), { safeErrors: parsed.errors });
        managementTargetListSession = { devices: parsed.devices, sourceSha256: parsed.sourceSha256, headers: parsed.headers, rows: parsed.rows };
        ui.managementTargetListSummary = { filename: file.name, acceptedCount: parsed.acceptedCount };
        ui.pollingPlanSelection = { ...ui.pollingPlanSelection, ipAddress: "", domains: [POLLING_ALL], categories: [POLLING_ALL], manufacturers: [POLLING_ALL], models: [POLLING_ALL] };
        ui.pollingPlanResult = null;
        setMessage(`Список устройств для закрытия портов загружен. Принято устройств: ${parsed.acceptedCount}.`, "success");
      } catch (error) {
        const details = Array.isArray(error.safeErrors) ? error.safeErrors.join("; ") : "Проверьте структуру XLSX и уникальность IP-адресов.";
        setMessage(`Список устройств не принят. ${details} Прежний список сохранён.`, "error");
      } finally {
        ui.managementTargetBusy=false;refreshOperationStrip();
        if (fileBuffer) new Uint8Array(fileBuffer).fill(0);
        event.target.value = "";
      }
      render();
      return;
    }
    if (pollingPlanForm && event.target.name === "pollingMode") {
      ui.pollingPlanSelection.mode = event.target.value === POLLING_SELECTION_MODE_SINGLE_IP ? POLLING_SELECTION_MODE_SINGLE_IP : POLLING_SELECTION_MODE_FILTERS;
      ui.pollingPlanResult = null;
      render();
      return;
    }
    if (pollingPlanForm && event.target.matches("[data-polling-plan-filter]")) {
      const dimension = event.target.dataset.pollingPlanFilter;
      const value = String(event.target.value || "");
      const previous = Array.isArray(ui.pollingPlanSelection[dimension]) ? ui.pollingPlanSelection[dimension] : [];
      let nextSelection;
      if (event.target.checked && value === POLLING_ALL) nextSelection = [POLLING_ALL];
      else if (event.target.checked) nextSelection = [...new Set(previous.filter((item) => item !== POLLING_ALL).concat(value))];
      else nextSelection = previous.filter((item) => item !== value);
      ui.pollingPlanSelection[dimension] = nextSelection;
      const projection = deriveAutomaticPollingPlan(state, { ...ui.pollingPlanSelection, managementTargetDevices: managementTargetListSession?.devices || [] });
      ui.pollingPlanSelection = { ...ui.pollingPlanSelection, ...deepClone(projection.selection) };
      ui.pollingPlanResult = null;
      render();
      return;
    }
    if (pollingPlanForm && ["scheduledAt", "intervalMinSeconds", "intervalMaxSeconds"].includes(event.target.name)) {
      ui.pollingPlanSelection[event.target.name] = String(event.target.value || "");
      ui.pollingPlanResult = null;
      syncZeroIntervalConsent(pollingPlanForm);
      return;
    }
    if (pollingPlanForm && event.target.name === "allowInsecureTls") {
      ui.pollingPlanSelection.allowInsecureTls = event.target.checked === true;
      return;
    }
    if (pollingPlanForm && event.target.name === "disableInsecureManagementServices") {
      ui.pollingPlanSelection.disableInsecureManagementServices = event.target.checked === true;
      ui.pollingPlanSelection = { ...ui.pollingPlanSelection, ipAddress: "", domains: [POLLING_ALL], categories: [POLLING_ALL], manufacturers: [POLLING_ALL], models: [POLLING_ALL] };
      ui.pollingPlanResult = null;
      render();
      return;
    }
    if (pollingPlanForm && ["collectLogs", "collectJson"].includes(event.target.name)) {
      ui.pollingPlanSelection[event.target.name] = event.target.checked === true;
      ui.pollingPlanResult = null;
      return;
    }
    if (!event.target.matches("[data-import-backup]") || !event.target.files?.[0]) return;
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = importBackupText(String(reader.result || ""), persistenceStorage, {
        transformState(importedState) {
          return appendHistory(importedState, {
            actorId: "system",
            actorName: "System",
            action: "Импортирован полный JSON backup",
            entityType: "system",
            details: `Файл ${file.name}`
          });
        }
      });
      if (!result.ok) {
        setMessage(`Backup не импортирован: ${result.errors.join("; ")}`, "error");
      } else {
        state = result.state;
        clearSessionUserId(sessionStorageRef);
        sessionUserId = null;
        setMessage("Backup успешно импортирован. Войдите повторно.", "success");
        ui.route = "dashboard";
      }
      event.target.value = "";
      render();
    });
    reader.addEventListener("error", () => {
      setMessage("Не удалось прочитать backup-файл.", "error");
      event.target.value = "";
      render();
    });
    reader.readAsText(file);
  }

  function handleInput(event) {
    const dbFilterForm=event.target.closest("[data-db-filters]");
    if(ui.dbMode&&dbFilterForm&&event.target.tagName==="INPUT"&&event.target.type!=="checkbox"){
      dbViews.handleChange(event.target,dbFilterForm);return;
    }
    const pollingPlanForm = event.target.closest("[data-polling-plan-form]");
    if (!pollingPlanForm) return;
    if (["intervalMinSeconds", "intervalMaxSeconds"].includes(event.target.name)) {
      const value = String(event.target.value || "");
      if (ui.pollingPlanSelection[event.target.name] !== value) ui.zeroIntervalAcknowledged = false;
      ui.pollingPlanSelection[event.target.name] = value;
      ui.pollingPlanResult = null;
      syncZeroIntervalConsent(pollingPlanForm);
      return;
    }
    if (event.target.name === "te20NtpServerValue") {
      ui.pollingPlanSelection.te20NtpServerValue = String(event.target.value || "");
      ui.pollingPlanResult = null;
      return;
    }
    if (event.target.name === "te20RestartTime") {
      ui.pollingPlanSelection.te20RestartTime = String(event.target.value || "");
      ui.pollingPlanResult = null;
      return;
    }
    if (!event.target.matches("[data-polling-ip-input]")) return;
    ui.pollingPlanSelection.ipAddress = String(event.target.value || "");
    ui.pollingPlanResult = null;
    const projection = deriveAutomaticPollingPlan(state, { ...ui.pollingPlanSelection, managementTargetDevices: managementTargetListSession?.devices || [] });
    ui.pollingPlanSelection = { ...ui.pollingPlanSelection, ...deepClone(projection.selection) };
    const resultContainer = pollingPlanForm.querySelector("[data-polling-ip-result]");
    if (resultContainer) resultContainer.innerHTML = renderPollingIpTarget(projection);
    const counts = { selected: projection.selectedDevices.length, supported: projection.supportedDevices.length, unsupported: projection.unsupportedDevices.length, "management-eligible": projection.managementEligibleDevices.length, "management-skipped": projection.managementSkippedDevices.length };
    Object.entries(counts).forEach(([name, value]) => {
      const target = document.querySelector(`[data-polling-count="${name}"]`);
      if (target) target.textContent = String(value);
    });
  }
})(globalThis);
