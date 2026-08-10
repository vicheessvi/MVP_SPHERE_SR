# Quickstart: Проверка переносимого запуска и синхронизации Справочника

## Automated

```powershell
node --check product-catalog.js
node --check app.js
node --check scripts\validate-reference.js
node scripts\validate-reference.js
node tests.js
node runtime-tests.js
node server-tests.js
```

Parse launch scripts with Windows PowerShell 5.1. Verify `portable-runtime.json` schema, exact URLs/hashes, `.runtime/` ignore coverage and absence of upload code in `scripts/ensure-node.ps1`.

Expected: all prior suites plus portable manifest/catalog projection/negative consistency cases pass.

## Fresh-PC acceptance

1. Use a temporary clean copy on Windows x64 or ARM64 with `node` hidden from PATH.
2. Run `powershell.exe -ExecutionPolicy Bypass -File .\start.ps1`.
3. Confirm an official exact-version artifact is downloaded to `.runtime/`, verified and started without elevation.
4. Stop with `Ctrl+C`, disconnect network and launch again.
5. Confirm the verified local runtime is used and no network attempt occurs.
6. Tamper with a copied cached ZIP and confirm hash mismatch stops before extraction/execution.
7. Confirm `%LOCALAPPDATA%\MVP_SPHERE_SR` is a new encrypted store for the current Windows profile.

Do not use operational SR, credentials or device IPs. A pre-existing system Node may be used for regular tests; the large official artifact does not need to be committed.

## Catalog acceptance

1. In an in-memory test catalog add one synthetic module descriptor.
2. Confirm navigation and Reference projections both gain exactly one matching item.
3. Rename its title and confirm both projections change.
4. Remove it and confirm both projections remove it.
5. Create duplicate route/helpId, empty title and unknown renderer variants; each MUST fail validation.
6. Open the real app and verify seven modules, ten Reference sections, context help and Russian status labels.

## Security checks

- `scripts/ensure-node.ps1` imports no application/runtime/vault module and makes no POST/PUT request.
- `.runtime/`, partial downloads, archives and installation markers are ignored by Git.
- Secret signature and runtime artifact scan passes.
- Raw SR `Video Conference` and raw polling JSON fields remain unchanged.

Commit, push and deploy require a separate explicit user instruction.

## Результат проверки 2026-08-10

- Node.js v24.19.0 x64 загружен с официального узла, SHA-256 проверен до распаковки и выполнения.
- Повторное разрешение переносимого runtime прошло из локального кэша без сети за 355 мс.
- Намеренно изменённый ZIP отклонён по несовпадению SHA-256 до распаковки и запуска.
- Каталог: 7 модулей, 7 автоматически сформированных карточек модулей и 8 карточек статусов.
- Автоматические проверки: 101/101 regression/contract/performance, 12/12 runtime/bootstrap, 1/1 server integration.
- PowerShell 5.1 разобрал `start.ps1` и `scripts/ensure-node.ps1` без ошибок; UTF-8 BOM сохранён.
- Браузерная приёмка подтвердила 7 пунктов навигации, 10 разделов и 68 карточек Справочника, контекстную справку и отсутствие горизонтального переполнения.
- Временный `.runtime/` после приёмки удалён; коммит, push и deploy не выполнялись.
