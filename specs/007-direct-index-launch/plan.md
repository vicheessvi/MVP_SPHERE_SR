# Implementation Plan: Прямой запуск index.html

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-direct-index-launch/spec.md`

## Summary

Вернуть прямой запуск статического интерфейса через `file://`, не нарушая обязательный запрет на хранение чувствительных данных и секретов в browser storage. Для файлового режима используется непостоянный адаптер памяти и отключённый credential import; существующий loopback runtime остаётся защищённым постоянным режимом. Из интерфейса удаляются три заданных уведомления, а Справочник и документация описывают оба режима.

## Technical Context

**Language/Version**: HTML5, CSS3, Vanilla JavaScript; Node.js 24 LTS только для тестов и защищённого runtime

**Primary Dependencies**: локальный `vendor/xlsx.full.min.js`, `product-catalog.js`; внешних runtime-зависимостей для `file://` нет

**Storage**: in-memory adapter в файловом режиме; AES-256-GCM + DPAPI CurrentUser через loopback API в защищённом режиме

**Testing**: dependency-free `tests.js`, `runtime-tests.js`, `server-tests.js`, статические контракты и браузерная приёмка `file://`

**Target Platform**: Windows 10/11, актуальный Chromium/Edge, x64/ARM64

**Project Type**: автономное browser UI с дополнительным защищённым локальным runtime

**Performance Goals**: главный экран ≤3 секунд, сохранение текущих Dashboard-проекций и тестовых лимитов

**Constraints**: offline `file://`; без browser persistence чувствительных данных; без credential import и сетевого polling в файловом режиме; без ослабления server runtime

**Scale/Scope**: 7 модулей; рабочий state текущей вкладки ограничен доступной памятью браузера; постоянный state — прежним дисковым хранилищем

## Constitution Check

### До исследования

- **I–V, evidence/identity/normalization/completeness/explainability**: PASS — правила данных и аналитики не меняются.
- **VI, локальная защита**: PASS при обязательной границе: файловый режим не сохраняет рабочие данные и не принимает секреты; защищённый runtime остаётся единственным постоянным режимом.
- **No external transfer/CDN/telemetry**: PASS — файловый режим загружает только относительные локальные assets.
- **Role boundary**: PASS — единственная роль остаётся «Администратор МЦТП».
- **Full SpecKit and documentation/tests**: PASS — feature 007 содержит spec, plan, tasks, contracts и acceptance.

### После проектирования

- Непостоянный adapter устраняет конфликт с запретом browser storage.
- Статический `runtime-config.js` лишь подтверждает `file://`; server продолжает отдавать динамический secure config с CSRF.
- Credential controls в file mode не создаются, обработчик имеет дополнительную fail-closed проверку.
- Известных необоснованных нарушений Constitution 2.0.0 нет.

## Project Structure

### Documentation (this feature)

```text
specs/007-direct-index-launch/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── launch-mode.md
│   └── interface-notices.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
index.html              # direct file entry and local script order
runtime-config.js       # static file-mode marker; server path remains dynamic
app.js                  # mode selection, memory/server adapters and UI
styles.css              # remove obsolete banner styling
product-catalog.js      # module/reference source
server.js               # existing protected runtime boundary
tests.js                # functional regression and catalog tests
runtime-tests.js        # launch-mode and secret-boundary contracts
server-tests.js         # protected mode regression
README.md
AGENTS.md
docs/
```

**Structure Decision**: Существующий корневой dependency-free UI сохраняется. Новый статический marker добавляется рядом с `index.html`; отдельные сборка, package manager и backend для файлового режима не создаются.

## Complexity Tracking

Нарушений, требующих исключения, нет. Два режима необходимы, потому что браузер `file://` не предоставляет DPAPI, а перенос секретов в browser storage запрещён конституцией.
