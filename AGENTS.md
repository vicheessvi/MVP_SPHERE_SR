# AGENTS.md

## Статус проекта

Проект подготовлен к дальнейшему редактированию через ИИ-агента и GitHub SpecKit.

- Видение: `docs/project-vision.md`.
- Стек интерфейса: Windows, HTML5, CSS3, Vanilla JavaScript, browser File/System Access API, vendored SheetJS CE 0.20.3; Node.js используется для разработки и защищённого loopback polling runtime.
- Runtime интерфейса: `start.ps1` открывает авторизованную loopback-сессию для автоматического опроса; прямой `file://index.html` остаётся для ручного анализа.
- Хранение интерфейса: только память страницы; выбранный XLSX передаётся только в память текущей loopback-сессии и не сериализуется; `localStorage`/`IndexedDB` не используются.
- Роль: только «Администратор МЦТП».
- Constitution: версия 3.1.0 в `.specify/memory/constitution.md`.
- Текущая feature: `specs/013-in-tool-polling/`.

## Правила работы агента

- Сначала прочитать этот файл и использовать `docs/context-map.md`.
- Не загружать весь репозиторий без необходимости и не менять несвязанные файлы.
- Не выдумывать vendor API, команды, transport или схемы ответов; неизвестное отмечать `TBD`/`protocol_required`. Для Extron controller/panel разрешён только contract `runtime/extron-web-poller.js`: dynamic URI из текущего bundle и exact resource URL.
- Не изменять raw SR/JSON и внутренние enum-коды ради локализации; русские подписи брать из централизованного presentation dictionary в `app.js`.
- Термины SR, GCPlus и перезагрузок не трактовать без подтверждения; использовать предусмотренные пометки «Требует уточнения» и «В разработке».
- Доступные модули, их названия, справочные описания, пользовательские статусы и подсказки изменять через `product-catalog.js`; после правки обязательно запускать `node scripts/validate-reference.js`.
- Не добавлять новый доступный маршрут в обход `MODULE_CATALOG` и не дублировать модульные карточки вручную в `app.js`.
- Никогда не помещать реальные логины, пароли, токены, ключи, IP-выгрузки или runtime data в Git, fixtures, логи, state, аналитику и ответы API.
- Не заменять memory adapter на `localStorage`/`IndexedDB`. XLSX credentials допускается читать только в замкнутую переменную вкладки и передавать бинарно в same-origin loopback runtime; нельзя помещать пары в `state`, DOM, plan, логи, browser storage или постоянное runtime-хранилище.
- Автоматический запуск принимает только текущий XLSX `Логин | Пароль` как общий пул без fallback к старому vault; runtime сверяет SHA-256, очищает pool во всех terminal paths и выдаёт redacted JSON по одному до ACK записи.
- Не добавлять внешнюю передачу, CDN, телеметрию или non-loopback bind без нового явного решения пользователя и security review.
- Не делать commit/push без явного указания пользователя.
- Значимые решения фиксировать в `docs/decisions`, этапы — в `docs/implementation-log.md`.
- При изменении архитектуры, workflow или поведения обновлять документацию и тесты.

## Workflow

Подробности находятся в `docs/development-workflow.md`.

- Full SpecKit — крупные, рискованные или неоднозначные задачи.
- SpecKit-lite — средние задачи.
- Короткий prompt — небольшие локальные правки.

## Проверки

- Логика и регрессия: `node tests.js`.
- Каталог и отдельные polling-скрипты: релевантные проверки `runtime-tests.js`, пока исторические runtime-компоненты остаются в репозитории.
- Синтаксис: `node --check` для изменённых `.js`.
- Secret/artifact scan обязателен перед commit.
- Acceptance: `start.ps1` проверяет полный автоматический workflow, а прямой `index.html` — ручной пакетный импорт, сеансовую аналитику и явную блокировку сетевого запуска.
