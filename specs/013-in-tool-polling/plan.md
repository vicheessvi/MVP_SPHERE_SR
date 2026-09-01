# Implementation Plan: Автоматический опрос внутри инструмента

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/013-in-tool-polling/spec.md`

## Summary

Вернуть существующий защищённый loopback runtime как штатный режим автоматического опроса. Страница передаёт выбранный XLSX в память авторизованной локальной сессии, отправляет неизменяемый план и получает очищенные результаты по одному. Браузер записывает каждый JSON в выбранную через File System Access API общую папку и подтверждает запись runtime до продолжения интервала. Прямой `file://index.html` сохраняется для ручной аналитики, но автоматический запуск в нём недоступен.

## Technical Context

**Language/Version**: HTML5, CSS3, Vanilla JavaScript; Node.js 24+ для локального loopback runtime

**Primary Dependencies**: только встроенные Node.js modules, browser File System Access API, vendored SheetJS CE 0.20.3

**Storage**: выбранная пользователем папка JSON; state и secrets только в памяти текущих процессов/вкладки

**Testing**: `node tests.js`, `node runtime-tests.js`, `node server-tests.js`, `node scripts/validate-reference.js`, `node --check`

**Target Platform**: Windows 10/11, Chromium-based browser, локальная IPv4-сеть оборудования

**Project Type**: локальное browser UI + loopback web runtime

**Performance Goals**: один результат подтверждается на диске до перехода к следующему устройству; UI обновляет прогресс не реже одного раза в секунду

**Constraints**: bind только `127.0.0.1`; без CDN/telemetry; без browser persistence; секреты не сериализуются; HTTPS-only device adapter; self-signed bypass только per-job

**Scale/Scope**: один Администратор МЦТП, один активный job на локальную сессию, последовательная обработка устройств плана

## Constitution Check

*GATE: пройден до исследования и повторно после проектирования.*

- I. Raw JSON результата сохраняется без преобразования аналитикой; безопасное удаление credential/session-полей выполняется до выдачи результата и фиксируется существующим polling schema.
- II–V. Feature не меняет правила идентичности, нормализации и аналитики; результаты по-прежнему связываются только текущим точным IP при ручном импорте.
- VI. Runtime принимает только loopback, требует одноразовую cookie-сессию, same-origin и CSRF; XLSX и пары остаются в памяти, результат redacted, внешних сервисов нет.
- Workflow. Созданы spec, research, plan, data model, contracts, quickstart и tasks; обязательны regression, secret scan и reference validation.
- Временное разрешение self-signed TLS не меняет глобальный TLS runtime и применяется только к конкретному job по явному выбору пользователя.

Post-design re-check: PASS. Pending result выдаётся только активной cookie-сессии; runtime ждёт подтверждения записи и очищает credential pool в `finally`. Folder handle не сериализуется. Отдельное обоснованное исключение: пользовательские JSON находятся в явно выбранной папке в обычном совместимом формате, как и существующие ручные результаты; приложение не создаёт скрытой незашифрованной копии.

## Project Structure

### Documentation (this feature)

```text
specs/013-in-tool-polling/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── loopback-polling-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
index.html
app.js
styles.css
runtime-config.js
server.js
start.ps1
runtime/
├── credential-pool.js
├── extron-web-poller.js
└── polling.js
scripts/
└── poll-devices.js
tests.js
runtime-tests.js
server-tests.js
product-catalog.js
docs/
├── architecture.md
├── context-map.md
├── implementation-log.md
└── decisions/
```

**Structure Decision**: расширить существующий `server.js` и browser UI без нового пакета или внешней службы. Polling core остаётся общим для CLI и loopback job; browser отвечает только за явно разрешённую запись в выбранную папку.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Прямой `index.html` больше не единственный режим для автоматического опроса | Браузерная file-page не может запускать Node, выполнять ping и надёжно читать Extron web API из-за process/CORS/TLS sandbox | Скачивание plan и ручной CLI прямо противоречат новому пользовательскому требованию |
| Обычные JSON в выбранной папке не шифруются самим приложением | Формат должен быть совместим с ручными JSON и загружаться тем же file-input; папка явно выбирается владельцем | DPAPI-файлы нельзя перенести на другой ПК и нельзя импортировать прямой file-page без отдельного runtime |
