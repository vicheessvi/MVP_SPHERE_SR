# Implementation Plan: Resumable polling and Huawei Site Name

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-10-19 | **Spec**: [spec.md](spec.md)

## Summary

Keep the Python runtime's sequential ACK backpressure but treat an individual failed write as a recorded per-device outcome. Store only a visible, non-secret checkpoint in the explicitly selected results folder. On restart, reselect the folder, re-enter credentials, reconcile exact JSON files, and resume on explicit click. Read Huawei terminal `sitename` only from documented mailbox state under current bundle markers and exact identity gates, including TE20 and 310 models when their firmware exposes the methods.

## Technical Context

**Language/Version**: Python 3.11+ standard library; HTML5/Vanilla JavaScript.
**Primary Dependencies**: None at runtime.
**Storage**: Selected output folder only for JSON and `polling-recovery.json`; no browser or runtime credential persistence.
**Testing**: Python unittest and Node regression suite.
**Target Platform**: Windows browser plus loopback Python runtime.
**Project Type**: Local desktop web UI/runtime.
**Performance Goals**: One result at a time; bounded manifest read; no full result cache.
**Constraints**: Exact IP, no non-loopback requests, credentials ephemeral, writes opt-in, no invented API.
**Scale/Scope**: Existing device plan limit and 5 MB runtime request limit.

## Constitution Check

- Local-only: PASS. Manifest is in the administrator-selected output folder, not a hidden internal store.
- Secret boundary: PASS. Manifest excludes pairs, hashes, session identifiers and tokens; fresh entry required.
- Evidence-based vendor reads: PASS with guarded optional mailbox call only after exact-model/identity checks and both current-bundle action markers. TE20 and 310 live results remain provisional until device validation; no unguarded new endpoint or configuration write is introduced.
- Management writes: PASS. Uncertain operations are skipped for separate review, not replayed automatically.
- No third-party runtime dependency: PASS.

## Project Structure

```text
app.js                                browser output and resume controls
runtime/polling-recovery.js           non-secret manifest contract
mvp_runtime/polling_job.py            ACK semantics and timeout
mvp_runtime/adapters/huawei_site_name.py
mvp_runtime/adapters/huawei_te40.py
mvp_runtime/adapters/huawei_bar310.py
python_tests/, tests.js               regression coverage
product-catalog.js                    user-facing reference
```

## Design

The manifest is created before POSTing a job. Every result is saved or fails independently, then its outcome is checkpointed before ACK. Recovery reads only a named manifest inside a timestamped output directory, validates structure, checks actual JSON files, and submits a reduced plan with a fresh credential digest. For management plans, uncertain targets are omitted and surfaced for manual review. A lost browser ACK times out the Python job, clearing credentials. Site Name is an optional, marker-gated read within the existing exact-model Huawei transports; unsupported firmware returns an explicit status without changing base polling success.

## Post-design Constitution Check

PASS with one narrow, visible checkpoint exception: the user explicitly selected the output folder. No hidden persistence or credential persistence is introduced.
