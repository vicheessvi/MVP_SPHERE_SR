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
- Текущая feature: `specs/014-python-runtime-migration/`.

## Правила работы агента

- Сначала прочитать этот файл и использовать `docs/context-map.md`.
- Не загружать весь репозиторий без необходимости и не менять несвязанные файлы.
- Не выдумывать vendor API, команды, transport или схемы ответов; неизвестное отмечать `TBD`/`protocol_required`.
- Для Extron controller/panel разрешён только подтверждённый контракт `mvp_runtime/adapters/extron.py`: HTTPS/443, dynamic URI из текущего bundle и exact resource URL.
- Новый adapter регистрировать через `mvp_runtime/polling.py` и `runtime/device-catalog.json` только после evidence review, описанного в `docs/development-workflow.md`.
- Не изменять raw SR/JSON и внутренние enum-коды ради локализации; русские подписи брать из централизованного presentation dictionary в `app.js`.
- Термины SR, GCPlus и перезагрузок не трактовать без подтверждения; использовать «Требует уточнения» и «В разработке».
- Доступные модули, их названия, справочные описания, пользовательские статусы и подсказки изменять через `product-catalog.js`; после правки обязательно запускать `node scripts/validate-reference.js`.
- Не добавлять новый доступный маршрут в обход `MODULE_CATALOG` и не дублировать модульные карточки вручную в `app.js`.
- Никогда не помещать реальные логины, пароли, токены, ключи, IP-выгрузки или runtime data в Git, fixtures, логи, state, аналитику и ответы API.
- XLSX credentials допускается читать только в замкнутой памяти вкладки и передавать бинарно в same-origin loopback runtime. Пары нельзя помещать в state, DOM, plan, browser storage или постоянное хранилище.
- Runtime сверяет SHA-256 текущего XLSX, очищает пул во всех terminal paths и выдаёт redacted JSON по одному до ACK записи. Vault и fallback credentials запрещены.
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
