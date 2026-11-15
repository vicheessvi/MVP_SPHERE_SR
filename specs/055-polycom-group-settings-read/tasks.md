# Tasks: Новые настройки Polycom Group

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/read-only-settings.md`.

## Phase 1: Setup

- [x] T001 Verify clean worktree, `.gitignore`, existing exact model routing and no hook files in `AGENTS.md`, `runtime/device-catalog.json`, `.specify/extensions.yml`.
- [x] T002 Record only non-secret Group 310 bundle/resource evidence and per-field validation boundary in `specs/055-polycom-group-settings-read/research.md` and `contracts/read-only-settings.md`.

## Phase 2: Foundational

- [x] T003 Add failing tests for narrow one-name config reads, neighbor rejection and secure values in `python_tests/test_polycom_group.py`.
- [x] T004 Implement allowlisted one-name read helper for post-identity use in `mvp_runtime/adapters/polycom_group.py`; no broad config, write, or secret output.

## Phase 3: User Story 1 — факты Group 310 (P1)

**Goal**: Nine setting groups with explicit status and independently validated values.
**Independent Test**: Read-only Group 310 values match the corresponding web-menu fields; one failed field does not erase others.

- [x] T005 [US1] Add Telnet read/negative tests in `python_tests/test_polycom_group.py` before implementation.
- [x] T006 [US1] Add exact Telnet read in `mvp_runtime/adapters/polycom_group.py` after menu confirmation.
- [x] T007 [US1] Add HTTPS-only/HTTP semantics tests in `python_tests/test_polycom_group.py` before implementation.
- [x] T008 [US1] Add exact HTTP setting read in `mvp_runtime/adapters/polycom_group.py` without TCP-port claim.
- [x] T009 [US1] Add SNMP service/version pair tests in `python_tests/test_polycom_group.py` before implementation.
- [x] T010 [US1] Add exact SNMPv2 read in `mvp_runtime/adapters/polycom_group.py`; preserve both booleans pending menu validation.
- [x] T011 [US1] Add automatic-update read tests in `python_tests/test_polycom_group.py` before implementation.
- [x] T012 [US1] Add exact auto-update read in `mvp_runtime/adapters/polycom_group.py`.
- [x] T013 [US1] Add separate P2P/multipoint answer tests in `python_tests/test_polycom_group.py` before implementation.
- [x] T014 [US1] Add exact auto-answer reads in `mvp_runtime/adapters/polycom_group.py` without merging differing modes.
- [x] T015 [US1] Add NTP mode/primary/secondary, malformed and redaction tests in `python_tests/test_polycom_group.py` before implementation.
- [x] T016 [US1] Add exact NTP reads and confirmed instance-1 secondary address in `mvp_runtime/adapters/polycom_group.py`.
- [x] T017 [US1] Assert Wi-Fi `not_exposed` and no wireless config read in `python_tests/test_polycom_group.py` and preserve adapter behavior.
- [x] T018 [US1] Add SSH field/menu mismatch tests in `python_tests/test_polycom_group.py` before implementation.
- [x] T019 [US1] Add only confirmed SSH meaning/read in `mvp_runtime/adapters/polycom_group.py`.
- [x] T020 [US1] Add long-press action and no-sleep-inference tests in `python_tests/test_polycom_group.py` before implementation.
- [x] T021 [US1] Add exact power-management action read in `mvp_runtime/adapters/polycom_group.py`.
- [x] T022 [US1] Run a controlled read-only Group 310 poll in memory, compare all nine groups with menu and keep the output outside Git; verify Site name path remains unchanged in regression tests.

## Phase 4: User Story 2 — общий контракт точных моделей (P2)

**Goal**: Shared rules with individual model gates and Group 300 transport boundary.
**Independent Test**: Synthetic exact Group 300/500/700 and drift fixtures show valid fields only after matching model/bundle; Group 300 HTTPS failure sends no credentials over HTTP.

- [x] T023 [US2] Add exact-model, unsupported-bundle, malformed-field and Group 300 no-HTTP tests in `python_tests/test_polycom_group.py`.
- [x] T024 [US2] Apply the shared reader behind four exact wrappers with model-specific validation status in `mvp_runtime/adapters/polycom_group.py`.

## Phase 5: User Story 3 — безопасный импорт и отчёт (P2)

**Goal**: New JSON facts survive strict projection and appear in existing audit/XLSX without secrets.
**Independent Test**: Exact adapter/model/source survives import; wrong model, fake source or secret neighbor does not; complex answer/NTP facts remain readable.

- [x] T025 [US3] Add failing projection/report tests for Polycom settings and wrong-model/secret inputs in `tests.js`.
- [x] T026 [US3] Add exact Polycom source allowlist and validation in `app.js`.
- [x] T027 [US3] Render split auto-answer and NTP values in existing audit/XLSX via `app.js` without formula execution.

## Phase 6: Polish & validation

- [x] T028 [P] Update the reference and architecture notes in `product-catalog.js`, `docs/context-map.md`, `docs/decisions/ADR-0058-polycom-group-settings-read.md`, `AGENTS.md`.
- [x] T029 Run `node tests.js`, Python unit tests, `node scripts/validate-reference.js`, syntax/secret/diff checks; remove temporary probes from `scripts/`.

## Phase 7: SSH source-priority amendment (User Story 1)

**Goal**: Prefer the actual SSH Service switch when current firmware exposes it; otherwise use a clearly labelled Legacy API fallback.
**Independent Test**: A synthetic primary menu/bundle selects its exact boolean key; the current Group 310 menu selects the known fallback; a visible but unreadable primary never falls back.

- [x] T030 [US1] Add failing primary/absent/unreadable SSH switch contract tests in `python_tests/test_polycom_group.py`.
- [x] T031 [US1] Implement exact menu/bundle-derived primary source and explicit Legacy fallback after model/identity in `mvp_runtime/adapters/polycom_group.py`.
- [x] T032 [US1] Add failing direct/fallback/historical SSH projection and audit-label tests in `tests.js`.
- [x] T033 [US1] Implement strict basis/source projection and qualified fallback presentation in `app.js`.
- [x] T034 [US1] Verify current Group 310 fallback read-only in memory, with no raw responses or credentials saved.
- [x] T035 Update `product-catalog.js`, `AGENTS.md`, `docs/context-map.md`, `docs/implementation-log.md`, `docs/decisions/ADR-0058-polycom-group-settings-read.md`; run full tests/reference/syntax/secret scan and remove probes.

## Dependencies & execution order

- T001–T004 block all stories. Within US1 each field's test precedes its implementation; fields are checked in the user's stated order. T022 follows the nine fields.
- US2 depends on the shared reader from US1. US3 depends on emitted settings and may add its tests before the corresponding UI implementation.
- Polish follows the three stories; T028 touches separate documentation files and may be prepared independently after evidence is stable.
- SSH amendment: T030 → T031 and T032 → T033; T034/T035 follow both. Primary-path operational validation requires a later device exposing the switch and is not claimed by synthetic tests.

## Implementation strategy

MVP is Group 310 read-only settings (US1), validated field by field. Then the guarded shared reader is exercised on exact Group 300/500/700 (US2), followed by strict import and audit presentation (US3). Unknown model/firmware or enum remains unknown instead of a guessed fact.
