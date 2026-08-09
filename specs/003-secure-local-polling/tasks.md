# Tasks: Secure local polling runtime

**Input**: `specs/003-secure-local-polling/`

## Phase 1: Setup

- [x] T001 Update `.gitignore` for runtime data, vaults, keys and temporary polling outputs
- [x] T002 Create local runtime entrypoints in `server.js` and `start.ps1`

## Phase 2: Foundational

- [x] T003 Add failing secure envelope/DPAPI/store tests in `runtime-tests.js`
- [x] T004 Implement AES-GCM and DPAPI CurrentUser key protection in `runtime/security.js`
- [x] T005 Implement atomic encrypted disk storage in `runtime/secure-store.js`
- [x] T006 Implement loopback session, CSRF, Origin and security-header boundary in `server.js`

## Phase 3: User Story 1 - Protected local operation

- [x] T007 [US1] Add secure HTTP storage adapter and remove artificial quotas in `app.js`
- [x] T008 [US1] Serve existing UI and encrypted state through `server.js`
- [x] T009 [US1] Validate >4 MiB encrypted round-trip and no plaintext persistence in `runtime-tests.js`

## Phase 4: User Story 2 - Single role and target UI

- [x] T010 [US2] Add v3 single-role migration tests and removed-route assertions in `tests.js`
- [x] T011 [US2] Implement state v3 with only Administrator МЦТП in `app.js`
- [x] T012 [US2] Remove legacy audit routes/navigation and storage quota UI in `app.js`

## Phase 5: User Story 3 - Credential vault

- [x] T013 [US3] Add JSON/CSV, duplicate, redaction and atomicity tests in `runtime-tests.js`
- [x] T014 [US3] Implement credential parsing and encrypted vault in `runtime/credential-vault.js`
- [x] T015 [US3] Implement write-only credential API in `server.js`
- [x] T016 [US3] Add credential upload and summary UI in `app.js`

## Phase 6: User Story 4 - Polling scripts

- [x] T017 [US4] Add catalog/routing/ping/fail-closed tests in `runtime-tests.js`
- [x] T018 [US4] Encode supplied manufacturer/model catalog in `runtime/model-catalog.js`
- [x] T019 [US4] Implement unicast validation, bounded ping and fail-closed adapters in `runtime/polling.js`
- [x] T020 [US4] Implement safe polling CLI and per-IP JSON output in `scripts/poll-devices.js`

## Phase 7: Polish

- [x] T021 Update `README.md`, `AGENTS.md`, architecture, vision, ADR and implementation log
- [x] T022 Run syntax, legacy regression, secure-runtime tests and secret/artifact scans
- [x] T023 Record validation status in `specs/003-secure-local-polling/quickstart.md`

## Dependencies

Setup → Foundational → US1 → US2/US3 → US4 → Polish. Credential import and polling routing share only the secure runtime boundary; vendor transports remain blocked independently.

## Independent tests

- US1: encrypted >4 MiB state survives restart without plaintext.
- US2: only target navigation and Administrator МЦТП remain.
- US3: credential replacement is atomic and no read surface exposes secrets.
- US4: all supplied models route; ping works; undocumented protocols fail closed.

## Implementation strategy

Deliver the protected local runtime first, then UI simplification, vault and safe polling scaffolds. Do not add guessed vendor requests, commit, push or deploy.
