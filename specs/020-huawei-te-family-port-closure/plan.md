# Implementation Plan: Huawei TE family port closure

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-07 | **Spec**: [spec.md](spec.md)

## Summary

Expand the existing opt-in management capability from exact TE40 to exact TE30/TE40/TE50/TE60 while retaining the same separate target list, plan v3, HTTPS session, pre/post model checks, identity check, bundle/schema gates, minimal write and menu-value post-read.

## Technical Context

**Language/Version**: Python 3.11+ standard library; Vanilla JavaScript

**Dependencies**: existing catalog, polling and Huawei web-CGI adapter; no third-party packages

**Storage**: volatile session memory and user-selected JSON folder

**Testing**: Python unittest, Node regression/reference checks, compileall, controlled live validation
**Target**: Windows 10/11 loopback runtime and exact Huawei TE30/TE40/TE50/TE60 over HTTPS/443

## Constitution Check

**Pre-design: PASS. Post-design: PASS.** Exact identity precedes change; unknown data is not treated as proof; only deterministic fields are written; secrets remain local and volatile; output is redacted and explainable. No exception is required.

## Design

- Extend the single catalog capability allowlist to four exact models.
- Give the existing frontend descriptors the same management task.
- Reuse one adapter branch for the existing `SUPPORTED_MODELS`; keep every firmware/schema gate.
- Test the exact payload and post-read for every model and rejection outside the allowlist.
- Mark live write support for TE30/TE50/TE60 provisional until controlled user validation.

## Complexity Tracking

No new transport, dependency, storage or plan schema is introduced. The risk is bounded by the existing exact-model and dynamic contract gates.
