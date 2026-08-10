# Implementation Plan: Переносимый запуск и синхронизация Справочника

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Summary

Добавить fail-closed bootstrap для закреплённого официального Node.js 24 LTS на Windows x64/ARM64 без системной установки и повышения прав. Архив загружается только при отсутствии совместимой среды, проверяется по закреплённой SHA-256 и атомарно распаковывается в `.runtime/`, исключённый из Git. Одновременно вынести модули, русские статусы и подсказки в общий browser/CommonJS-каталог; навигация и соответствующие разделы Справочника строятся из него, а локальная/CI-проверка блокирует рассинхронизацию.

## Technical Context

**Language/Version**: Windows PowerShell 5.1+, Vanilla JavaScript ES2022, Node.js 24 LTS

**Primary Dependencies**: встроенные PowerShell/.NET и Node.js API; существующий vendored SheetJS; новых npm-пакетов нет

**Storage**: существующий encrypted state v3 и credential vault; portable runtime в `.runtime/` не содержит пользовательских данных

**Testing**: `tests.js`, `runtime-tests.js`, `server-tests.js`, `scripts/validate-reference.js`, PowerShell parser/bootstrap contract tests, GitHub Actions на Windows

**Target Platform**: Windows 10/11 x64 и ARM64, PowerShell 5.1+

**Project Type**: однопользовательское локальное web-приложение с loopback runtime

**Performance Goals**: повторный запуск без сети ≤15 секунд; первичная подготовка ≤5 минут при доступном официальном источнике; построение каталога/Справочника <100 мс

**Constraints**: zero upload; bootstrap выполняет только HTTPS GET до обработки рабочих данных; pinned version/hash; no elevation, PATH mutation, CDN, telemetry, package manager or data migration; raw SR/JSON unchanged

**Scale/Scope**: 7 модулей, 10 разделов Справочника, десятки presentation mappings, две Windows-архитектуры

## Constitution Check

*Pre-design gate: PASS. Post-design gate: PASS.*

- I Raw evidence: PASS — bootstrap и каталог не изменяют SR/JSON, snapshots или provenance.
- II Identity: PASS — идентичность устройств и stable IDs не затрагиваются; route/help IDs остаются стабильными.
- III Determinism: PASS — pinned manifest и чистые catalog projections дают одинаковый результат для одинаковой версии.
- IV Incomplete data: PASS — неизвестный status остаётся «Данные отсутствуют», а missing metadata блокирует validation.
- V Explainability: PASS — отказ bootstrap сообщает этап и безопасное действие; catalog report указывает ID ошибки.
- VI Local security: PASS — DPAPI/AES/vault/loopback не меняются; внешний GET ограничен официальным runtime до чтения данных; upload отсутствует.
- Workflow: PASS — отдельные spec, plan, research, data model, contracts, tasks, tests and docs.

## Project Structure

### Documentation (this feature)

```text
specs/006-portable-reference-sync/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── portable-runtime.md
│   └── product-catalog.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
portable-runtime.json             # pinned official artifacts and SHA-256
start.ps1                         # resolves/bootstrap runtime then starts server
scripts/ensure-node.ps1           # fail-closed download, hash verification, atomic extract
scripts/validate-reference.js     # catalog/route/help consistency gate
product-catalog.js                # UMD source of modules, terms and generated help projections
app.js                            # consumes catalog; no duplicate module navigation/reference data
index.html                        # loads catalog before app
server.js                         # serves catalog from authenticated loopback origin
tests.js                          # catalog projection and regression tests
runtime-tests.js                  # portable manifest/startup and source-boundary tests
.github/workflows/quality.yml     # Windows code-only quality gate
```

**Structure Decision**: Keep the dependency-free single-page architecture. Use one UMD catalog that runs unchanged in the browser and CommonJS tests. Keep bootstrap separate from `server.js`, so external download code cannot access runtime state or credential modules.

## Security Design

1. `start.ps1` invokes `scripts/ensure-node.ps1` before `server.js` exists in memory.
2. Resolver prefers a verified cached portable runtime, then a compatible trusted system/Codex runtime.
3. If absent, architecture is checked against the manifest before any network call.
4. Existing cached archive or HTTPS download is hashed and compared with the pinned manifest.
5. Extraction occurs under a unique staging directory; only a fully checked runtime is moved to its final path.
6. `.runtime/` is ignored by Git. No bootstrap code imports storage, vault, SR or polling modules.
7. Runtime security boundary remains ADR-0005.

## Reference Synchronization Design

```text
PRODUCT_CATALOG
├── MODULE_CATALOG ──> navigation
│                  └─> Reference / modules
├── UI_TERMS ────────> UI formatters
│                  └─> Reference / statuses
└── tooltip descriptors ─> KPI titles + Reference metrics

validateProductCatalog()
└── IDs, Russian labels, renderer keys, help links, required status codes
```

Narrative explanations remain explicit because their meaning cannot be inferred safely. They reference stable catalog IDs and are covered by consistency tests.

## Complexity Tracking

No constitution violations. The only new external request downloads a public executable before any sensitive data is read; it is isolated, pinned and hash-verified. Portable user-data migration is intentionally excluded.
