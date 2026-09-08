# Implementation Plan: актуальная схема выгрузки SR

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

## Summary

Introduce one 42-column canonical SR contract, accept renamed legacy headers through a canonical-first alias registry, normalize new location/equipment attributes, and prefer SmartRoom IDs for identity without changing raw evidence or local-only storage.

## Technical Context

**Language/Version**: HTML5, CSS3, Vanilla JavaScript

**Dependencies**: vendored SheetJS CE 0.20.3; no new dependency

**Storage**: volatile browser state only; raw XLSX rows retained only in the active session

**Testing**: Node regression/reference/syntax; existing Python runtime regression

**Target**: Windows Chromium manual mode and Python loopback full mode

## Constitution Check

**Pre-design: PASS. Post-design: PASS.** Stable SmartRoom identifiers precede mutable attributes; raw evidence remains unchanged; imports are atomic; unknown/missing semantics fail closed; no network, persistence or secret boundary changes are introduced.

## Design

- Declare the exact ordered canonical header set and a semantic alias registry.
- Validate required meanings rather than one spelling of each header.
- Expand normalized location/device projections for every new field.
- Prefer SmartRoom IDs in indexed and non-indexed identity paths.
- Use new terminology in filters, cards, help and architecture documentation.
- Preserve existing legacy fixtures as explicit compatibility coverage.

## Complexity Tracking

Alias resolution is bounded by at most two names for renamed fields. Existing O(N) indexed import remains O(N); no additional retained copy beyond the already required raw row and projection is introduced.
