# Tasks: Переносимый запуск и синхронизация Справочника

**Input**: `specs/006-portable-reference-sync/`

## Phase 1: Setup

- [x] T001 Verify startup, public-file, catalog, test and ignore boundaries in `start.ps1`, `server.js`, `index.html`, `app.js`, `runtime-tests.js`, `.gitignore`
- [x] T002 Record exact portable runtime and product catalog contracts in `specs/006-portable-reference-sync/contracts/portable-runtime.md` and `specs/006-portable-reference-sync/contracts/product-catalog.md`

## Phase 2: Foundational

- [x] T003 Add pinned x64/ARM64 LTS artifact manifest in `portable-runtime.json`
- [x] T004 Add immutable UMD module/presentation catalog and pure projections in `product-catalog.js`
- [x] T005 Add catalog consistency CLI in `scripts/validate-reference.js`
- [x] T006 Add manifest/catalog negative contract tests in `runtime-tests.js` and `tests.js`

## Phase 3: User Story 1 — Первый запуск на новом ПК (P1)

**Independent test**: A clean Windows copy without compatible Node resolves a pinned verified portable runtime; cached/system resolution performs no download; tampering fails before execution.

- [x] T007 [US1] Implement architecture normalization, candidate resolution and safe manifest validation in `scripts/ensure-node.ps1`
- [x] T008 [US1] Implement cache/download, SHA-256 verification, staging extraction and atomic install in `scripts/ensure-node.ps1`
- [x] T009 [US1] Integrate portable resolver and Node 24 requirement while preserving UTF-8 BOM in `start.ps1`
- [x] T010 [US1] Ignore portable runtime, partial and staging artifacts in `.gitignore`
- [x] T011 [US1] Add offline/resolve-only/bootstrap boundary tests in `runtime-tests.js`

## Phase 4: User Story 2 — Справочник следует за проектом (P1)

**Independent test**: Adding, renaming and removing a synthetic module changes navigation/reference projections together; orphan, duplicate and missing Russian metadata variants fail validation.

- [x] T012 [US2] Load and serve `product-catalog.js` from the authenticated loopback origin in `index.html` and `server.js`
- [x] T013 [US2] Replace duplicated presentation dictionary and module help source with catalog projections in `app.js`
- [x] T014 [US2] Generate primary navigation, contextual topic map and inventory route metadata from module descriptors in `app.js`
- [x] T015 [US2] Generate status Reference cards from presentation/status descriptors in `app.js`
- [x] T016 [US2] Add add/rename/remove and negative consistency regression tests in `tests.js`
- [x] T017 [US2] Update navigation source-boundary test to use catalog validation in `runtime-tests.js`

## Phase 5: User Story 3 — Объяснимая и безопасная подготовка (P2)

**Independent test**: Unsupported architecture, offline source, hash mismatch, invalid archive and concurrent setup produce distinct safe Russian failures without starting the server.

- [x] T018 [US3] Add safe Russian bootstrap progress/errors and offline-cache guidance in `scripts/ensure-node.ps1`
- [x] T019 [US3] Add Windows GitHub code-only quality gate in `.github/workflows/quality.yml`
- [x] T020 [US3] Add bootstrap security/static boundary assertions in `runtime-tests.js`

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T021 Update portability/reference automation in `README.md`, `docs/architecture.md`, `docs/project-vision.md`, `docs/context-map.md`, `AGENTS.md`
- [x] T022 Record the security decision and implementation result in `docs/decisions/ADR-0006-portable-runtime-reference-catalog.md` and `docs/implementation-log.md`
- [x] T023 Run syntax, catalog, regression, DPAPI/runtime, server, PowerShell parser, secret/artifact and Git diff checks from `specs/006-portable-reference-sync/quickstart.md`
- [x] T024 Run local browser acceptance for derived navigation/Reference and record results in `specs/006-portable-reference-sync/quickstart.md`
- [x] T025 Mark all completed tasks in `specs/006-portable-reference-sync/tasks.md` and confirm no commit, push or deploy occurred

## Dependencies

Setup → Foundational → US1 and US2 → US3 → Polish. US1 and US2 are independently testable after Foundational. GitHub quality gate depends on both executable test paths.

## Parallel Opportunities

- Portable manifest/bootstrap work and product catalog/UI work affect separate files after contracts stabilize.
- Documentation and ADR can proceed after the security/catalog decisions are final.
- Browser acceptance follows local suites but does not depend on GitHub publication.

## Implementation Strategy

First make the startup artifact deterministic and fail-closed. Then establish the catalog as the sole source for module and status projections, update the UI consumers, and add negative consistency tests. Finish with Windows CI, documentation and local acceptance. Do not add data portability, vendor protocols or external telemetry.
