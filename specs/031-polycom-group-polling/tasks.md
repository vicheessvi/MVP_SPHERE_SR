# Tasks: Polycom RealPresence Group polling

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/web-rest.md`

## Phase 1: Setup

- [x] T001 Verify `.gitignore` excludes device dumps, local credentials and transient probe artifacts; retain no live data in `specs/031-polycom-group-polling/research.md`.

## Phase 2: Foundation

- [x] T002 Define synthetic fixed response envelopes and safe fake identities in `python_tests/test_polycom_group.py` for the observed login, system, status, uptime and one-name config contract.

## Phase 3: User Story 1 — Group 310 (P1)

**Goal**: Produce one source-backed, redacted Group 310 JSON snapshot.

**Independent Test**: A synthetic exact 310 succeeds, while wrong model, rejected login, timeout, malformed responses and secrets fail or redact as specified; controlled live 310 read passes.

- [x] T003 [US1] Add failing contract tests for Group 310 success, auth failure, model mismatch, TLS/timeout and redaction in `python_tests/test_polycom_group.py`.
- [x] T004 [US1] Implement bounded HTTPS web-session, pre-auth markers, exact model/identity checks and selected reads in `mvp_runtime/adapters/polycom_group.py`.
- [x] T005 [US1] Validate the adapter with a controlled read-only Group 310 poll and record only non-sensitive outcomes in `specs/031-polycom-group-polling/research.md`.

## Phase 4: User Story 2 — Group 300/500/700 (P1)

**Goal**: Reuse the guarded core through distinct exact model contracts, marked provisional.

**Independent Test**: Each exact synthetic model succeeds with its own identity; suffix and cross-model responses fail closed.

- [x] T006 [US2] Add failing synthetic Group 300/500/700, suffix and cross-model tests in `python_tests/test_polycom_group.py`.
- [x] T007 [US2] Add separate model descriptors and wrappers with provisional validation status in `mvp_runtime/adapters/polycom_group.py`.
- [x] T008 [US2] Register four transport keys and exact catalog entries while preserving unrelated Polycom models as `protocol_required` in `mvp_runtime/polling.py` and `runtime/device-catalog.json`.
- [x] T009 [US2] Add exact-model capability projection and routing checks in `app.js`, `python_tests/test_catalog.py` and `tests.js`.

## Phase 5: User Story 3 — Local workflow and explanation (P2)

**Goal**: Preserve manual import, local credentials and existing poll behavior while explaining the new family.

**Independent Test**: Mixed synthetic plan, full regressions and reference validator pass; no secret or device data is committed.

- [x] T010 [US3] Add Russian model/firmware reference mappings and polling help in `product-catalog.js` without duplicating module routes.
- [x] T011 [US3] Document security boundary, confirmation status and integration in `docs/decisions/ADR-0032-polycom-group-polling.md`, `docs/context-map.md` and `docs/implementation-log.md`.
- [x] T012 [US3] Run Python, JavaScript and reference regression suites and correct relevant failures in `python_tests/test_polycom_group.py`, `tests.js` or implementation files.

## Phase 6: Polish

- [x] T013 Remove temporary discovery scripts from `scripts/` and verify a secret, raw device artifact and private-IP scan plus `git status --short`.
- [x] T014 Recheck source-backed output, exact model routing and constitution gates in `specs/031-polycom-group-polling/plan.md` and `specs/031-polycom-group-polling/quickstart.md`.

## Dependencies

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010/T011 → T012 → T013 → T014.

## Parallel opportunities

T010 and T011 affect independent catalog/documentation files after routing is stable; all adapter and contract tasks stay sequential because they share the same device contract.

## Implementation strategy

MVP is User Story 1. User Story 2 adds only guarded exact-model reuse; User Story 3 proves coexistence and documents the provisional boundary. No commit or push is part of this task without a separate user request.
