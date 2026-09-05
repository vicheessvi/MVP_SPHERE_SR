# Implementation Plan: Общий опрос Huawei TE30, TE40, TE50 и TE60

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-05 | **Spec**: [spec.md](spec.md)

## Summary

Extend the single bounded Huawei legacy web-CGI adapter from exact TE40 to exact TE30/TE40/TE50/TE60. Use one canonical transport, require planned-model agreement with the pre-auth terminal type before credentials, repeat model verification against the authenticated version response, and leave all other Huawei models fail closed.

## Technical Context

**Language/Version**: Python 3.11+ standard library; Vanilla JavaScript catalog projection

**Primary Dependencies**: `http.client`, `ssl`, existing catalog/polling/job/server; no new dependency

**Storage**: unchanged volatile memory plus explicit user-selected JSON output

**Testing**: Python `unittest`, frontend Node regression, reference validator, compileall

**Target Platform**: Windows 10/11, local Python loopback runtime, HTTPS/443 target

**Constraints**: exact plan IP; exact TE30/TE40/TE50/TE60 catalog match; credentials only after pre-auth model confirmation; fixed action allowlist; bounded response; no HTTP fallback

## Constitution Check

**Pre-design: PASS. Post-design: PASS.** Raw responses are not added to Git; target identity is checked twice; normalization is deterministic; unknown/mismatched models fail closed; diagnostics remain redacted; Python/runtime/storage boundaries are unchanged.

## Project Structure

```text
runtime/device-catalog.json
app.js
mvp_runtime/adapters/huawei_te40.py
mvp_runtime/polling.py
python_tests/test_huawei_te40.py
python_tests/test_catalog.py
python_tests/test_polling.py
tests.js
product-catalog.js
docs/
specs/018-huawei-te-family/
```

## Design

- Keep one implementation function for all four allowed model tokens.
- Introduce a generic canonical transport id while retaining a code alias only where needed for compatibility.
- Verify `WEB_GetLoginInfo.szTermType` before `Web_RequestCertificate`.
- Verify `WEB_GetVersionInfoAPI.model` against the same planned token after authentication.
- Do not enable TX50 or unknown Huawei even though the official family document also mentions TX50.

## Complexity Tracking

No constitution exception. Live compatibility of target TE30/TE50/TE60 firmware remains pending and is recorded rather than inferred.
