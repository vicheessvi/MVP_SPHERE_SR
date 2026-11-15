# Tasks: Сбор логов Polycom Group

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/system-log-export.md`.

## Phase 1: Setup

- [x] T001 Verify clean starting worktree, `.gitignore`, existing log plan and no `.specify/extensions.yml` hooks using `AGENTS.md`, `mvp_runtime/polling.py`, `app.js`.
- [x] T002 Record non-secret Group 310 bundle/HTTP/archive evidence and official menu source in `specs/056-polycom-group-log-collection/research.md`.

## Phase 2: Foundational format handoff

- [x] T003 Add failing `.tgz` filename/format ACK tests in `python_tests/test_polling_job.py` and loopback MIME tests in `python_tests/test_server.py`.
- [x] T004 Implement exact `.tgz` metadata allowlist and gzip MIME in `mvp_runtime/polling_job.py` and `mvp_runtime/server.py`, preserving `.xml` behavior.
- [x] T005 Add failing browser save tests for `.tgz` name/MIME and existing XML in `tests.js`.
- [x] T006 Implement explicit format-aware streaming save in `app.js` without archive contents in state.

## Phase 3: User Story 1 — Group 310 export (P1)

**Goal**: Save one original Group 310 system-log archive from a guarded read-only session.
**Independent Test**: A synthetic exact Group 310 export reaches `on_log` as bounded `<IP>.tgz`; drift, HTML and failure do not save it.

- [x] T007 [US1] Add failing Group 310 bundle/MIME/disposition/gzip/size and sink-error tests in `python_tests/test_polycom_group.py`.
- [x] T008 [US1] Implement bounded exact `GET /a_getsyslog.cgi` after identity and before logout in `mvp_runtime/adapters/polycom_group.py`.
- [x] T009 [US1] Verify a controlled read-only Group 310 full-stream export using an in-memory discard sink; no raw archive is saved in project.

## Phase 4: User Story 2 — четыре exact модели (P2)

**Goal**: The same guarded export works conditionally on Group 300/310/500/700 with separate status.
**Independent Test**: Compatible model/bundle synthetic fixtures export; mismatch or old Group 300 transport failure never sends log request or HTTP credentials.

- [x] T010 [US2] Add model/bundle drift and no-HTTP-fallback tests in `python_tests/test_polycom_group.py` and `python_tests/test_polling.py`.
- [x] T011 [US2] Add four exact transports/keys to log allowlists in `mvp_runtime/polling.py`; keep Group 300/500/700 log status provisional.

## Phase 5: User Story 3 — metadata-only import (P2)

**Goal**: An imported original Polycom `.tgz` has exact SR context and no event parser.
**Independent Test**: Proper archive matches one exact device; wrong magic/IP/model is excluded and raw members are never opened.

- [x] T012 [US3] Add failing `.tgz` classification, exact model/IP and no-Huawei-parser tests in `tests.js`.
- [x] T013 [US3] Extend `app.js` metadata classification/import for exact Polycom Group `.tgz`, no archive extraction.

## Phase 6: Polish and validation

- [x] T014 [P] Update `product-catalog.js`, `AGENTS.md`, `docs/context-map.md`, `docs/implementation-log.md`, `docs/decisions/ADR-0059-polycom-group-log-collection.md`.
- [x] T015 Run Python/JS/reference/syntax/compile and sensitive-file checks; remove temporary probes under `scripts/`.

## Dependencies & execution order

- T001–T002 establish evidence. T003/T005 fail before T004/T006; the format handoff blocks US1.
- T007 fails before T008. T009 verifies the Group 310 adapter without saving a private archive.
- US2 follows the Group 310 contract; T010 precedes T011. US3 follows stable `.tgz` metadata; T012 precedes T013.
- T014 may be drafted after evidence stabilizes; T015 concludes the feature.

## Implementation strategy

MVP: Group 310 guarded archive export into the existing independent log workflow. Then conditionally route the same export to other exact Group models and expose metadata-only manual import. No Polycom reboot/power event classification in this feature.
