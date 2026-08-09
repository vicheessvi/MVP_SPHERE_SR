# AGENTS.md

## Статус проекта

Проект подготовлен к дальнейшему редактированию через ИИ-агента и GitHub SpecKit.

- Видение: `docs/project-vision.md`.
- Стек: Windows, Node.js 20+, встроенный HTTP, HTML5, CSS3, Vanilla JavaScript, vendored SheetJS CE 0.20.3.
- Runtime: только `127.0.0.1`, запуск через `start.ps1`; direct-open запрещён для рабочих данных.
- Хранение: AES-256-GCM, мастер-ключ под Windows DPAPI CurrentUser, отдельный credential vault, без искусственной квоты.
- Роль: только «Администратор МЦТП».
- Constitution: версия 2.0.0 в `.specify/memory/constitution.md`.
- Текущая feature: `specs/004-analytics-dashboard/`.

## Правила работы агента

- Сначала прочитать этот файл и использовать `docs/context-map.md`.
- Не загружать весь репозиторий без необходимости и не менять несвязанные файлы.
- Не выдумывать vendor API, команды, transport или схемы ответов; неизвестное отмечать `TBD`/`protocol_required`.
- Никогда не помещать реальные логины, пароли, токены, ключи, IP-выгрузки или runtime data в Git, fixtures, логи, state, аналитику и ответы API.
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
- Рабочая acceptance выполняется запуском `start.ps1`, а не открытием `index.html`.
