# Tasks: Python runtime migration

**Input**: Design documents from `specs/014-python-runtime-migration/`

**Tests**: Contract, security and parity tests are mandatory because this migration replaces the trusted polling boundary while preserving observable behavior.

## Phase 1: Setup

**Purpose**: Establish the Python project layout and shared catalog source.

- [X] T001 Add Python cache, coverage and local runtime artifacts to `.gitignore`
- [X] T002 Create the standard-library package skeleton in `mvp_runtime/__init__.py` and `mvp_runtime/adapters/__init__.py`
- [X] T003 Extract the runtime manufacturer/model/protocol declarations into shared `runtime/device-catalog.json` and adapt the migration oracle in `runtime/model-catalog.js`

---

## Phase 2: Foundational

**Purpose**: Implement shared validation, catalog, XLSX and redaction primitives before any server or device network work.

- [X] T004 [P] Add catalog resolution tests in `python_tests/test_catalog.py`
- [X] T005 [P] Add bounded XLSX credential parsing and rejection tests in `python_tests/test_credentials.py`
- [X] T006 [P] Add recursive plan-secret and result-redaction tests in `python_tests/test_redaction.py`
- [X] T007 Implement shared JSON catalog resolution in `mvp_runtime/catalog.py`
- [X] T008 Implement bounded first-sheet XLSX parsing with no formula execution in `mvp_runtime/credentials.py`
- [X] T009 Implement recursive plan-secret rejection and result sanitization in `mvp_runtime/redaction.py`

**Checkpoint**: Catalog, credential and redaction tests pass without network access or third-party Python packages.

---

## Phase 3: User Story 1 — Запуск установленным Python без команд (Priority: P1)

**Goal**: Double-click the Python entrypoint from any project path and open a hardened one-time loopback session.

**Independent Test**: Start from normal, spaced and Cyrillic paths with Python 3.11+ and no Node process; confirm browser/session/static resources and safe failures.

- [X] T010 [P] [US1] Add launcher/version/resource validation tests in `python_tests/test_launcher.py`
- [X] T011 [P] [US1] Add loopback Host/session/CSRF/static allowlist tests in `python_tests/test_server.py`
- [X] T012 [US1] Implement version/resource checks and browser launch in `mvp_runtime/launcher.py`
- [X] T013 [US1] Implement the hardened loopback session/static server foundation in `mvp_runtime/server.py`
- [X] T014 [US1] Add the double-click production entrypoint in `START_MVP_SPHERE_SR.py`

**Checkpoint**: A Python-only local session opens without CMD, PowerShell, Node.js, `pip` or persistent runtime storage.

---

## Phase 4: User Story 2 — Совместимый автоматический опрос (Priority: P1)

**Goal**: Preserve plan v2, Extron HTTPS, progress, cancellation, result ACK and safe JSON through the Python runtime.

**Independent Test**: Run the synthetic Extron contract and full credential → plan → pending result → ACK workflow through the Python HTTP API.

- [X] T015 [P] [US2] Port Extron discovery/projection/TLS contract tests into `python_tests/test_extron.py`
- [X] T016 [P] [US2] Add exact-IP allowlist, ping, ordering, interval and cancellation tests in `python_tests/test_polling.py`
- [X] T017 [P] [US2] Add scheduled/job/ACK/NACK/terminal credential-clear tests in `python_tests/test_polling_job.py`
- [X] T018 [US2] Implement the HTTPS-only dynamic-resource adapter in `mvp_runtime/adapters/extron.py`
- [X] T019 [US2] Implement exact-IP sequential polling and adapter dispatch in `mvp_runtime/polling.py`
- [X] T020 [US2] Implement the synchronized job lifecycle and pending-result ACK in `mvp_runtime/polling_job.py`
- [X] T021 [US2] Add credential/job/status/result/ACK/cancel API integration scenarios to `python_tests/test_server.py`
- [X] T022 [US2] Implement credential and polling API routes with terminal cleanup in `mvp_runtime/server.py`

**Checkpoint**: Python API and JSON shapes are semantically compatible with feature 013 and no secret survives a terminal path.

---

## Phase 5: User Story 3 — Сохранение ручного режима и аналитики (Priority: P2)

**Goal**: Keep `file://index.html` fully functional while making Python the only automatic-mode instruction.

**Independent Test**: Run direct-file SR/folder import and analytics with no Python runtime, then run the same interface through Python automatic mode.

- [X] T023 [P] [US3] Update startup/manual-mode frontend assertions in `tests.js`
- [X] T024 [US3] Replace user-facing Node/CMD/PowerShell startup text with `START_MVP_SPHERE_SR.py` in `app.js` and `product-catalog.js`
- [X] T025 [US3] Verify direct-file manual import and loopback marker behavior through existing `tests.js` and Python server tests

**Checkpoint**: Direct HTML remains manual-only and Python launch exposes automatic polling without route or analytics regressions.

---

## Phase 6: User Story 4 — Развитие и проверяемость runtime (Priority: P2)

**Goal**: Make confirmed future protocols additive through shared manifests and isolated Python adapters.

**Independent Test**: Register a synthetic manifest/adapter in tests without editing the job lifecycle or browser API.

- [X] T026 [P] [US4] Add adapter registration and unsupported/protocol-required extension tests in `python_tests/test_polling.py`
- [X] T027 [US4] Expose a documented adapter registry boundary in `mvp_runtime/polling.py` and `mvp_runtime/catalog.py`
- [X] T028 [US4] Document the Python adapter evidence contract in `docs/development-workflow.md` and `specs/014-python-runtime-migration/contracts/python-loopback-compatibility.md`

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Remove obsolete production paths, synchronize project governance/reference and validate the complete migration.

- [X] T029 Remove obsolete production launch/runtime files `START_MVP_SPHERE_SR.cmd`, `start.ps1`, `poll-extron.ps1`, `portable-runtime.json`, `server.js`, `server-tests.js`, `runtime-tests.js`, `runtime/polling-job.js`, `runtime/polling.js`, `runtime/extron-web-poller.js`, `runtime/security.js`, `runtime/secure-store.js`, `runtime/credential-vault.js`, `scripts/ensure-node.ps1` and `scripts/poll-devices.js` after parity tests pass
- [X] T030 [P] Add ADR-0014 and update `AGENTS.md`, `README.md`, `.specify/memory/constitution.md`, `docs/architecture.md`, `docs/context-map.md` and `docs/implementation-log.md`
- [X] T031 [P] Update catalog/reference checks in `scripts/validate-reference.js` and relevant frontend assertions for the Python launch/help text
- [X] T032 Run Python unit/integration tests, frontend regression, reference validation and JavaScript/Python syntax checks
- [X] T033 Run 100-device ordering/ACK performance acceptance, path portability checks, secret/artifact/IP scan and `git diff --check`

---

## Dependencies & Execution Order

- Phase 1 precedes every implementation phase.
- Phase 2 blocks the server and polling stories.
- User Story 1 provides the server/session foundation required by User Story 2.
- User Story 2 must reach parity before the Node production runtime is removed.
- User Story 3 can begin after the session marker contract is stable.
- User Story 4 depends on catalog and polling registry foundations but is otherwise independent of UI work.
- Phase 7 is last; T029 is explicitly gated on all Python parity tests.

## Parallel Opportunities

- T004–T006 cover separate foundational files.
- T010 and T011 cover launcher versus server contracts.
- T015–T017 cover adapter, polling and job behavior independently before implementation.
- T023 can proceed while Python polling internals are implemented.
- T030 and T031 touch different documentation/reference zones after production behavior is stable.

## Implementation Strategy

1. Build safe pure functions and their tests.
2. Deliver a Python-only launch/session slice.
3. Port Extron and job behavior behind the unchanged browser API.
4. Prove direct-file and automatic-mode parity.
5. Add extension contract, remove the dual runtime and complete security/performance gates.

## Format Validation

All tasks use the required checkbox, sequential ID, optional `[P]`, story label for story phases and explicit file path format.
