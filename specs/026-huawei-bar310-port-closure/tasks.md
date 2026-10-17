# Tasks: Закрытие HTTP и Telnet на Huawei Bar 310

## Phase 1: Evidence and contracts

- [X] T001 Record controlled read-only evidence and limits in `research.md`
- [X] T002 Define exact model/action/data contracts and checklist
- [X] T003 Record architectural decision in `docs/decisions/ADR-0026-huawei-bar310-port-closure.md`

## Phase 2: Tests first

- [X] T004 Add Bar HTTP-only action request/write/verify/fail-closed/no-Telnet-request/redaction tests in `python_tests/test_huawei_bar310.py`
- [X] T005 Add catalog and registry capability tests in `python_tests/test_catalog.py` and `python_tests/test_polling.py`
- [X] T006 Add frontend capability tests in `tests.js`

## Phase 3: Implementation

- [X] T007 Add bounded PUT support and Bar-only management contract in `mvp_runtime/adapters/huawei_bar310.py`
- [X] T008 Route `management_tasks` through polling to Bar and preserve Box read-only behavior
- [X] T009 Extend exact catalog/frontend capability entries
- [X] T010 Update centralized reference text in `product-catalog.js`

## Phase 4: Documentation and validation

- [X] T011 Update `AGENTS.md`, architecture, context map and implementation log
- [X] T012 Run the complete quickstart validation matrix
- [X] T013 Run secret/artifact/private-IP scan
- [X] T014 Perform one controlled live Bar 310 action and verify post-read without persisting secrets
- [X] T015 Mark feature complete only after all gates and live verification pass

## Dependencies & Execution Order

Evidence precedes contract tests. Tests precede adapter/catalog implementation. Documentation follows stable behavior. Live mutation occurs last, after synthetic safety tests and only against the explicitly supplied exact Bar 310.

## Implementation Strategy

Make the smallest additive change: preserve the confirmed Bar polling flow, insert the management action only after full resource identity validation, allow only one config field write, and keep Telnet fail-closed/read-only until independently verifiable.
