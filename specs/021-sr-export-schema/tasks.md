# Tasks: актуальная схема выгрузки SR

## Phase 1: Contract and specification

- [x] T001 Record the exact 42-column contract in specs/021-sr-export-schema/contracts/sr-xlsx-v2.md
- [x] T002 Define compatibility, precedence and identity rules in specs/021-sr-export-schema/spec.md

## Phase 2: Canonical import and normalization

- [x] T003 Add canonical headers and semantic aliases in app.js
- [x] T004 Validate required semantic fields atomically in both SR import paths in app.js
- [x] T005 Normalize all new location and equipment fields while preserving raw rows in app.js

## Phase 3: Stable identity and terminology

- [x] T006 Prefer SmartRoom location and equipment IDs in indexed and non-indexed matching in app.js
- [x] T007 Update classification, filters, cards and diagnostics to current terminology in app.js
- [x] T008 Update product catalog and user documentation in product-catalog.js and README.md

## Phase 4: Regression coverage

- [x] T009 Cover the complete canonical schema and new projections in tests.js
- [x] T010 Preserve legacy-header regression coverage in tests.js
- [x] T011 Cover stable identity across changed location and equipment properties in tests.js

## Phase 5: Architecture and validation

- [x] T012 Record architecture and migration decision in docs/architecture.md and docs/decisions/ADR-0021-sr-export-schema.md
- [x] T013 Run complete Python, JavaScript, reference, syntax, diff and secret checks
- [x] T014 Record final validation in docs/implementation-log.md

## Dependencies

The contract precedes implementation. Import/normalization precede identity tests. Documentation and final validation follow behavior stabilization.

## Independent tests

- US1: a complete canonical workbook produces one correctly projected location and device.
- US2: stable SmartRoom IDs survive renamed location and changed equipment attributes.
- US3: the prior header set continues to import and drive filters/classification.
