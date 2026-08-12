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
  const { MODULE_CATALOG, UI_TERMS, EQUIPMENT_CATEGORY_CATALOG, ANALYZED_PARAMETER_RULES } = PRODUCT_CATALOG;
  const EQUIPMENT_CATEGORY_IDS = Object.freeze(EQUIPMENT_CATEGORY_CATALOG.map((item) => item.id));
  const catalogValidation = PRODUCT_CATALOG.validateProductCatalog();
  if (!catalogValidation.ok) throw new Error(`Каталог продукта содержит ошибки: ${catalogValidation.errors.join("; ")}`);
  const HELP_TOPIC_BY_ROUTE = PRODUCT_CATALOG.buildHelpTopicByRoute();

  const HELP_SECTIONS = Object.freeze([
    {
      id: "about", title: "1. Об инструменте", description: "Назначение и границы безопасной работы.", entries: [
        { id: "about-tool", title: "MVP_SPHERE_SR", summary: "Инструмент предназначен для учёта, опроса и анализа состояния оборудования мультимедийной инфраструктуры.", details: "Перечень оборудования формируется по выгрузке SR и включает семь категорий: Терминалы ВКС, Контроллеры, Панели управления, Коммутаторы, Матричные коммутаторы, Скалеры и Аудио процессоры. Состояние появляется только из фактически импортированных результатов опросов.", keywords: ["назначение", "оборудование"] },
        { id: "about-local", title: "Запуск и хранение", summary: "Инструмент имеет один режим: прямое открытие index.html для анализа в текущей вкладке.", details: "Импортированные данные находятся только в памяти страницы и удаляются при перезагрузке или закрытии. Файлы логинов и паролей интерфейс не читает.", keywords: ["index.html", "сеанс", "безопасность", "локально"] }
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
        { id: "term-location", title: "Локация", summary: "Помещение или место установки оборудования; основное название берётся из поля SR «Название комнаты».", keywords: ["комната", "помещение"] },
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
        { id: "logic-folders", title: "Папки запусков опроса", summary: "Общая папка может содержать несколько сеансов; имя каждого сеанса имеет формат YYYY-MM-DD_HH-MM-SS.", details: "Инструмент рекурсивно находит JSON, создаёт отдельный запуск на каждую датированную папку и обрабатывает запуски по времени.", keywords: ["папка", "пакетный импорт", "дата"] },
        { id: "logic-result-time", title: "Дата и время опроса", summary: "Для отдельного JSON используется доступное браузеру время последнего изменения файла.", details: "Это не время создания файла. Если File API не предоставляет валидное значение, время результата остаётся неизвестным; дата папки используется только для группировки запуска.", keywords: ["lastModified", "время файла", "время опроса"] },
        { id: "logic-batch-progress", title: "Массовая загрузка результатов", summary: "Результаты опросов обрабатываются пакетно. Во время загрузки отображается количество найденных и обработанных файлов, ошибки, скорость обработки и примерное оставшееся время.", details: "Повторно уже загруженные результаты пропускаются, если инструмент может надёжно определить, что они уже были импортированы. Активную загрузку можно остановить без удаления уже обработанных результатов.", keywords: ["прогресс", "скорость", "оставшееся время", "дубликат", "отмена"] },
        { id: "logic-matching", title: "Сопоставление с SR", summary: "IP-адрес из имени файла результата сравнивается с IP-адресами выгрузки SR.", details: "При единственном совпадении результат связывается с оборудованием и локацией; иначе сохраняется как требующий проверки.", keywords: ["matching", "unmatched"] },
        { id: "logic-no-network", title: "Как определяется отсутствие ответа", summary: "Перед получением данных инструмент может проверить сетевую доступность; отсутствие ответа отмечается статусом «Нет ответа по сети».", keywords: ["failedStage", "Ping.ok", "ping"] },
        { id: "logic-auth", title: "Как определяется ошибка авторизации", summary: "Устройство доступно, но проверка предоставленных учётных данных завершилась ошибкой.", details: "Причиной могут быть неверные данные или изменившиеся права, но конкретная причина не утверждается без ответа оборудования.", keywords: ["authorization"] },
        { id: "logic-support", title: "Поддержка автоматического опроса", summary: "Наличие устройства в SR не означает наличие подтверждённого механизма его автоматического опроса.", keywords: ["adapter", "supported", "unsupported"] },
        { id: "logic-reboots", title: "Анализ перезагрузок", summary: "Функция находится в разработке.", details: "Показатели появятся только после подтверждения достоверного технического правила определения перезагрузки.", keywords: ["reboot", "перезагрузка"], status: "in_development" }
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
      classification_conflict: "Категория устройства в результате опроса не совпадает с SR. Проверьте карточку оборудования.",
      invalid_ip: "В выгрузке SR указан некорректный IP-адрес. Проверьте исходную строку.",
      missing_identity: "В строке SR недостаточно данных для устойчивого определения устройства. Проверьте инвентарный или серийный номер.",
      ambiguous_identity: "Строка SR может относиться к нескольким устройствам. Требуется проверка идентификаторов.",
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
      support: "not_implemented",
      transport: null,
      normalizerKey: "extron-json-v1",
      credentialMode: "not_configured"
    }),
    Object.freeze({
      key: "panel/extron",
      category: "panel",
      manufacturerNormalized: "extron",
      support: "not_implemented",
      transport: null,
      normalizerKey: "extron-json-v1",
      credentialMode: "not_configured"
    })
  ]);

  const SR_REQUIRED_HEADERS = Object.freeze([
    "Название комнаты", "Адрес комнаты", "VIP комната", "Тип оборудования",
    "Наименование", "Модель", "Тип модели", "Производитель", "IP", "MAC",
    "SIP URI", "Инвентарный номер", "Серийный номер", "VIP оборудование"
  ]);

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
    return `${(bytes / (1024 * 1024)).toFixed(2)} МиБ`;
  }

  function serializeState(state) {
    return JSON.stringify(state);
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
    return normalized;
  }

  function getSrValue(row, expectedHeader) {
    if (!isPlainObject(row)) return null;
    const expected = normalizeSrHeader(expectedHeader);
    const key = Object.keys(row).find((candidate) => normalizeSrHeader(candidate) === expected);
    return key === undefined ? null : row[key];
  }

  function classifySrDevice(row) {
    const descriptor = EQUIPMENT_CATEGORY_CATALOG.find((item) => normalizeText(getSrValue(row, item.srField)) === normalizeText(item.srValue));
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

  function derivePollingStatus(payload) {
    const failedStage = normalizeText(getCaseInsensitive(payload, "failedStage"));
    const ping = getCaseInsensitive(payload, "ping");
    const pingOk = isPlainObject(ping) && typeof getCaseInsensitive(ping, "ok") === "boolean"
      ? getCaseInsensitive(ping, "ok")
      : null;
    let pingStatus = "unknown";
    if (failedStage === "ping" && pingOk === false) pingStatus = "failed";
    else if (pingOk === true) pingStatus = "ok";
    const explicitOk = getCaseInsensitive(payload, "ok");
    const authFailure = ["authorization", "authentication", "auth"].includes(failedStage) && explicitOk === false;
    let pollStatus = "unknown";
    if (authFailure) pollStatus = "authorization_error";
    else if (pingStatus === "failed") pollStatus = "network_unreachable";
    else if (explicitOk === true) pollStatus = "success";
    else if (explicitOk === false) pollStatus = "processing_error";
    return {
      pollStatus,
      pingStatus,
      authorizationStatus: authFailure ? "failed" : "unknown",
      rebootCount: null,
      gcPlus: null
    };
  }

  function resolvePollingResultTimestamp(input) {
    const lastModified = Number(input?.lastModified);
    if (Number.isFinite(lastModified) && lastModified > 0) {
      const date = new Date(lastModified);
      if (Number.isFinite(date.getTime())) return { capturedAt: date.toISOString(), source: "file_last_modified", sourceLastModified: lastModified };
    }
    return { capturedAt: null, source: "unavailable", sourceLastModified: null };
  }

  function resolvePollingCapability(device) {
    const category = normalizeText(device && device.category);
    const manufacturerNormalized = normalizeManufacturer(device && (device.manufacturerNormalized || device.manufacturerRaw));
    const descriptor = POLLING_ADAPTERS.find((item) => item.category === category && item.manufacturerNormalized === manufacturerNormalized);
    if (descriptor) return deepClone(descriptor);
    return {
      key: null,
      category,
      manufacturerNormalized,
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

  function pollingPayloadProjection(payload) {
    if (!isPlainObject(payload)) return {};
    const projected = {
      ok: getCaseInsensitive(payload, "ok") ?? null,
      failedStage: getCaseInsensitive(payload, "failedStage") ?? null,
      ping: getCaseInsensitive(payload, "ping") ?? null,
      webInterface: getCaseInsensitive(payload, "webInterface") ?? null,
      webBlocks: getCaseInsensitive(payload, "webBlocks") ?? null
    };
    return stableJsonValue(projected);
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
        const missingHeaders = SR_REQUIRED_HEADERS.filter((required) => !headers.some((header) => normalizeSrHeader(header) === normalizeSrHeader(required)));
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
    const get = (header) => getSrValue(row, header);
    const manufacturerRaw = normalizeDisplay(get("Производитель"));
    return {
      roomName: normalizeDisplay(get("Название комнаты")),
      roomAddress: normalizeDisplay(get("Адрес комнаты")),
      roomVip: normalizeBoolean(get("VIP комната")),
      equipmentTypeRaw: normalizeDisplay(get("Тип оборудования")),
      equipmentTypeNormalized: normalizeText(get("Тип оборудования")),
      nameRaw: normalizeDisplay(get("Наименование")),
      modelRaw: normalizeDisplay(get("Модель")),
      modelNormalized: normalizeText(get("Модель")),
      modelTypeRaw: normalizeDisplay(get("Тип модели")),
      modelTypeNormalized: normalizeText(get("Тип модели")),
      manufacturerRaw,
      manufacturerNormalized: normalizeManufacturer(manufacturerRaw),
      ipRaw: normalizeDisplay(get("IP")),
      ipNormalized: normalizeIpv4(get("IP")),
      macRaw: normalizeDisplay(get("MAC")),
      macNormalized: normalizeMacLoose(get("MAC")),
      sipUri: normalizeDisplay(get("SIP URI")),
      inventoryNumber: normalizeDisplay(get("Инвентарный номер")),
      serialNumber: normalizeDisplay(get("Серийный номер")),
      deviceVip: normalizeBoolean(get("VIP оборудование")),
      domain: normalizeDisplay(get("Домен")),
      category: classifySrDevice(row),
      rawRow: deepClone(row)
    };
  }

  function findInventoryCandidates(devices, row) {
    const levels = [
      row.inventoryNumber && ((device) => normalizeText(device.inventoryNumber) === normalizeText(row.inventoryNumber)),
      row.serialNumber && row.manufacturerNormalized && ((device) => normalizeText(device.serialNumber) === normalizeText(row.serialNumber) && device.manufacturerNormalized === row.manufacturerNormalized),
      row.macNormalized && ((device) => device.macNormalized === row.macNormalized),
      !row.inventoryNumber && !row.serialNumber && !row.macNormalized && row.ipNormalized && ((device) => device.ipNormalized === row.ipNormalized || (device.ipHistory || []).includes(row.ipNormalized))
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
    const missingHeaders = SR_REQUIRED_HEADERS.filter((required) => !headers.some((header) => normalizeSrHeader(header) === normalizeSrHeader(required)));
    if (missingHeaders.length) return { ok: false, outcome: "failed", state: deepClone(currentState), errors: [`Отсутствуют обязательные колонки: ${missingHeaders.join(", ")}`] };
    if (input.rawSha256 && currentState.srImports.some((item) => item.rawSha256 === input.rawSha256)) {
      return { ok: true, outcome: "duplicate", state: deepClone(currentState), errors: [] };
    }
    let next = deepClone(currentState);
    const importedAt = input.importedAt || nowIso();
    const srImport = { id: createId("sr-import"), filename: input.filename || "inventory.xlsx", sheetName: input.sheetName || "", rawSha256: input.rawSha256 || null, importedAt, importedById: input.actorId || "system", rowCount: rows.length, acceptedCount: 0, rejectedCount: 0, status: "processing" };
    next.inventoryDevices.forEach((device) => { device.inCurrentSr = false; });
    next.locations.forEach((location) => { location.inCurrentSr = false; });
    rows.forEach((rawRow, index) => {
      const rowNumber = index + 2;
      const row = normalizedSrRow(rawRow);
      const hasIdentity = row.inventoryNumber || row.serialNumber || row.macNormalized || row.ipNormalized;
      if (!hasIdentity) {
        srImport.rejectedCount += 1;
        next.inventoryIssues.push(createInventoryIssue({ kind: "missing_identity", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Строка не содержит пригодного inventory/serial/MAC/IP", details: { rawRow } }));
        return;
      }
      const locationKey = `${normalizeText(row.roomName) || ""}|${normalizeText(row.roomAddress) || ""}`;
      let location = next.locations.find((item) => item.identityKey === locationKey);
      if (!location) {
        location = { id: createId("location"), identityKey: locationKey, name: row.roomName, address: row.roomAddress, vip: row.roomVip, domain: row.domain, inCurrentSr: true, firstSeenAt: importedAt, lastSeenAt: importedAt };
        next.locations.push(location);
      } else {
        Object.assign(location, { name: row.roomName, address: row.roomAddress, vip: row.roomVip, domain: row.domain || location.domain || null, inCurrentSr: true, lastSeenAt: importedAt });
      }
      const candidates = findInventoryCandidates(next.inventoryDevices, row);
      let device = candidates.length === 1 ? candidates[0] : null;
      if (candidates.length > 1) next.inventoryIssues.push(createInventoryIssue({ kind: "ambiguous_identity", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Найдено несколько кандидатов; создана отдельная запись", details: { candidateIds: candidates.map((item) => item.id) } }));
      const oldIp = device?.ipNormalized || null;
      if (!device) {
        device = { id: createId("inventory-device"), firstSeenAt: importedAt, ipHistory: [] };
        next.inventoryDevices.push(device);
      }
      if (oldIp && oldIp !== row.ipNormalized && !device.ipHistory.includes(oldIp)) device.ipHistory.push(oldIp);
      Object.assign(device, row, { locationId: location.id, inCurrentSr: true, lastSeenAt: importedAt, lastSrImportId: srImport.id, sourceRowNumber: rowNumber, pollingCapability: resolvePollingCapability(row) });
      if (row.ipRaw && !row.ipNormalized) next.inventoryIssues.push(createInventoryIssue({ kind: "invalid_ip", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: `Некорректный IP: ${row.ipRaw}` }));
      if (row.category === "other") next.inventoryIssues.push(createInventoryIssue({ kind: "unknown_category", sourceType: "sr_row", sourceId: srImport.id, rowNumber, deviceId: device.id, message: "Строка не относится к ВКС, контроллеру или панели" }));
      srImport.acceptedCount += 1;
    });
    srImport.status = srImport.rejectedCount || next.inventoryIssues.some((issue) => issue.sourceId === srImport.id) ? "partial" : "processed";
    next.srImports.push(srImport);
    next = appendHistory(next, { actorId: input.actorId || "system", action: "Импортирована выгрузка SR", entityType: "sr_import", entityId: srImport.id, details: `${srImport.filename}: ${srImport.acceptedCount}/${srImport.rowCount}` });
    return { ok: true, outcome: srImport.status, state: next, srImportId: srImport.id, acceptedCount: srImport.acceptedCount, rejectedCount: srImport.rejectedCount, errors: [] };
  }

  const DEFAULT_SR_IMPORT_BATCH_SIZE = 256;

  function addSrIndexValue(index, key, device) {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    const values = index.get(key);
    if (!values.includes(device)) values.push(device);
  }

  function removeSrIndexValue(index, key, device) {
    if (!key || !index.has(key)) return;
    const values = index.get(key).filter((item) => item !== device);
    if (values.length) index.set(key, values); else index.delete(key);
  }

  function srDeviceIndexKeys(device) {
    return {
      inventory: normalizeText(device?.inventoryNumber),
      serialManufacturer: device?.serialNumber && device?.manufacturerNormalized ? `${normalizeText(device.serialNumber)}|${device.manufacturerNormalized}` : null,
      mac: device?.macNormalized || null,
      ips: [...new Set([device?.ipNormalized, ...(device?.ipHistory || [])].filter(Boolean))]
    };
  }

  function createSrImportContext(candidateState) {
    const context = {
      locationsByIdentity: new Map(candidateState.locations.map((location) => [location.identityKey, location])),
      byInventory: new Map(), bySerialManufacturer: new Map(), byMac: new Map(), byIp: new Map()
    };
    for (const device of candidateState.inventoryDevices) {
      const keys = srDeviceIndexKeys(device);
      addSrIndexValue(context.byInventory, keys.inventory, device);
      addSrIndexValue(context.bySerialManufacturer, keys.serialManufacturer, device);
      addSrIndexValue(context.byMac, keys.mac, device);
      keys.ips.forEach((ip) => addSrIndexValue(context.byIp, ip, device));
    }
    return context;
  }

  function removeSrDeviceFromContext(context, device) {
    const keys = srDeviceIndexKeys(device);
    removeSrIndexValue(context.byInventory, keys.inventory, device);
    removeSrIndexValue(context.bySerialManufacturer, keys.serialManufacturer, device);
    removeSrIndexValue(context.byMac, keys.mac, device);
    keys.ips.forEach((ip) => removeSrIndexValue(context.byIp, ip, device));
  }

  function addSrDeviceToContext(context, device) {
    const keys = srDeviceIndexKeys(device);
    addSrIndexValue(context.byInventory, keys.inventory, device);
    addSrIndexValue(context.bySerialManufacturer, keys.serialManufacturer, device);
    addSrIndexValue(context.byMac, keys.mac, device);
    keys.ips.forEach((ip) => addSrIndexValue(context.byIp, ip, device));
  }

  function findIndexedSrCandidates(context, row) {
    const levels = [
      row.inventoryNumber ? context.byInventory.get(normalizeText(row.inventoryNumber)) : null,
      row.serialNumber && row.manufacturerNormalized ? context.bySerialManufacturer.get(`${normalizeText(row.serialNumber)}|${row.manufacturerNormalized}`) : null,
      row.macNormalized ? context.byMac.get(row.macNormalized) : null,
      !row.inventoryNumber && !row.serialNumber && !row.macNormalized && row.ipNormalized ? context.byIp.get(row.ipNormalized) : null
    ];
    return levels.find((candidates) => candidates?.length) || [];
  }

  async function processSrImportRows(currentState, input) {
    const rows = Array.isArray(input.rows) ? input.rows : [];
    const headers = input.headers || Object.keys(rows[0] || {});
    const missingHeaders = SR_REQUIRED_HEADERS.filter((required) => !headers.some((header) => normalizeSrHeader(header) === normalizeSrHeader(required)));
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
          const hasIdentity = row.inventoryNumber || row.serialNumber || row.macNormalized || row.ipNormalized;
          if (!hasIdentity) {
            srImport.rejectedCount += 1;
            next.inventoryIssues.push(createInventoryIssue({ kind: "missing_identity", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Строка не содержит пригодного inventory/serial/MAC/IP", details: { rawRow } }));
            continue;
          }
          const locationKey = `${normalizeText(row.roomName) || ""}|${normalizeText(row.roomAddress) || ""}`;
          metrics.locationLookups += 1;
          let location = context.locationsByIdentity.get(locationKey);
          if (!location) {
            location = { id: createId("location"), identityKey: locationKey, name: row.roomName, address: row.roomAddress, vip: row.roomVip, domain: row.domain, inCurrentSr: true, firstSeenAt: importedAt, lastSeenAt: importedAt };
            next.locations.push(location);
            context.locationsByIdentity.set(locationKey, location);
          } else {
            Object.assign(location, { name: row.roomName, address: row.roomAddress, vip: row.roomVip, domain: row.domain || location.domain || null, inCurrentSr: true, lastSeenAt: importedAt });
          }
          metrics.identityLookups += 1;
          const candidates = findIndexedSrCandidates(context, row);
          let device = candidates.length === 1 ? candidates[0] : null;
          if (candidates.length > 1) next.inventoryIssues.push(createInventoryIssue({ kind: "ambiguous_identity", sourceType: "sr_row", sourceId: srImport.id, rowNumber, message: "Найдено несколько кандидатов; создана отдельная запись", details: { candidateIds: candidates.map((item) => item.id) } }));
          const oldIp = device?.ipNormalized || null;
          if (!device) {
            device = { id: createId("inventory-device"), firstSeenAt: importedAt, ipHistory: [] };
            next.inventoryDevices.push(device);
          } else {
            removeSrDeviceFromContext(context, device);
          }
          if (oldIp && oldIp !== row.ipNormalized && !device.ipHistory.includes(oldIp)) device.ipHistory.push(oldIp);
          Object.assign(device, row, { locationId: location.id, inCurrentSr: true, lastSeenAt: importedAt, lastSrImportId: srImport.id, sourceRowNumber: rowNumber, pollingCapability: resolvePollingCapability(row) });
          addSrDeviceToContext(context, device);
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
    srImport.status = srImport.rejectedCount || next.inventoryIssues.some((issue) => issue.sourceId === srImport.id) ? "partial" : "processed";
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

  function createPollingPlan(currentState, input) {
    const category = normalizeText(input.category);
    if (!EQUIPMENT_CATEGORY_IDS.includes(category)) return { ok: false, state: deepClone(currentState), errors: ["Категория плана не поддерживается"] };
    const scheduledAt = normalizeDate(input.scheduledAt);
    if (!scheduledAt) return { ok: false, state: deepClone(currentState), errors: ["Дата и время плана обязательны"] };
    const manufacturer = normalizeManufacturer(input.manufacturer);
    const devices = currentState.inventoryDevices.filter((device) => device.inCurrentSr !== false && device.category === category && (!manufacturer || device.manufacturerNormalized === manufacturer));
    const capabilities = devices.map(resolvePollingCapability);
    let next = deepClone(currentState);
    const plan = {
      id: createId("polling-run"), kind: "plan", identityKey: `plan|${scheduledAt}|${category}|${manufacturer || "all"}|${nowIso()}`,
      folderName: null, capturedAt: scheduledAt, capturedAtSource: "planned", importedAt: nowIso(), importedById: input.actorId || "system",
      deviceIds: devices.map((device) => device.id), fileCount: 0, successCount: 0, errorCount: 0, status: "blocked_no_adapter",
      selectionSummary: { category, manufacturer: manufacturer || null, total: devices.length, implemented: capabilities.filter((item) => item.support === "implemented" && item.transport).length, notImplemented: capabilities.filter((item) => item.support !== "implemented" || !item.transport).length }
    };
    next.pollingRuns.push(plan);
    next = appendHistory(next, { actorId: input.actorId || "system", action: "Сформирован план опроса", entityType: "polling_run", entityId: plan.id, details: `${category}: ${devices.length}; execution blocked` });
    return { ok: true, state: next, plan, errors: [] };
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
    const dataIssueKinds = new Set(["malformed_json", "invalid_filename_ip", "unmatched_ip", "ambiguous_ip", "classification_conflict", "invalid_ip", "missing_identity", "ambiguous_identity", "unknown_category"]);
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
      blockedAnalytics: { authorization: null, reboots: null, gcPlus: null, freshnessThreshold: null }
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
    return candidateState.inventoryDevices.filter((device) => {
      if (device.category !== category) return false;
      const location = candidateState.locations.find((item) => item.id === device.locationId);
      const latest = candidateState.pollingResults.filter((item) => item.deviceId === device.id).sort(comparePollingResultsNewest)[0];
      const hasChanges = candidateState.deviceChanges.some((item) => item.deviceId === device.id && item.status === "active");
      const support = dashboardCapability(device);
      const haystack = [device.nameRaw, device.modelRaw, device.manufacturerRaw, device.ipRaw, device.serialNumber, device.inventoryNumber, location?.name, location?.address].map((item) => normalizeText(item) || "").join(" ");
      return (!filters.search || haystack.includes(normalizeText(filters.search)))
        && (!filters.manufacturer || device.manufacturerNormalized === normalizeManufacturer(filters.manufacturer))
        && (!filters.current || (filters.current === "yes" ? device.inCurrentSr !== false : device.inCurrentSr === false))
        && (!filters.pollStatus || (latest?.operationalStatus || latest?.pollStatus || "never") === filters.pollStatus)
        && (!filters.vip || String(Boolean(device.deviceVip || location?.vip)) === filters.vip)
        && (!filters.ping || (latest?.pingStatus || "unknown") === filters.ping)
        && (!filters.changed || String(hasChanges) === filters.changed)
        && (!filters.support || support === filters.support)
        && (!filters.model || normalizeText(device.modelRaw) === normalizeText(filters.model))
        && (!filters.locationId || device.locationId === filters.locationId);
    });
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
    const candidates = ipInfo.ip ? next.inventoryDevices.filter((device) => device.ipNormalized === ipInfo.ip || (device.ipHistory || []).includes(ipInfo.ip)) : [];
    const device = candidates.length === 1 ? candidates[0] : null;
    const detectedCategory = payload ? detectExtronJsonDeviceType(payload) : "unknown";
    const status = payload ? derivePollingStatus(payload) : { pollStatus: "processing_error", pingStatus: "unknown", authorizationStatus: "unknown", rebootCount: null, gcPlus: null };
    const result = {
      id: createId("polling-result"), runId: run.id, filename: input.name || "unknown.json", filenameIp: ipInfo.ip,
      sourceRelativePath: normalizePollingRelativePath(input.relativePath || input.name || "unknown.json"),
      deviceId: device?.id || null, capturedAt: resultTimestamp.capturedAt, capturedAtSource: resultTimestamp.source, sourceLastModified: resultTimestamp.sourceLastModified, importedAt: input.importedAt || nowIso(),
      rawText, rawSha256, parseStatus: parseError ? "malformed" : "parsed", parseError,
      detectedCategory, matchStatus: device ? "matched" : candidates.length > 1 ? "ambiguous" : "unmatched",
      classificationConflict: Boolean(device && detectedCategory !== "unknown" && device.category !== detectedCategory),
      normalizedData: payload ? pollingPayloadProjection(payload) : {}, ...status
    };
    result.operationalStatus = parseError ? "processing_error" : !device ? "unmatched" : status.pollStatus;
    next.pollingResults.push(result);
    run.fileCount += 1;
    if (result.operationalStatus === "success") run.successCount += 1; else run.errorCount += 1;
    if (parseError) next.inventoryIssues.push(createInventoryIssue({ kind: "malformed_json", sourceType: "polling_result", sourceId: result.id, message: `JSON не прочитан: ${parseError}` }));
    if (!ipInfo.ok) next.inventoryIssues.push(createInventoryIssue({ kind: "invalid_filename_ip", sourceType: "polling_result", sourceId: result.id, message: ipInfo.error }));
    if (!device) next.inventoryIssues.push(createInventoryIssue({ kind: candidates.length > 1 ? "ambiguous_ip" : "unmatched_ip", sourceType: "polling_result", sourceId: result.id, message: ipInfo.ip ? `IP ${ipInfo.ip} не сопоставлен однозначно` : "IP отсутствует" }));
    if (result.classificationConflict) next.inventoryIssues.push(createInventoryIssue({ kind: "classification_conflict", sourceType: "polling_result", sourceId: result.id, deviceId: device.id, message: `SR=${device.category}, JSON=${detectedCategory}` }));
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

  function createPollingImportContext(candidateState) {
    const inventoryByIp = new Map();
    for (const device of candidateState.inventoryDevices) {
      const addresses = new Set([device.ipNormalized, ...(device.ipHistory || [])].filter(Boolean));
      for (const address of addresses) {
        if (!inventoryByIp.has(address)) inventoryByIp.set(address, []);
        inventoryByIp.get(address).push(device);
      }
    }
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
    return { state: candidateState, inventoryByIp, runByIdentity, duplicateKeys, historyByDevice, changesByPair, removedChangeIds: new Set() };
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
    const existing = context.changesByPair.get(key) || [];
    existing.forEach((change) => context.removedChangeIds.add(change.id));
    context.changesByPair.delete(key);
  }

  function addIndexedPollingPair(context, deviceId, fromResult, toResult, metrics) {
    if (!fromResult || !toResult) return;
    const device = context.state.inventoryDevices.find((item) => item.id === deviceId);
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
    const candidates = ipInfo.ip ? (context.inventoryByIp.get(ipInfo.ip) || []) : [];
    if (ipInfo.ip) metrics.srLookups += 1;
    const device = candidates.length === 1 ? candidates[0] : null;
    metrics.stagesMs.srMatching += monotonicNow() - matchingStarted;

    const normalizationStarted = monotonicNow();
    const detectedCategory = payload ? detectExtronJsonDeviceType(payload) : "unknown";
    const status = payload ? derivePollingStatus(payload) : { pollStatus: "processing_error", pingStatus: "unknown", authorizationStatus: "unknown", rebootCount: null, gcPlus: null };
    const normalizedData = payload ? pollingPayloadProjection(payload) : {};
    const timestamp = resolvePollingResultTimestamp(input);
    metrics.normalized += 1;
    metrics.stagesMs.normalization += monotonicNow() - normalizationStarted;

    const result = {
      id: createId("polling-result"), runId: input.run.id, filename: input.name || "unknown.json", filenameIp: ipInfo.ip,
      sourceRelativePath: normalizePollingRelativePath(input.relativePath || input.name || "unknown.json"),
      deviceId: device?.id || null, capturedAt: timestamp.capturedAt, capturedAtSource: timestamp.source, sourceLastModified: timestamp.sourceLastModified, importedAt: input.importedAt || nowIso(),
      rawText, rawSha256, parseStatus: parseError ? "malformed" : "parsed", parseError,
      detectedCategory, matchStatus: device ? "matched" : candidates.length > 1 ? "ambiguous" : "unmatched",
      classificationConflict: Boolean(device && detectedCategory !== "unknown" && device.category !== detectedCategory),
      normalizedData, ...status
    };
    result.operationalStatus = parseError ? "processing_error" : !device ? "unmatched" : status.pollStatus;

    context.state.pollingResults.push(result);
    input.run.fileCount += 1;
    if (result.operationalStatus === "success") input.run.successCount += 1; else input.run.errorCount += 1;
    if (parseError) context.state.inventoryIssues.push(createInventoryIssue({ kind: "malformed_json", sourceType: "polling_result", sourceId: result.id, message: `JSON не прочитан: ${parseError}` }));
    if (!ipInfo.ok) context.state.inventoryIssues.push(createInventoryIssue({ kind: "invalid_filename_ip", sourceType: "polling_result", sourceId: result.id, message: ipInfo.error }));
    if (!device) context.state.inventoryIssues.push(createInventoryIssue({ kind: candidates.length > 1 ? "ambiguous_ip" : "unmatched_ip", sourceType: "polling_result", sourceId: result.id, message: ipInfo.ip ? `IP ${ipInfo.ip} не сопоставлен однозначно` : "IP отсутствует" }));
    if (result.classificationConflict) context.state.inventoryIssues.push(createInventoryIssue({ kind: "classification_conflict", sourceType: "polling_result", sourceId: result.id, deviceId: device.id, message: `SR=${device.category}, JSON=${detectedCategory}` }));
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
    const context = input.context?.state === currentState ? input.context : createPollingImportContext(currentState);
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

  function resolveLaunchMode({ protocol, fileMarker } = {}) {
    if (protocol === "file:" && fileMarker) return Object.freeze({ kind: "file", persistent: false, credentialsAvailable: false });
    return null;
  }

  function createVolatileStorage(initialValues) {
    const values = new Map(Object.entries(initialValues || {}).map(([key, value]) => [String(key), String(value)]));
    return Object.freeze({
      getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
      setItem(key, value) { values.set(String(key), String(value)); },
      removeItem(key) { values.delete(String(key)); }
    });
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
    createPollingPlan,
    createSelectedComparison,
    deepClone,
    deriveLegacyMetadata,
    derivePollingStatus,
    resolvePollingResultTimestamp,
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
    getActivePreviousChangeSets,
    getActiveBaselineAssignment,
    getBaselineDrift,
    getInventoryAnalytics,
    getDashboardSummary,
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
    resolveMatchDecision,
    readSessionUserId,
    saveState,
    searchReferenceEntries,
    sha256Bytes,
    sha256Text,
    createVolatileStorage,
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

  const launchMode = resolveLaunchMode({ protocol: global.location && global.location.protocol, fileMarker: Boolean(global.__MVP_FILE_RUNTIME__) });
  if (!launchMode) {
    app.innerHTML = `<main id="main-content" class="login-shell"><section class="login-card"><div class="brand-mark">SR</div><h1>Откройте локальный файл index.html</h1><p>Инструмент запускается прямым открытием корневого <code>index.html</code> на этом компьютере.</p></section></main>`;
    return;
  }

  const persistenceStorage = createVolatileStorage();

  const loaded = loadState(persistenceStorage);
  let state = loaded.state;
  let pollingImportContextCache = null;
  let pollingProgressRenderTimer = null;
  let pollingProgressLastRenderAt = 0;
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
  const ui = {
    route: "dashboard",
    message: startupMessage,
    uploadResults: [],
    uploadBusy: false,
    selectedProjectId: null,
    selectedSnapshotId: null,
    selectedChangeSetId: null,
    selectedEventId: null,
    selectedInventoryDeviceId: null,
    eventFilters: {},
    inventoryFilters: {},
    srImportResults: [],
    srProgress: null,
    pollingImportResults: [],
    pollingProgress: null,
    pollingCancelRequested: false,
    pollingPlanResult: null,
    inventoryBusy: false,
    equipmentExpanded: true,
    dashboardFilters: { period: "latest_run" },
    helpQuery: "",
    helpTopicId: null
  };

  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  render();

  function currentUser() {
    return state.users.find((user) => user.id === sessionUserId && user.active) || null;
  }

  function setMessage(text, type) {
    ui.message = text ? { text, type: type || "info" } : null;
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
    app.innerHTML = renderShell(user);
  }

  function updatePollingProgress(snapshot, forceRender) {
    ui.pollingProgress = { ...snapshot };
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

  function formatPollingEta(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "рассчитывается";
    if (seconds < 60) return `${Math.ceil(seconds)} с`;
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
          <p class="page-subtitle">Вход администратора</p>
          ${renderMessage()}
          <form class="form-grid" data-login-form>
            <div class="field"><label for="login">Логин</label><input id="login" name="login" autocomplete="username" required></div>
            <div class="field"><label for="password">Пароль</label><input id="password" name="password" type="password" autocomplete="current-password" required></div>
            <div class="button-row"><button class="button primary" type="submit">Войти</button><button class="button secondary" type="button" data-fill-login="admin" data-fill-password="admin">Заполнить тестовые данные</button></div>
          </form>
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
          <header class="topbar">
            <div><strong>MVP_SPHERE_SR</strong><br><span class="muted">Инвентаризация и аналитика оборудования ВКС</span></div>
            <div class="user-summary">
              <span>${escapeHtml(user.name)}</span>
              <span class="role-chip">${escapeHtml(ROLE_NAMES[user.role])}</span>
            </div>
          </header>
          <main id="main-content" class="page" tabindex="-1">
            ${renderMessage()}
            ${renderRoute(user)}
          </main>
        </div>
      </div>`;
  }

  function renderRoute(user) {
    const descriptor = MODULE_CATALOG.find((item) => item.route === ui.route) || MODULE_CATALOG.find((item) => item.route === "dashboard");
    if (descriptor.renderer === "reference") return renderReference();
    if (descriptor.renderer === "settings") return renderSettings(user);
    if (descriptor.renderer === "upload") return renderUpload();
    if (descriptor.renderer === "equipment") return renderEquipmentOverview();
    if (descriptor.renderer === "inventory") return renderInventoryRoute(descriptor.route);
    return renderDashboard();
  }

  function navButton(route, label) {
    const active = ui.route === route ? " active" : "";
    return `<button class="nav-button${active}" type="button" data-route="${route}">${escapeHtml(label)}</button>`;
  }

  function renderNavigationGroup(item) {
    const childActive = item.children.some((child) => child.route === ui.route);
    const expanded = ui.equipmentExpanded || childActive;
    return `<div class="nav-group"><button class="nav-button nav-parent${childActive || ui.route === item.route ? " active" : ""}" type="button" data-equipment-toggle aria-expanded="${expanded}"><span>${escapeHtml(item.title)}</span><span aria-hidden="true">${expanded ? "▾" : "▸"}</span></button><div class="nav-children"${expanded ? "" : " hidden"}>${item.children.map((child) => `<button class="nav-button nav-child${ui.route === child.route ? " active" : ""}" type="button" data-route="${child.route}">${escapeHtml(child.title)}</button>`).join("")}</div></div>`;
  }

  function renderEquipmentOverview() {
    const counts = Object.fromEntries(EQUIPMENT_CATEGORY_IDS.map((category) => [category, state.inventoryDevices.filter((device) => device.inCurrentSr !== false && device.category === category).length]));
    return `<header class="page-header"><div><p class="eyebrow">Перечень SR</p><h1>Оборудование</h1><p class="page-subtitle">Семь категорий используют общие фильтры, карточки, историю опросов и аналитику.</p></div><button class="button secondary" type="button" data-help-topic="${HELP_TOPIC_BY_ROUTE.equipment}">О модуле</button></header><section class="equipment-category-grid">${EQUIPMENT_CATEGORY_CATALOG.map((item) => `<article class="card"><h2>${escapeHtml(item.title)}</h2><strong class="stat-value">${counts[item.id]}</strong><p class="muted">Устройств в актуальной SR</p><button class="button secondary" type="button" data-route="${item.route}">Открыть</button></article>`).join("")}</section>`;
  }

  function renderMessage() {
    if (!ui.message) return "";
    const type = ["error", "success", "warning", "info"].includes(ui.message.type) ? ui.message.type : "info";
    return `<div class="${type}-panel" role="${type === "error" ? "alert" : "status"}" aria-live="${type === "error" ? "assertive" : "polite"}">${escapeHtml(ui.message.text)}</div>`;
  }

  function renderDashboard() {
    const summary = getDashboardSummary(state, ui.dashboardFilters);
    const header = `<header class="page-header dashboard-header"><div><p class="eyebrow">Дашборд</p><h1>Главный экран</h1><p class="page-subtitle">Фактические данные актуальной выгрузки SR и истории опросов без демонстрационных значений.</p></div><div class="button-row"><button class="button primary" type="button" data-route="upload">Запустить опрос</button><button class="button secondary" type="button" data-route="upload">Загрузить данные</button><button class="button secondary" type="button" data-help-topic="${HELP_TOPIC_BY_ROUTE.dashboard}">О модуле</button></div></header>`;
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
      <section class="card section-gap blocked-analytics"><h2>Показатели, ожидающие достоверных данных</h2><div class="blocked-grid"><div><strong>Авторизация</strong><span>Недостаточно данных</span></div><div><strong>Перезагрузки</strong><span>Функция находится в разработке</span></div><div><strong>GCPlus</strong><span>Требует уточнения</span></div><div><strong>Актуальность данных</strong><span>Порог не настроен</span></div></div></section>`;
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
    return `<header class="page-header"><div><p class="eyebrow">Помощь пользователю</p><h1>Справочник</h1><p class="page-subtitle">Назначение модулей, термины, показатели, источники данных и правила определения состояний оборудования.</p></div><span class="badge info">${entries.length} ${russianCountLabel(entries.length, "материал", "материала", "материалов")}</span></header>
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
    return `<header class="page-header"><div><h1>${config.title}</h1><p class="page-subtitle">Одна строка — устройство из SR; результаты открываются как история опросов устройства.</p></div><div class="button-row"><span class="badge info">${devices.length}</span><button class="button secondary" type="button" data-help-topic="${config.help}">О модуле</button></div></header>
      <section class="stats-grid">${statCard("Всего", analytics.total)}${statCard("Опрошено / не опрашивалось", `${analytics.polled} / ${analytics.unpolled}`)}${statCard("Успешно / ошибки", `${analytics.success} / ${analytics.errors}`)}${statCard("Устройства с изменениями / обнаруженные изменения", `${analytics.changedDevices} / ${analytics.changes}`)}</section>
      <section class="card"><form class="filter-grid inventory-filter-grid" data-inventory-filters>
        <input type="hidden" name="route" value="${route}"><div class="field"><label>Поиск</label><input name="search" value="${escapeHtml(ui.inventoryFilters.search || "")}" placeholder="IP, модель, комната…"></div>
        <div class="field"><label>Производитель</label><select name="manufacturer">${filterOptions(manufacturers, ui.inventoryFilters.manufacturer)}</select></div>
        <div class="field"><label>Модель</label><select name="model">${filterOptions(models, ui.inventoryFilters.model)}</select></div>
        <div class="field"><label>Локация</label><select name="locationId"><option value="">Все</option>${categoryLocations.map((item) => `<option value="${escapeHtml(item.id)}"${ui.inventoryFilters.locationId === item.id ? " selected" : ""}>${escapeHtml(item.name || "Без названия")}</option>`).join("")}</select></div>
        <div class="field"><label>Актуальность SR</label><select name="current"><option value="">Все</option><option value="yes"${ui.inventoryFilters.current === "yes" ? " selected" : ""}>В актуальной SR</option><option value="no"${ui.inventoryFilters.current === "no" ? " selected" : ""}>Исторические</option></select></div>
        <div class="field"><label>Статус последнего опроса</label><select name="pollStatus">${filterOptions(["success", "authorization_error", "network_unreachable", "processing_error", "unmatched", "unknown", "never"], ui.inventoryFilters.pollStatus, Object.fromEntries(["success", "authorization_error", "network_unreachable", "processing_error", "unmatched", "unknown", "never"].map((status) => [status, formatPollStatus(status)])))}</select></div>
        <div class="field"><label>Сетевая доступность</label><select name="ping">${filterOptions(["ok", "failed", "unknown"], ui.inventoryFilters.ping, { ok: formatPingStatus("ok"), failed: formatPingStatus("failed"), unknown: formatPingStatus("unknown") })}</select></div>
        <div class="field"><label>Изменения</label><select name="changed"><option value="">Все</option><option value="true"${ui.inventoryFilters.changed === "true" ? " selected" : ""}>Есть</option><option value="false"${ui.inventoryFilters.changed === "false" ? " selected" : ""}>Нет</option></select></div>
        <div class="field"><label>Поддержка автоматического опроса</label><select name="support"><option value="">Все</option><option value="supported"${ui.inventoryFilters.support === "supported" ? " selected" : ""}>${formatCapabilityStatus("supported")}</option><option value="unsupported"${ui.inventoryFilters.support === "unsupported" ? " selected" : ""}>${formatCapabilityStatus("unsupported")}</option><option value="unknown"${ui.inventoryFilters.support === "unknown" ? " selected" : ""}>${formatCapabilityStatus("unknown")}</option></select></div>
        <div class="field"><label>VIP</label><select name="vip"><option value="">Все</option><option value="true"${ui.inventoryFilters.vip === "true" ? " selected" : ""}>Да</option><option value="false"${ui.inventoryFilters.vip === "false" ? " selected" : ""}>Нет</option></select></div>
        <div class="button-row"><button class="button primary" type="submit">Применить фильтры</button><button class="button secondary" type="button" data-clear-inventory-filters>Сбросить фильтры</button></div>
      </form></section>
      <section class="card section-gap">${renderInventoryTable(devices)}</section>`;
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
    return `<header class="page-header"><div><button class="text-button" type="button" data-back-inventory="${route}">← К списку</button><h1>${escapeHtml(device.nameRaw || device.modelRaw || "Устройство")}</h1><p class="page-subtitle">${escapeHtml(location?.name || "Без локации")} · ${escapeHtml(device.ipNormalized || "IP не задан")}</p></div><span class="badge ${device.inCurrentSr === false ? "warning" : "success"}">${device.inCurrentSr === false ? "Не в актуальной SR" : "В актуальной SR"}</span></header>
      <div class="detail-grid"><section class="card"><h2>Карточка SR</h2><dl class="definition-list">
        <div><dt>Производитель / модель</dt><dd>${escapeHtml(device.manufacturerRaw || "—")} / ${escapeHtml(device.modelRaw || "—")}</dd></div><div><dt>IP / MAC</dt><dd>${escapeHtml(device.ipNormalized || "—")} / ${escapeHtml(device.macNormalized || device.macRaw || "—")}</dd></div><div><dt>SIP URI / домен</dt><dd>${escapeHtml(device.sipUri || "—")} / ${escapeHtml(device.domain || location?.domain || "—")}</dd></div><div><dt>Инвентарный / серийный</dt><dd>${escapeHtml(device.inventoryNumber || "—")} / ${escapeHtml(device.serialNumber || "—")}</dd></div>
      </dl></section><section class="card"><h2>Поддержка автоматического опроса</h2><span class="badge warning">${escapeHtml(formatCapabilityStatus(capability.support))}</span><p>Механизм опроса: <span class="mono">${escapeHtml(capability.key || "не определён")}</span></p><p class="muted">Подтверждённый протокол подключения отсутствует; реальный сетевой опрос заблокирован. Учётные данные хранятся отдельно.</p><button class="button secondary" type="button" disabled>Запустить опрос</button></section></div>
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

  function renderUpload() {
    const pollingProgress = ui.pollingProgress;
    const pollingPercent = pollingProgress?.total ? Math.min(100, Math.round((pollingProgress.processed / pollingProgress.total) * 100)) : 0;
    const srPercent = ui.srProgress?.total ? Math.min(100, Math.round((ui.srProgress.processed / ui.srProgress.total) * 100)) : 0;
    return `
      <header class="page-header">
        <div>
          <h1>Импорт данных</h1>
          <p class="page-subtitle">Загрузите выгрузку SR и результаты уже выполненных опросов. Все операции выполняются локально.</p>
        </div>
      </header>
      <div class="card-grid section-gap">
        <section class="card upload-card"><h2>1. Выгрузка SR (.xlsx)</h2><p class="muted">Первый непустой лист; «Домен» необязателен. Повторный импорт обновляет устройства без потери истории.</p>
          <form class="form-grid" data-sr-import-form aria-busy="${ui.inventoryBusy ? "true" : "false"}"><div class="field"><label for="sr-file">Файл выгрузки SR</label><input id="sr-file" name="srFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required></div><button class="button primary" type="submit"${ui.inventoryBusy ? " disabled" : ""}>Загрузить выгрузку SR</button></form>
          ${ui.srProgress ? `<section class="polling-progress section-gap" aria-live="polite"><div class="polling-progress-heading"><div><span class="eyebrow">${escapeHtml(ui.srProgress.stage)}</span><strong>${ui.srProgress.processed || 0} из ${ui.srProgress.total || 0} строк</strong></div><strong>${srPercent}%</strong></div><progress max="100" value="${srPercent}">${srPercent}%</progress><p class="muted">Принято: ${ui.srProgress.accepted || 0} · отклонено: ${ui.srProgress.rejected || 0}</p></section>` : ""}
          ${ui.srImportResults.length ? `<ul class="result-list section-gap">${ui.srImportResults.map((item) => `<li><div><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.detail || "")}</span></div><span class="badge ${item.ok ? "success" : "critical"}">${escapeHtml(formatImportOutcome(item.label))}</span></li>`).join("")}</ul>` : ""}
        </section>
        <section class="card upload-card"><h2>2. Общая папка результатов опросов</h2><p class="muted">Выберите одну общую папку целиком. Внутри неё могут находиться несколько папок сеансов вида YYYY-MM-DD_HH-MM-SS; все JSON будут найдены рекурсивно и импортированы как отдельные запуски.</p>
          <div class="info-panel">Формат даты: год-месяц-день. Например, 2026-06-01_09-41-28 — 1 июня 2026 года, 09:41:28.</div>
          <form class="form-grid section-gap" data-polling-import-form aria-busy="${ui.inventoryBusy ? "true" : "false"}"><div class="field"><label for="polling-files">Главная папка со всеми результатами</label><input id="polling-files" name="pollingFiles" type="file" accept=".json,application/json" webkitdirectory directory multiple required${ui.inventoryBusy ? " disabled" : ""}></div><button class="button primary" type="submit"${ui.inventoryBusy ? " disabled" : ""}>Импортировать все папки опросов</button></form>
          ${pollingProgress ? `<section class="polling-progress section-gap" aria-live="polite" aria-busy="${ui.inventoryBusy ? "true" : "false"}">
            <div class="polling-progress-heading"><div><span class="eyebrow">${escapeHtml(pollingProgress.stage)}</span><strong>${pollingProgress.processed} из ${pollingProgress.total} JSON</strong></div><strong>${pollingPercent}%</strong></div>
            <div class="polling-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pollingPercent}"><span style="width:${pollingPercent}%"></span></div>
            <dl class="polling-progress-metrics"><div><dt>Успешно</dt><dd>${pollingProgress.succeeded}</dd></div><div><dt>Ошибки</dt><dd>${pollingProgress.errors}</dd></div><div><dt>Дубликаты</dt><dd>${pollingProgress.duplicates}</dd></div><div><dt>Скорость</dt><dd>${Number(pollingProgress.filesPerSecond || 0).toFixed(1)} файл/с</dd></div><div><dt>Осталось</dt><dd>${escapeHtml(formatPollingEta(pollingProgress.etaSeconds))}</dd></div></dl>
            ${pollingProgress.currentRun ? `<p class="muted">Текущий запуск: <span class="mono">${escapeHtml(pollingProgress.currentRun)}</span></p>` : ""}
            ${ui.inventoryBusy ? `<button class="button danger" type="button" data-cancel-polling-import${ui.pollingCancelRequested ? " disabled" : ""}>${ui.pollingCancelRequested ? "Остановка…" : "Отменить загрузку"}</button>` : ""}
          </section>` : ""}
          ${ui.pollingImportResults.length ? `<ul class="result-list section-gap">${ui.pollingImportResults.map((item) => `<li><div><strong>${escapeHtml(item.name)}</strong><br><span class="muted">${escapeHtml(item.detail || "")}</span></div><span class="badge ${item.ok ? "success" : "critical"}">${escapeHtml(formatImportOutcome(item.label))}</span></li>`).join("")}</ul>` : ""}
        </section>
      </div>
      <section class="card section-gap"><h2>3. План будущего опроса</h2><p class="muted">План сохраняет только выбранные устройства и время. Автоматическое фоновое выполнение заблокировано, пока нет подтверждённого механизма подключения.</p>
        <form class="filter-grid" data-polling-plan-form><div class="field"><label>Категория</label><select name="category" required>${EQUIPMENT_CATEGORY_CATALOG.map((item) => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join("")}</select></div><div class="field"><label>Производитель, необязательно</label><input name="manufacturer" placeholder="Например, Extron"></div><div class="field"><label>Дата и время</label><input name="scheduledAt" type="datetime-local" required></div><button class="button primary" type="submit">Запланировать опрос</button><button class="button secondary" type="button" disabled>Сетевой запуск недоступен</button></form>
        ${ui.pollingPlanResult ? `<div class="info-panel section-gap">План: ${escapeHtml(formatCategoryLabel(ui.pollingPlanResult.category))}, устройств ${ui.pollingPlanResult.total}; поддерживаемых механизмов ${ui.pollingPlanResult.implemented}; ожидают реализации ${ui.pollingPlanResult.notImplemented}. Учётные данные не изменялись.</div>` : ""}
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
          <h1>Данные текущего сеанса</h1>
          <p class="page-subtitle">Прямой запуск index.html использует только память открытой вкладки.</p>
        </div>
      </header>
      <div class="info-panel">После перезагрузки или закрытия страницы импортированные данные удаляются из памяти текущей вкладки.</div>
      <div class="card-grid">
        <section class="card">
          <h2>Сеансовый режим</h2>
          <p class="muted">Рабочие данные не записываются в localStorage, IndexedDB или файл на диске. Экспорт незашифрованной резервной копии отключён.</p>
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

  function handleClick(event) {
    if (event.target.closest("[data-equipment-toggle]")) {
      ui.equipmentExpanded = !ui.equipmentExpanded;
      render();
      return;
    }
    if (event.target.closest("[data-cancel-polling-import]")) {
      ui.pollingCancelRequested = true;
      if (ui.pollingProgress) ui.pollingProgress.cancelRequested = true;
      render();
      return;
    }

    const fill = event.target.closest("[data-fill-login]");
    if (fill) {
      const login = document.getElementById("login");
      const password = document.getElementById("password");
      if (login && password) {
        login.value = fill.dataset.fillLogin;
        password.value = fill.dataset.fillPassword;
        login.focus();
      }
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
      ui.inventoryFilters = {};
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

    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      ui.route = routeButton.dataset.route;
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
      ui.inventoryFilters = {};
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
      await handleSrImport(srImportForm);
      return;
    }

    const pollingImportForm = event.target.closest("[data-polling-import-form]");
    if (pollingImportForm) {
      event.preventDefault();
      await handlePollingImport(pollingImportForm);
      return;
    }

    const pollingPlanForm = event.target.closest("[data-polling-plan-form]");
    if (pollingPlanForm) {
      event.preventDefault();
      const formData = new FormData(pollingPlanForm);
      const result = createPollingPlan(state, { category: String(formData.get("category") || ""), manufacturer: String(formData.get("manufacturer") || ""), scheduledAt: String(formData.get("scheduledAt") || ""), actorId: currentUser()?.id || "system" });
      if (!result.ok) { setMessage(result.errors.join("; "), "error"); render(); return; }
      ui.pollingPlanResult = result.plan.selectionSummary;
      commitState(result.state, `План сохранён: ${result.plan.selectionSummary.total} устройств; сетевое выполнение заблокировано.`);
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

    const form = event.target.closest("[data-login-form]");
    if (!form) return;
    event.preventDefault();
    const formData = new FormData(form);
    const login = String(formData.get("login") || "").trim();
    const password = String(formData.get("password") || "");
    const user = state.users.find((item) => item.active && item.login === login && item.password === password);
    if (!user) {
      setMessage("Неверные demo-учётные данные.", "error");
      render();
      return;
    }
    let next = deepClone(state);
    next.currentUserId = null;
    if (!next.settings.demoWarningAcceptedAt) next.settings.demoWarningAcceptedAt = nowIso();
    next = appendHistory(next, {
      actorId: user.id,
      actorName: user.name,
      action: "Вход в demo-интерфейс",
      entityType: "session"
    });
    const sessionResult = writeSessionUserId(next, user.id, sessionStorageRef);
    if (!sessionResult.ok) {
      setMessage(`Demo-session не создана: ${sessionResult.errors.join("; ")}`, "error");
      render();
      return;
    }
    sessionUserId = user.id;
    ui.route = "dashboard";
    if (!commitState(next)) {
      clearSessionUserId(sessionStorageRef);
      sessionUserId = null;
      render();
    }
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
    ui.inventoryBusy = true;
    ui.srImportResults = [];
    ui.srProgress = { stage: "Чтение выгрузки SR", processed: 0, total: 0, accepted: 0, rejected: 0 };
    render();
    try {
      const result = await importSrWorkbook(state, { filename: file.name, arrayBuffer: await readFileArrayBuffer(file), actorId: currentUser()?.id || "system", onProgress(progress) { ui.srProgress = progress; render(); } });
      if (result.ok && result.outcome !== "duplicate") {
        state = result.state;
        pollingImportContextCache = null;
      }
      ui.srImportResults.push({ name: file.name, ok: result.ok, label: result.outcome, detail: result.ok ? `Принято ${result.acceptedCount ?? 0}, отклонено ${result.rejectedCount ?? 0}` : result.errors.join("; ") });
      setMessage(result.ok ? "Выгрузка SR обработана." : "Выгрузка SR не импортирована.", result.ok ? "success" : "error");
    } catch (error) {
      ui.srImportResults.push({ name: file.name, ok: false, label: "failed", detail: `Не удалось обработать файл ${file.name}. Проверьте структуру XLSX и обязательные столбцы.` });
      setMessage(`Не удалось загрузить выгрузку SR ${file.name}. Прежние данные сохранены; проверьте файл и повторите попытку.`, "error");
    }
    ui.inventoryBusy = false;
    render();
  }

  async function handlePollingImport(form) {
    const selectedFiles = Array.from(form.elements.pollingFiles?.files || []);
    if (!selectedFiles.length) {
      setMessage("Выберите главную папку с результатами опросов.", "error"); render(); return;
    }
    ui.inventoryBusy = true;
    ui.pollingCancelRequested = false;
    ui.pollingImportResults = [];
    ui.pollingProgress = { stage: "Поиск файлов", total: selectedFiles.length, processed: 0, succeeded: 0, errors: 0, duplicates: 0, currentRun: null, filesPerSecond: 0, etaSeconds: null, status: "running" };
    render();
    try {
      const descriptors = selectedFiles.map((file) => ({ name: file.name, relativePath: file.webkitRelativePath || file.name, lastModified: file.lastModified, sourceFile: file }));
      const result = await processPollingImportBatches(state, {
        actorId: currentUser()?.id || "system",
        files: descriptors,
        context: pollingImportContextCache,
        readText: (descriptor) => readFileText(descriptor.sourceFile),
        shouldCancel: () => ui.pollingCancelRequested,
        onProgress: (progress) => updatePollingProgress(progress, progress.status !== "running")
      });
      if (!result.ok) {
        ui.pollingImportResults = [
          ...result.rejected.map((item) => ({ name: item.relativePath, ok: false, label: "failed", detail: item.reason })),
          ...result.ignored.map((item) => ({ name: item.relativePath, ok: true, label: "unsupported", detail: "Файл проигнорирован: требуется JSON" }))
        ];
        setMessage(result.errors.join("; "), "error");
        ui.inventoryBusy = false;
        ui.pollingCancelRequested = false;
        pollingImportContextCache = result.context;
        if (pollingProgressRenderTimer) clearTimeout(pollingProgressRenderTimer);
        pollingProgressRenderTimer = null;
        render();
        return;
      }
      state = result.state;
      pollingImportContextCache = result.context;
      ui.pollingImportResults = [
        ...result.folderResults.map((item) => ({ name: item.folderPath, ok: item.outcome !== "failed", label: item.outcome, detail: `JSON: ${item.importedCount} из ${item.fileCount}; ошибок: ${item.errorCount}; время опроса: ${formatDateTime(item.capturedAt)}` })),
        ...result.folderResults.flatMap((item) => item.fileErrors.map((error) => ({ name: error.relativePath || error.name, ok: false, label: "failed", detail: error.reason }))),
        ...result.rejected.map((item) => ({ name: item.relativePath, ok: false, label: "failed", detail: item.reason })),
        ...result.ignored.map((item) => ({ name: item.relativePath, ok: true, label: "unsupported", detail: "Файл проигнорирован: требуется JSON" }))
      ];
      if (result.cancelled) setMessage("Загрузка остановлена пользователем.", "warning");
      else setMessage(`Обработано папок опросов: ${result.importedFolderCount}; JSON-файлов: ${result.summary.processed}; успешно: ${result.summary.succeeded}; дубликатов: ${result.summary.duplicates}; ошибок: ${result.errorCount}; проигнорировано не-JSON: ${result.ignored.length}.`, result.outcome === "partial" ? "warning" : "success");
    } catch (error) {
      ui.pollingImportResults.push({ name: "Главная папка результатов", ok: false, label: "failed", detail: "Не удалось завершить импорт. Проверьте доступ к файлам, структуру JSON и имена папок." });
      setMessage("Импорт результатов опросов не завершён. Прежние данные сохранены.", "error");
    }
    ui.inventoryBusy = false;
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
          if (persisted) state = deepClone(result.state);
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

  function handleChange(event) {
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
})(globalThis);
