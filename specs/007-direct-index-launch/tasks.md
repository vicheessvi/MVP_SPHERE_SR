# Tasks: Прямой запуск index.html

**Input**: Design documents from `specs/007-direct-index-launch/`

## Phase 1: Setup

- [x] T001 Verify current file/server bootstrap, storage and notice boundaries in `index.html`, `app.js`, `server.js`, `styles.css`, `tests.js`, `runtime-tests.js`
- [x] T002 Record dual-mode and notice-removal contracts in `specs/007-direct-index-launch/contracts/launch-mode.md` and `specs/007-direct-index-launch/contracts/interface-notices.md`

## Phase 2: Foundational

- [x] T003 Add static file-mode marker in `runtime-config.js` and load it before application assets in `index.html`
- [x] T004 Add launch-mode validation and volatile synchronous storage adapter in `app.js`
- [x] T005 Add direct-launch and notice-removal contract assertions in `runtime-tests.js` and `tests.js`

## Phase 3: User Story 1 — Открытие без установки (P1)

**Independent Test**: `file://.../index.html` shows the dashboard and seven modules with no Node.js or network.

- [x] T006 [US1] Allow confirmed `file://` mode while retaining invalid HTTP blocking in `app.js`
- [x] T007 [US1] Route file-mode state through a fresh in-memory adapter on each page load in `app.js`
- [x] T008 [US1] Remove the obsolete static banner and styling from `index.html` and `styles.css`
- [x] T009 [US1] Add browser acceptance for dashboard/navigation and reload reset in `specs/007-direct-index-launch/quickstart.md`

## Phase 4: User Story 2 — Безопасная граница двух режимов (P1)

**Independent Test**: file mode makes no storage/credential API call and forgets imported data on reload; server mode retains all existing encrypted/vault tests.

- [x] T010 [US2] Gate credential summary, controls and import handler behind secure runtime before FileReader in `app.js`
- [x] T011 [US2] Render mode-accurate storage information and preserve secure settings behavior in `app.js`
- [x] T012 [US2] Extend server integration coverage for dynamic secure config while keeping the static file asset out of the secure response in `server-tests.js`
- [x] T013 [US2] Add fail-closed tests for invalid HTTP context, browser-storage avoidance and credential blocking in `runtime-tests.js`

## Phase 5: User Story 3 — Чистый интерфейс и актуальный Справочник (P2)

**Independent Test**: exact prohibited messages are absent, and Reference documentation describes both modes accurately.

- [x] T014 [US3] Remove `SECURITY_NOTICE`, login/topbar/security-strip messages and stale exports from `app.js`, `index.html`, `tests.js`
- [x] T015 [US3] Update dual-mode help content while preserving catalog-derived module/status sections in `app.js` and `product-catalog.js`
- [x] T016 [US3] Add regression assertions for exact prohibited texts and mode-specific Reference content in `tests.js` and `runtime-tests.js`

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T017 Update launch/security guidance in `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/context-map.md`, `docs/project-vision.md`
- [x] T018 Record ADR and implementation result in `docs/decisions/ADR-0007-direct-index-session-mode.md` and `docs/implementation-log.md`
- [x] T019 Run syntax, catalog, regression, runtime, server, secret/artifact and diff checks from `specs/007-direct-index-launch/quickstart.md`
- [ ] T020 Run browser direct-open acceptance and mark all tasks complete in `specs/007-direct-index-launch/tasks.md`

**T020 status**: автоматический переход на `file://` заблокирован политикой browser-control; требуется ручное открытие пользователем. Статические и runtime-контракты прямого запуска прошли.

## Dependencies

Setup → Foundational → US1 → US2 → US3 → Polish. US1 and US2 share the launch-mode adapter, so they execute sequentially in this single-file implementation.

## Parallel Opportunities

- Documentation/ADR work can proceed after the launch contract stabilizes.
- Server regression and pure UI message tests affect separate files after `app.js` behavior is complete.

## Implementation Strategy

First establish a confirmed file marker and volatile adapter. Then open the file path, gate all secret operations, remove global notices, update Reference/documentation and finish with both file and secure acceptance. Do not add localStorage persistence or browser credential storage.
