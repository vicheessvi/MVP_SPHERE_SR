(function (root, factory) {
  "use strict";
  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  root.MVP_PRODUCT_CATALOG = catalog;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
  }

  const EQUIPMENT_CATEGORY_CATALOG = deepFreeze([
    { id: "vcs", route: "vcs", title: "Терминалы ВКС", order: 21, srField: "Тип модели", srValue: "Video Conference", pollingProtocol: "protocol_required" },
    { id: "controller", route: "controllers", title: "Контроллеры", order: 22, srField: "Тип оборудования", srValue: "controller", pollingProtocol: "protocol_required" },
    { id: "panel", route: "panels", title: "Панели управления", order: 23, srField: "Тип модели", srValue: "Панель управления", pollingProtocol: "protocol_required" },
    { id: "switch", route: "switches", title: "Коммутаторы", order: 24, srField: "Тип модели", srValue: "Коммутатор", pollingProtocol: "protocol_required" },
    { id: "matrix_switch", route: "matrix-switches", title: "Матричные коммутаторы", order: 25, srField: "Тип модели", srValue: "Матричный коммутатор", pollingProtocol: "protocol_required" },
    { id: "scaler", route: "scalers", title: "Скалеры", order: 26, srField: "Тип модели", srValue: "Скалер", pollingProtocol: "protocol_required" },
    { id: "audio_processor", route: "audio-processors", title: "Аудио процессоры", order: 27, srField: "Тип модели", srValue: "Аудио процессор", pollingProtocol: "protocol_required" }
  ]);

  const ANALYZED_PARAMETER_RULES = deepFreeze([
    { id: "extron-controller-type-v1", category: "controller", manufacturerNormalized: "extron", path: "$.webBlocks.Project Info.Controller Type", label: "Тип контроллера", rationale: "Используется для подтверждённой классификации Контроллера Extron.", version: 1 },
    { id: "extron-controller-firmware-v1", category: "controller", manufacturerNormalized: "extron", path: "$.webBlocks.Firmware.version", label: "Версия прошивки", rationale: "Показывает изменение установленной версии прошивки Контроллера Extron.", version: 1 },
    { id: "extron-panel-type-v1", category: "panel", manufacturerNormalized: "extron", path: "$.webBlocks.Project Info.Controller Type", label: "Тип панели управления", rationale: "Используется для подтверждённой классификации Панели управления Extron.", version: 1 },
    { id: "extron-panel-firmware-v1", category: "panel", manufacturerNormalized: "extron", path: "$.webBlocks.Firmware.version", label: "Версия прошивки", rationale: "Показывает изменение установленной версии прошивки Панели управления Extron.", version: 1 }
  ]);

  const equipmentModules = EQUIPMENT_CATEGORY_CATALOG.map((category) => ({
    route: category.route,
    renderer: "inventory",
    parentRoute: "equipment",
    category: category.id,
    title: category.title,
    order: category.order,
    helpId: `module-${category.route}`,
    contextHelp: true,
    summary: `Перечень категории «${category.title}» из актуальной выгрузки SR.`,
    details: `Использует общий перечень, фильтры, карточку, историю опросов и аналитику оборудования. Категория определяется точным сравнением поля SR «${category.srField}» со значением «${category.srValue}» после безопасной нормализации пробелов и регистра. Каждая различимая строка актуальной SR остаётся в перечне даже без результата опроса. Подтверждённый протокол автоматического опроса не предполагается без отдельной спецификации.`,
    keywords: [category.title.toLocaleLowerCase("ru-RU"), category.srValue.toLocaleLowerCase("ru-RU"), category.id]
  }));

  const MODULE_CATALOG = deepFreeze([
    {
      route: "dashboard", renderer: "dashboard", title: "Главный экран", order: 10, helpId: "module-dashboard", contextHelp: true,
      summary: "Помогает быстро понять текущее состояние оборудования и результаты последних опросов.",
      details: "Объединяет актуальную выгрузку SR, последние данные устройств, историю опросов и обнаруженные изменения. Показатели последнего состояния отделены от показателей выбранного периода.",
      keywords: ["главный экран", "дашборд", "показатели"]
    },
    {
      route: "equipment", renderer: "equipment", title: "Оборудование", order: 20, helpId: "module-equipment", contextHelp: true,
      summary: "Единая точка доступа к семи категориям оборудования мультимедийной инфраструктуры.",
      details: "Раскрывает Терминалы ВКС, Контроллеры, Панели управления, Коммутаторы, Матричные коммутаторы, Скалеры и Аудио процессоры. Количество определяется актуальной SR: отсутствие JSON не удаляет устройство, а конфликт идентификаторов между разными строками сохраняется как отдельная диагностируемая запись.",
      keywords: ["оборудование", "категории", "перечень"]
    },
    ...equipmentModules,
    {
      route: "upload", renderer: "upload", title: "Загрузка", order: 50, helpId: "module-upload", contextHelp: false,
      summary: "Импортирует выгрузку SR и все папки результатов опросов из одной выбранной общей папки.",
      details: "Каждая вложенная папка YYYY-MM-DD_HH-MM-SS становится отдельным запуском; JSON находятся рекурсивно и обрабатываются пакетно с живым прогрессом и безопасной отменой. Ошибки отдельных файлов не отменяют корректные результаты. Все данные остаются в памяти текущей вкладки.",
      keywords: ["импорт", "xlsx", "json", "общая папка", "пакетная загрузка"]
    },
    {
      route: "settings", renderer: "settings", title: "Локальное хранилище", order: 60, helpId: "module-settings", contextHelp: false,
      summary: "Показывает свойства данных и хранения для фактически активного режима запуска.",
      details: "Единственный режим прямого запуска использует только память текущей вкладки. Фактический предел определяется доступной памятью браузера; после закрытия или перезагрузки данные удаляются.",
      keywords: ["сеанс", "память", "размер", "хранилище", "index.html"]
    },
    {
      route: "reference", renderer: "reference", title: "Справочник", order: 70, helpId: "module-reference", contextHelp: false,
      summary: "Объясняет термины, сокращения, показатели, источники и правила работы инструмента.",
      details: "Содержание написано для эксплуатации и не заменяет документацию разработчиков.",
      keywords: ["помощь", "глоссарий", "термины"]
    }
  ]);

  const UI_TERMS = deepFreeze({
    categories: Object.fromEntries(EQUIPMENT_CATEGORY_CATALOG.map((item) => [item.id, item.title])),
    pollStatuses: {
      success: "Успешно", SUCCESS: "Успешно", completed: "Успешно", processed: "Успешно",
      error: "Ошибка", failed: "Ошибка", FAILED: "Ошибка",
      network_unreachable: "Нет ответа по сети", processing_error: "Ошибка обработки", unmatched: "Не найдено в SR",
      not_polled: "Не опрашивалось", NOT_POLLED: "Не опрашивалось", never: "Не опрашивалось",
      unsupported: "Автоматический опрос не поддерживается", UNSUPPORTED: "Автоматический опрос не поддерживается",
      authorization_error: "Ошибка авторизации", stale: "Данные устарели",
      unknown: "Данные отсутствуют", UNKNOWN: "Данные отсутствуют"
    },
    pingStatuses: { ok: "Доступно по сети", failed: "Нет ответа по сети", unknown: "Данные отсутствуют" },
    capabilities: {
      implemented: "Автоматический опрос поддерживается", supported: "Автоматический опрос поддерживается",
      not_implemented: "Автоматический опрос не поддерживается", unsupported: "Автоматический опрос не поддерживается",
      unknown: "Данные отсутствуют"
    },
    runStatuses: { planned: "Запланирован", completed: "Завершён", processed: "Обработан", partial: "Завершён частично", failed: "Ошибка" },
    importOutcomes: { processed: "Обработано", partial: "Обработано частично", matched: "Найдено в SR", unmatched: "Не найдено в SR", ambiguous: "Неоднозначное сопоставление с SR", ip_conflict: "Конфликт IP результата опроса", category_conflict: "Конфликт типа оборудования", duplicate: "Дубликат", failed: "Ошибка", unsupported: "Не поддерживается" },
    tooltips: {
      noNetwork: "Количество устройств, которые не ответили на проверку сетевой доступности.",
      notPolled: "Устройство есть в выгрузке SR, но результаты его опросов отсутствуют.",
      changedDevices: "Количество устройств, данные которых отличаются от предыдущего результата опроса."
    }
  });

  const STATUS_DESCRIPTORS = deepFreeze([
    { id: "status-success", group: "pollStatuses", code: "success", summary: "Последний опрос завершён без известной ошибки.", keywords: ["success"] },
    { id: "status-error", group: "pollStatuses", code: "processing_error", summary: "Файл или ответ устройства не удалось корректно обработать; это не означает ошибку авторизации.", keywords: ["failed", "error", "processing_error"] },
    { id: "status-network", group: "pollStatuses", code: "network_unreachable", summary: "Подтверждённая проверка сетевой доступности завершилась без ответа.", keywords: ["ping", "network_unreachable"] },
    { id: "status-unmatched", group: "pollStatuses", code: "unmatched", summary: "Результат опроса не удалось однозначно связать с устройством актуальной SR.", keywords: ["unmatched", "sr"] },
    { id: "status-not-polled", group: "pollStatuses", code: "not_polled", summary: "Устройство присутствует в SR, но история его опросов отсутствует.", keywords: ["not_polled", "never"] },
    { id: "status-unsupported", group: "pollStatuses", code: "unsupported", summary: "В текущей версии отсутствует подтверждённый механизм автоматического опроса данного оборудования.", keywords: ["unsupported"] },
    { id: "status-no-network", group: "pingStatuses", code: "failed", tooltip: "noNetwork", keywords: ["ping", "ping_failure", "недоступно"] },
    { id: "status-auth", group: "pollStatuses", code: "authorization_error", summary: "Для любого устройства Extron в результате получено точное значение error = No credentials were accepted либо подтверждённая стадия авторизации.", keywords: ["authorization_error", "no credentials were accepted", "логин", "пароль", "extron"] },
    { id: "status-no-data", group: "pollStatuses", code: "unknown", summary: "Информации недостаточно для определения состояния.", keywords: ["no data", "unknown"] },
    { id: "status-stale", group: "pollStatuses", code: "stale", summary: "Последние данные старше установленного допустимого периода.", details: "Порог пока не настроен, поэтому статус не рассчитывается.", keywords: ["stale", "freshness"], status: "in_development" }
  ]);

  const REQUIRED_TERM_CODES = deepFreeze({
    categories: EQUIPMENT_CATEGORY_CATALOG.map((item) => item.id),
    pollStatuses: ["success", "error", "network_unreachable", "processing_error", "unmatched", "not_polled", "unsupported", "authorization_error", "stale", "unknown"],
    pingStatuses: ["ok", "failed", "unknown"],
    capabilities: ["implemented", "not_implemented", "unknown"],
    runStatuses: ["planned", "completed", "partial", "failed"],
    importOutcomes: ["processed", "partial", "matched", "unmatched", "ambiguous", "ip_conflict", "category_conflict", "duplicate", "failed", "unsupported"],
    tooltips: ["noNetwork", "notPolled", "changedDevices"]
  });

  function orderedModules(modules) {
    return [...(modules || MODULE_CATALOG)].sort((left, right) => left.order - right.order || left.route.localeCompare(right.route, "ru"));
  }

  function buildNavigation(modules) {
    const ordered = orderedModules(modules);
    return ordered.filter((item) => !item.parentRoute).map(({ route, title }) => ({
      route,
      title,
      children: ordered.filter((child) => child.parentRoute === route).map(({ route: childRoute, title: childTitle }) => ({ route: childRoute, title: childTitle }))
    }));
  }

  function buildModuleHelpSection(modules) {
    return deepFreeze({
      id: "modules", title: "2. Модули инструмента", description: "Что показывает каждый доступный модуль и откуда берутся его данные.",
      entries: orderedModules(modules).map((item) => ({ id: item.helpId, title: item.title, summary: item.summary, details: item.details, keywords: [...item.keywords] }))
    });
  }

  function buildHelpTopicByRoute(modules) {
    return deepFreeze(Object.fromEntries(orderedModules(modules).filter((item) => item.contextHelp).map((item) => [item.route, item.helpId])));
  }

  function buildInventoryRoutes(modules) {
    return deepFreeze(Object.fromEntries(orderedModules(modules).filter((item) => item.category).map((item) => [item.route, { category: item.category, title: item.title, help: item.helpId }])));
  }

  function buildStatusHelpSection(terms, descriptors) {
    const dictionary = terms || UI_TERMS;
    return deepFreeze({
      id: "statuses", title: "5. Статусы оборудования", description: "Как понимать состояние последнего опроса.",
      entries: (descriptors || STATUS_DESCRIPTORS).map((item) => ({
        id: item.id,
        title: dictionary[item.group]?.[item.code] || "Данные отсутствуют",
        summary: item.tooltip ? dictionary.tooltips?.[item.tooltip] || "Данные отсутствуют" : item.summary,
        ...(item.details ? { details: item.details } : {}),
        keywords: [...item.keywords],
        ...(item.status ? { status: item.status } : {})
      }))
    });
  }

  function duplicateValues(values) {
    const seen = new Set();
    return [...new Set(values.filter((value) => seen.has(value) || !seen.add(value)))];
  }

  function validateProductCatalog(options) {
    const input = options || {};
    const modules = input.modules || MODULE_CATALOG;
    const terms = input.uiTerms || UI_TERMS;
    const statusDescriptors = input.statusDescriptors || STATUS_DESCRIPTORS;
    const allowedRenderers = new Set(input.allowedRenderers || ["dashboard", "equipment", "inventory", "upload", "settings", "reference"]);
    const errors = [];
    const russian = /[А-Яа-яЁё]/;

    duplicateValues(modules.map((item) => item.route)).forEach((value) => errors.push(`Повторяется route модуля: ${value}`));
    duplicateValues(modules.map((item) => item.helpId)).forEach((value) => errors.push(`Повторяется helpId модуля: ${value}`));
    duplicateValues(modules.map((item) => item.order)).forEach((value) => errors.push(`Повторяется порядок модуля: ${value}`));
    modules.forEach((item) => {
      if (!/^[a-z][a-z0-9-]*$/.test(String(item.route || ""))) errors.push(`Некорректный route модуля: ${item.route || "(пусто)"}`);
      if (!/^module-[a-z][a-z0-9-]*$/.test(String(item.helpId || ""))) errors.push(`Некорректный helpId модуля: ${item.helpId || "(пусто)"}`);
      if (!allowedRenderers.has(item.renderer)) errors.push(`Неизвестный renderer модуля ${item.route}: ${item.renderer}`);
      ["title", "summary", "details"].forEach((field) => {
        if (!String(item[field] || "").trim() || !russian.test(String(item[field] || ""))) errors.push(`У модуля ${item.route || "(пусто)"} отсутствует русское поле ${field}`);
      });
      if (!Array.isArray(item.keywords) || !item.keywords.length) errors.push(`У модуля ${item.route || "(пусто)"} отсутствуют keywords`);
      if (item.parentRoute && !modules.some((parent) => parent.route === item.parentRoute)) errors.push(`Не найден родитель ${item.parentRoute} для ${item.route}`);
    });

    const categoryIds = new Set(EQUIPMENT_CATEGORY_CATALOG.map((item) => item.id));
    duplicateValues(EQUIPMENT_CATEGORY_CATALOG.map((item) => item.id)).forEach((value) => errors.push(`Повторяется category id: ${value}`));
    duplicateValues(EQUIPMENT_CATEGORY_CATALOG.map((item) => item.route)).forEach((value) => errors.push(`Повторяется category route: ${value}`));
    const ruleIds = ANALYZED_PARAMETER_RULES.map((item) => item.id);
    duplicateValues(ruleIds).forEach((value) => errors.push(`Повторяется analyzed rule id: ${value}`));
    ANALYZED_PARAMETER_RULES.forEach((rule) => {
      if (!categoryIds.has(rule.category)) errors.push(`Analyzed rule ${rule.id} содержит неизвестную категорию`);
      if (!String(rule.path || "").startsWith("$.")) errors.push(`Analyzed rule ${rule.id} содержит некорректный JSON path`);
      if (!russian.test(String(rule.label || "")) || !russian.test(String(rule.rationale || ""))) errors.push(`Analyzed rule ${rule.id} не имеет русского описания`);
    });

    Object.entries(REQUIRED_TERM_CODES).forEach(([group, codes]) => {
      if (!terms[group] || typeof terms[group] !== "object") return errors.push(`Отсутствует группа терминов: ${group}`);
      codes.forEach((code) => {
        const label = String(terms[group][code] || "").trim();
        if (!label || !russian.test(label)) errors.push(`Отсутствует русская подпись ${group}.${code}`);
      });
    });

    duplicateValues(statusDescriptors.map((item) => item.id)).forEach((value) => errors.push(`Повторяется id статуса: ${value}`));
    statusDescriptors.forEach((item) => {
      if (!terms[item.group]?.[item.code]) errors.push(`Статус ${item.id} ссылается на отсутствующий термин ${item.group}.${item.code}`);
      if (item.tooltip && !terms.tooltips?.[item.tooltip]) errors.push(`Статус ${item.id} ссылается на отсутствующую подсказку ${item.tooltip}`);
    });

    const moduleHelp = buildModuleHelpSection(modules);
    const statusHelp = buildStatusHelpSection(terms, statusDescriptors);
    const referenceIds = [...moduleHelp.entries, ...statusHelp.entries].map((item) => item.id);
    duplicateValues(referenceIds).forEach((value) => errors.push(`Повторяется id справочной записи: ${value}`));
    const helpIds = new Set(moduleHelp.entries.map((item) => item.id));
    modules.filter((item) => item.contextHelp && !helpIds.has(item.helpId)).forEach((item) => errors.push(`Нет контекстной справки для маршрута: ${item.route}`));

    return deepFreeze({
      ok: errors.length === 0,
      errors,
      counts: { modules: modules.length, moduleHelpEntries: moduleHelp.entries.length, statusEntries: statusHelp.entries.length }
    });
  }

  return deepFreeze({
    EQUIPMENT_CATEGORY_CATALOG,
    ANALYZED_PARAMETER_RULES,
    MODULE_CATALOG,
    UI_TERMS,
    STATUS_DESCRIPTORS,
    REQUIRED_TERM_CODES,
    buildNavigation,
    buildModuleHelpSection,
    buildHelpTopicByRoute,
    buildInventoryRoutes,
    buildStatusHelpSection,
    validateProductCatalog
  });
});
