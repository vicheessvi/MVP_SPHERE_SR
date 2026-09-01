# Tasks: Локальный веб-опрос Extron

**Input**: Design artifacts from `specs/011-extron-web-polling/`

## Phase 1 — Contract and regression evidence

- [x] T001 Зафиксировать spec/checklist/plan/research/data model/contracts/quickstart в `specs/011-extron-web-polling/`.
- [x] T002 [P] [US1] Добавить synthetic contract tests dynamic URI, cookie session, exact resource URL и unsupported bundle в `runtime-tests.js`.
- [x] T003 [P] [US2] Добавить security tests redaction, credential-by-IP и явного insecure TLS в `runtime-tests.js`.
- [x] T004 [P] [US3] Добавить output-folder/atomic-write/partial-batch tests и manual import regression в `runtime-tests.js`, `tests.js`.

## Phase 2 — Generic Extron adapter (US1)

- [x] T005 [US1] Реализовать безопасный HTTPS transport и in-memory cookie session в `runtime/extron-web-poller.js`.
- [x] T006 [US1] Реализовать allowlisted dynamic resource discovery из `/www/main.js` в `runtime/extron-web-poller.js`.
- [x] T007 [US1] Реализовать exact resource polling, schema guards и legacy-compatible `webBlocks` в `runtime/extron-web-poller.js`.
- [x] T008 [US1] Пометить contract-based Extron controller/panel manifests и generic adapter dispatch в `runtime/model-catalog.js`, `runtime/polling.js`.

## Phase 3 — Credentials and local CLI (US2, US3)

- [x] T009 [US2] Интегрировать lookup и импорт Excel/JSON/CSV в существующий DPAPI `CredentialVault` через `scripts/poll-devices.js` без выполнения формул и вывода secrets.
- [x] T010 [US3] Реализовать default `%LOCALAPPDATA%` capture folder, explicit output и атомарные per-IP JSON в `scripts/poll-devices.js`.
- [x] T011 [US3] Добавить удобный Windows launcher `poll-extron.ps1` через существующий Node bootstrap.
- [x] T012 [US3] Добавить runtime output patterns в `.gitignore` и сохранить существующую ручную file/folder загрузку.

## Phase 4 — Reference and documentation (US4)

- [x] T013 [US4] Обновить polling/upload справку через `product-catalog.js` и выполнить `scripts/validate-reference.js`.
- [x] T014 [US4] Добавить `docs/decisions/ADR-0011-extron-web-polling.md`, обновить `docs/architecture.md`, `README.md`, `docs/context-map.md`, `AGENTS.md`.
- [x] T015 [US4] Зафиксировать этап в `docs/implementation-log.md` без runtime данных и secrets.

## Phase 5 — Verification

- [x] T016 Выполнить `node --check` для изменённых JS и PowerShell parse check для launcher.
- [x] T017 Выполнить `node tests.js`, `node runtime-tests.js`, `node scripts/validate-reference.js` и релевантные server checks.
- [x] T018 Выполнить secret/artifact/external-request/persistence scan и `git diff --check`; не выполнять commit/push.

## Dependencies

- T002–T004 должны дать failing evidence до T005–T012.
- T005 → T006 → T007 → T008.
- T008 + T009 → T010 → T011.
- T012–T015 выполняются после стабилизации runtime contract.
- T016–T018 завершают feature.

## Parallel opportunities

- T002, T003, T004 затрагивают разные contract assertions, но в одном `runtime-tests.js` выполняются последовательно в текущем сеансе.
- Документационные T013–T015 независимы по файлам после утверждения итогового CLI contract.
