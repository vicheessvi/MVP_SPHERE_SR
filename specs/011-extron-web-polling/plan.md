# Implementation Plan: Локальный веб-опрос Extron

**Branch**: `011-extron-web-polling` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

**Input**: Подтверждённый на реальном IPCP Pro web workflow и требование распространить contract-based алгоритм на контроллеры и панели Extron.

## Summary

Добавить независимый от модели Extron HTTPS adapter, который после login извлекает session-bound URI из текущего `/www/main.js`, опрашивает подтверждённые ресурсы в той же cookie session и выдаёт legacy-compatible JSON. Adapter вызывается существующим Node polling orchestrator только для явно разрешённых Extron controller/panel IP; credentials поступают из DPAPI vault. CLI сохраняет результаты атомарно вне Git в `%LOCALAPPDATA%\MVP_SPHERE_SR\poll-results\<capture-time>`, после чего пользователь вручную загружает общую папку в остающийся единственным UI runtime `file://index.html`. Существующая ручная загрузка папок с готовыми JSON сохраняется.

## Technical Context

**Language/Version**: Vanilla JavaScript; Node.js CommonJS runtime из локальной/bundled установки

**Primary Dependencies**: Только встроенные `https`, `fs`, `path`, `os`, `crypto`; существующие `SecureStore`/`CredentialVault`

**Storage**: Windows DPAPI vault для scoped credentials; локальные JSON-файлы результатов вне репозитория; UI state только в памяти страницы

**Testing**: `node --check`, `node tests.js`, `node runtime-tests.js`, `node scripts/validate-reference.js`, synthetic injected transport tests

**Target Platform**: Windows; локальная сеть оборудования; self-signed HTTPS только по явному разрешению

**Project Type**: Статический direct-file web UI + отдельный локальный CLI polling runtime

**Performance Goals**: Последовательный безопасный batch; один результат на каждый plan item; bounded request timeout; без удержания credentials после device poll

**Constraints**: Нет CDN/telemetry/external transfer; нет browser polling/credentials/persistence; только allowlisted IPv4; неизвестный vendor contract fail-closed; реальные runtime data не входят в Git/tests

**Scale/Scope**: Все модели Extron controller/panel с подтверждённым web contract; неизвестные поколения маркируются как unsupported без догадок

## Constitution Check

*GATE: пройден до research и повторно после design.*

- Локальность и конфиденциальность: PASS — network targets только из plan, output локальный, browser network не добавляется.
- Secrets: PASS — DPAPI vault, in-memory cookie, redacted errors, synthetic fixtures.
- Подтверждённые vendor contracts: PASS — динамическая introspection bundle, fail-closed при неизвестной схеме.
- Единственный UI runtime: PASS — `file://index.html` остаётся единственным режимом, polling выполняет отдельный Node CLI.
- Ручная загрузка: PASS — существующие file/folder inputs не удаляются и остаются основным import boundary.
- Справочник через catalog: PASS — пользовательские инструкции обновляются в `product-catalog.js`, затем validator.
- Документация/тесты: PASS — ADR, architecture, log, synthetic contract/security tests.

## Project Structure

### Documentation (this feature)

```text
specs/011-extron-web-polling/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli-and-storage.md
│   └── extron-adapter.md
└── tasks.md
```

### Source Code (repository root)

```text
runtime/
├── credential-vault.js
├── secure-store.js
├── model-catalog.js
├── extron-web-poller.js       # new generic adapter
└── polling.js                 # allowlist dispatch/orchestration
scripts/
├── poll-devices.js            # CLI, vault import, output folders
├── ensure-node.ps1
└── validate-reference.js
poll-extron.ps1                # Windows entry point
product-catalog.js             # Help/reference source
runtime-tests.js               # synthetic runtime tests
tests.js                       # browser/manual import regressions
docs/
├── architecture.md
├── implementation-log.md
└── decisions/ADR-0011-extron-web-polling.md
```

**Structure Decision**: Использовать существующий runtime слой и CLI, не добавляя server mode или package dependencies. Vendor adapter изолируется в отдельном модуле и получает injectable transport для синтетических тестов.

## Complexity Tracking

Нарушений constitution нет.
