# Implementation Plan: Secure local polling runtime

**Branch**: `003-secure-local-polling` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Summary

Replace protected-operation use of browser storage with a Windows local-only Node runtime. Persist state and credentials as AES-256-GCM authenticated ciphertext under a DPAPI CurrentUser-protected master key, remove artificial 4 MiB limits, expose only Administrator МЦТП and remove legacy audit routes. Add a credential vault and model-aware polling CLI with actual bounded ping plus fail-closed provider adapters until verified protocol contracts exist.

## Technical Context

**Language/Version**: Node.js 20+ built-ins; existing browser Vanilla JavaScript

**Primary Dependencies**: Node built-in `http`, `crypto`, `fs`, `child_process`; Windows PowerShell/.NET DPAPI; vendored SheetJS 0.20.3

**Storage**: Encrypted versioned objects in `%LOCALAPPDATA%\MVP_SPHERE_SR`; no application quota, atomic replace

**Testing**: Existing `tests.js`; new Node `runtime-tests.js`; syntax checks

**Target Platform**: Windows desktop, single OS user, browser UI served over loopback

**Project Type**: Local desktop-style web application and polling CLI

**Performance Goals**: 10 MiB state round-trip; bounded polling timeout; no full-vault exposure

**Constraints**: Offline except explicit device polling; loopback only; secrets redacted; no invented vendor protocols; no npm runtime dependency

**Scale/Scope**: Disk-bounded local history; one Administrator МЦТП; supplied model catalog

## Constitution Check

*Pre-design and post-design: PASS against constitution 2.0.0.*

- Immutable evidence: encrypted raw objects retain hashes and are never modified in place.
- Identity before comparison: existing SR identity pipeline remains.
- Deterministic normalization: existing v2 rules preserved during v3 migration.
- Incomplete data safety: polling failures produce scoped results, not removals.
- Explainability: protocol-required and ping failures are explicit.
- Local protection: DPAPI CurrentUser + AES-GCM, separate credential vault, loopback/session/CSRF controls, no external service.

## Project Structure

```text
server.js
start.ps1
runtime/
├── security.js
├── secure-store.js
├── credential-vault.js
├── model-catalog.js
└── polling.js
scripts/
└── poll-devices.js
app.js
index.html
tests.js
runtime-tests.js
specs/003-secure-local-polling/
```

**Structure Decision**: Preserve the static UI and pure analytics core; add the smallest local runtime boundary rather than a framework or remote backend.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Browser-only direct-open is retired for protected operation | Credentials and disk-bounded encrypted storage require an OS process | `localStorage`/IndexedDB are quota-bound and readable by the browser profile |
| Constitution 1.0 secret prohibition changed to vault isolation | User explicitly requires device credentials for polling | Storing credentials in analytics state would be unsafe; refusing all credentials would not meet polling requirements |
