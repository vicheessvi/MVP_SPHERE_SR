# Implementation Plan: CloudLink 300-family polling

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-10-20 | **Spec**: [spec.md](spec.md)

## Summary

Add three exact-model transports backed by one guarded legacy web-CGI core. The Bar 300 flow is based on a controlled, read-only live observation; Box 300/600 use the same mechanism only when their own pre-auth model code, current bundle markers and post-auth model/identity pass. Site name is read from the exact `sitename` configuration query. No 310 REST or management-write contract is reused.

## Technical Context

**Language/Version**: Python 3.11+ standard library; Vanilla JavaScript.
**Primary Dependencies**: Existing local runtime, device catalog and browser application; no external packages.
**Storage**: Existing user-selected JSON output only.
**Testing**: Python unittest, JavaScript regression/reference checks, controlled read-only device probe.
**Target Platform**: Windows; loopback Python runtime; HTTPS/443 to exact selected device IP.
**Project Type**: Local application with model-specific polling adapters.
**Performance Goals**: Same one-result-at-a-time behavior as current polling; bounded 7-second resource requests.
**Constraints**: No secret in plan/result/log, exact IP and model gates, no configuration writes, no protocol guessing.
**Scale/Scope**: Three exact model names and spelling aliases only; suffix variants remain unsupported.

## Constitution Check

- Evidence and immutable result: PASS; raw device responses never enter Git, normalized JSON retains source labels.
- Identity before comparison: PASS; pre-auth numeric model plus post-auth model and stable serial/MAC required.
- Incomplete data: PASS; missing Site name is explicit unknown, never SR fallback.
- Local security: PASS; HTTPS to exact selected IP, transient credentials, no third-party dependency, no non-loopback bind.
- Write boundary: PASS; action allowlist contains only login/session and read-only resources.
- Box 300/600 validation: `confirmed_user_validation` after independent administrator reports, including Site name equality; the catalog still permits only guarded exact-model attempts.

## Project Structure

```text
mvp_runtime/adapters/huawei_300.py       shared guarded CGI core
mvp_runtime/polling.py                   three transport registrations
runtime/device-catalog.json             exact model manifests
app.js, product-catalog.js               browser routing and reference
python_tests/test_huawei_300.py          synthetic contract tests
tests.js                                 catalog/UI regression
docs/decisions/ADR-0031-huawei-300.md   evidence and safety boundary
```

## Design

The adapter reads the current main bundle and requires exact CGI and model-code markers before credentials. `WEB_GetLoginInfo` must report the expected model code, no active session and the observed legacy shape. Authentication follows the verified browser session/certificate flow. After login, version model plus serial or MAC is mandatory. Six fixed resource actions produce the existing Huawei-shaped JSON. A separate fixed `WEB_GetCfgParamAPI` read with only `CfgIDString=[sitename]` provides Site name. Response fields are whitelisted and redacted; failures are safe codes. Box 300/600 share code but retain independent model identity and user-validation evidence.

## Post-design Constitution Check

PASS. No source mutation, credential persistence, unverified target fallback or write action is introduced. Real Box acceptance remains an explicit future gate.
