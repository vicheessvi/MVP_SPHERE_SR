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

  const MODULE_CATALOG = deepFreeze([
    {
      route: "dashboard", renderer: "dashboard", title: "Главный экран", order: 10, helpId: "module-dashboard", contextHelp: true,
      summary: "Помогает быстро понять текущее состояние оборудования и результаты последних опросов.",
      details: "Объединяет актуальную выгрузку SR, последние данные устройств, историю опросов и обнаруженные изменения. Показатели последнего состояния отделены от показателей выбранного периода.",
      keywords: ["главный экран", "дашборд", "показатели"]
    },
    {
      route: "vcs", renderer: "inventory", category: "vcs", title: "Терминалы ВКС", order: 20, helpId: "module-vcs", contextHelp: true,
      summary: "Перечень оборудования для проведения видеоконференций.",
      details: "Формируется из строк SR, где исходное поле «Тип модели» имеет значение Video Conference. Пользователь видит локацию, производителя, модель, сетевые параметры, последнее состояние, историю и изменения.",
      keywords: ["вкс", "video conference", "видеоконференцсвязь"]
    },
    {
      route: "controllers", renderer: "inventory", category: "controller", title: "Контроллеры", order: 30, helpId: "module-controllers", contextHelp: true,
      summary: "Устройства, управляющие оборудованием и сценариями мультимедийной системы помещения.",
      details: "Формируются из строк SR с техническим значением типа оборудования controller. Наличие в SR и поддержка автоматического опроса являются разными признаками.",
      keywords: ["controller", "extron", "управление"]
    },
    {
      route: "panels", renderer: "inventory", category: "panel", title: "Панели управления", order: 40, helpId: "module-panels", contextHelp: true,
      summary: "Пользовательские устройства управления мультимедийной системой помещения.",
      details: "В модуле показаны все Панели управления из SR. TLP — встречающееся в данных обозначение Панелей управления Extron, а не пользовательское название категории.",
      keywords: ["панели", "tlp", "extron"]
    },
    {
      route: "upload", renderer: "upload", title: "Загрузка", order: 50, helpId: "module-upload", contextHelp: false,
      summary: "Импортирует выгрузку SR и результаты опросов; файл учётных данных доступен только при защищённом запуске.",
      details: "Все операции выполняются локально. Прямой запуск хранит импорт только до перезагрузки вкладки; start.ps1 включает постоянное защищённое хранилище и vault.",
      keywords: ["импорт", "xlsx", "json", "csv"]
    },
    {
      route: "settings", renderer: "settings", title: "Локальное хранилище", order: 60, helpId: "module-settings", contextHelp: false,
      summary: "Показывает свойства данных и хранения для фактически активного режима запуска.",
      details: "Прямой запуск использует только память текущей вкладки. При запуске через start.ps1 прикладного ограничения объёма нет; предел определяется свободным местом локальной файловой системы.",
      keywords: ["сеанс", "шифрование", "размер", "хранилище", "index.html", "start.ps1"]
    },
    {
      route: "reference", renderer: "reference", title: "Справочник", order: 70, helpId: "module-reference", contextHelp: false,
      summary: "Объясняет термины, сокращения, показатели, источники и правила работы инструмента.",
      details: "Содержание написано для эксплуатации и не заменяет документацию разработчиков.",
      keywords: ["помощь", "глоссарий", "термины"]
    }
  ]);

  const UI_TERMS = deepFreeze({
    categories: { vcs: "Терминалы ВКС", controller: "Контроллеры", panel: "Панели управления" },
    pollStatuses: {
      success: "Успешно", SUCCESS: "Успешно", completed: "Успешно", processed: "Успешно",
      error: "Ошибка", failed: "Ошибка", FAILED: "Ошибка",
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
    importOutcomes: { processed: "Обработано", partial: "Обработано частично", matched: "Найдено в SR", unmatched: "Не найдено в SR", ambiguous: "Требует проверки", duplicate: "Дубликат", failed: "Ошибка", unsupported: "Не поддерживается" },
    tooltips: {
      noNetwork: "Количество устройств, которые не ответили на проверку сетевой доступности.",
      notPolled: "Устройство есть в выгрузке SR, но результаты его опросов отсутствуют.",
      changedDevices: "Количество устройств, данные которых отличаются от предыдущего результата опроса."
    }
  });

  const STATUS_DESCRIPTORS = deepFreeze([
    { id: "status-success", group: "pollStatuses", code: "success", summary: "Последний опрос завершён без известной ошибки.", keywords: ["success"] },
    { id: "status-error", group: "pollStatuses", code: "error", summary: "Последний опрос выполнялся, но завершился ошибкой.", keywords: ["failed", "error"] },
    { id: "status-not-polled", group: "pollStatuses", code: "not_polled", summary: "Устройство присутствует в SR, но история его опросов отсутствует.", keywords: ["not_polled", "never"] },
    { id: "status-unsupported", group: "pollStatuses", code: "unsupported", summary: "В текущей версии отсутствует подтверждённый механизм автоматического опроса данного оборудования.", keywords: ["unsupported"] },
    { id: "status-no-network", group: "pingStatuses", code: "failed", tooltip: "noNetwork", keywords: ["ping", "ping_failure", "недоступно"] },
    { id: "status-auth", group: "pollStatuses", code: "authorization_error", summary: "Инструмент смог обратиться к устройству, но не прошёл проверку учётных данных.", keywords: ["authorization_error", "логин", "пароль"] },
    { id: "status-no-data", group: "pollStatuses", code: "unknown", summary: "Информации недостаточно для определения состояния.", keywords: ["no data", "unknown"] },
    { id: "status-stale", group: "pollStatuses", code: "stale", summary: "Последние данные старше установленного допустимого периода.", details: "Порог пока не настроен, поэтому статус не рассчитывается.", keywords: ["stale", "freshness"], status: "in_development" }
  ]);

  const REQUIRED_TERM_CODES = deepFreeze({
    categories: ["vcs", "controller", "panel"],
    pollStatuses: ["success", "error", "not_polled", "unsupported", "authorization_error", "stale", "unknown"],
    pingStatuses: ["ok", "failed", "unknown"],
    capabilities: ["implemented", "not_implemented", "unknown"],
    runStatuses: ["planned", "completed", "partial", "failed"],
    importOutcomes: ["processed", "partial", "matched", "unmatched", "ambiguous", "duplicate", "failed", "unsupported"],
    tooltips: ["noNetwork", "notPolled", "changedDevices"]
  });

  function orderedModules(modules) {
    return [...(modules || MODULE_CATALOG)].sort((left, right) => left.order - right.order || left.route.localeCompare(right.route, "ru"));
  }

  function buildNavigation(modules) {
    return orderedModules(modules).map(({ route, title }) => ({ route, title }));
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
    const allowedRenderers = new Set(input.allowedRenderers || ["dashboard", "inventory", "upload", "settings", "reference"]);
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
