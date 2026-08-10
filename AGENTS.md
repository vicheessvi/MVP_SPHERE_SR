# AGENTS.md

## Статус проекта

Проект подготовлен к дальнейшему редактированию через ИИ-агента и GitHub SpecKit.

- Видение: `docs/project-vision.md`.
- Стек: Windows, Node.js 24 LTS portable/system, встроенный HTTP, HTML5, CSS3, Vanilla JavaScript, vendored SheetJS CE 0.20.3.
- Runtime: два явных режима — непостоянный `file://index.html` для текущей вкладки и защищённый `127.0.0.1` через `start.ps1`.
- Хранение: file mode использует только память страницы и не принимает secrets; secure mode использует AES-256-GCM, Windows DPAPI CurrentUser, отдельный credential vault и не имеет искусственной квоты.
- Роль: только «Администратор МЦТП».
- Constitution: версия 2.0.0 в `.specify/memory/constitution.md`.
- Текущая feature: `specs/007-direct-index-launch/`.

## Правила работы агента

- Сначала прочитать этот файл и использовать `docs/context-map.md`.
- Не загружать весь репозиторий без необходимости и не менять несвязанные файлы.
- Не выдумывать vendor API, команды, transport или схемы ответов; неизвестное отмечать `TBD`/`protocol_required`.
- Не изменять raw SR/JSON и внутренние enum-коды ради локализации; русские подписи брать из централизованного presentation dictionary в `app.js`.
- Термины SR, GCPlus и перезагрузок не трактовать без подтверждения; использовать предусмотренные пометки «Требует уточнения» и «В разработке».
- Доступные модули, их названия, справочные описания, пользовательские статусы и подсказки изменять через `product-catalog.js`; после правки обязательно запускать `node scripts/validate-reference.js`.
- Не добавлять новый доступный маршрут в обход `MODULE_CATALOG` и не дублировать модульные карточки вручную в `app.js`.
- Версию portable runtime обновлять только вместе с точными официальными URL/SHA-256 в `portable-runtime.json`, проверками и ADR; moving `latest` запрещён.
- Никогда не помещать реальные логины, пароли, токены, ключи, IP-выгрузки или runtime data в Git, fixtures, логи, state, аналитику и ответы API.
- Не заменять file-mode memory adapter на `localStorage`/`IndexedDB` и не включать credential import для `file://`; чувствительные данные браузер не сохраняет.
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
- Криптография, vault, каталог и polling: `node runtime-tests.js` из реального Windows-профиля, так как DPAPI CurrentUser не работает внутри изолированного профиля.
- Loopback API, CSRF и encrypted persistence: `node server-tests.js`.
- Синтаксис: `node --check` для изменённых `.js`.
- Secret/artifact scan обязателен перед commit.
- Acceptance выполняется для обоих режимов: прямое открытие `index.html` проверяет сеансовую аналитику и сброс при reload, а `start.ps1` — encrypted persistence, vault и loopback boundary.
