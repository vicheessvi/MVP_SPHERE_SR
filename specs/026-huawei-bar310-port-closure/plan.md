# Implementation Plan: Закрытие HTTP и Telnet на Huawei Bar 310

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

## Summary

Расширить существующую opt-in management capability на exact Huawei Bar 310, не перенося её на Box без модельного evidence review. В confirmed `/v1` session читать только HTTP. HTTP меняется одним минимальным `PUT /v1/om/config` на подтверждённое backend-значение `0` и подтверждается post-read. Управление Telnet в текущем web-интерфейсе отсутствует: не читать и не записывать его настройку, показывать `not_exposed` без вывода о состоянии TCP/23.

## Technical Context

**Language/Version**: Python 3.11+, HTML5, Vanilla JavaScript

**Dependencies**: only Python standard library and existing vendored browser assets

**Storage**: memory-only session/job; final JSON only in user-selected folder

**Testing**: `unittest`, `node tests.js`, reference validator, syntax/compile checks

**Target**: local Windows computer, exact planned IPv4, HTTPS/443

**Constraints**: explicit plan v3 opt-in, separate target workbook, exact model before credentials and after login, stable identity, no guessed vendor API, no HTTP fallback, no third-party dependency

## Constitution Check

- I: only safe action result is persisted in selected JSON; live runtime artifacts are excluded — PASS.
- II: exact model, identity and current schema precede mutation — PASS.
- III: one versioned Bar management contract defines targets and output — PASS.
- IV: unknown HTTP schema and identity drift fail closed; Telnet is never read or written — PASS.
- V: result reports safe before/after/status and does not hide partial support — PASS.
- VI: credentials/cookie/token remain memory-only; network remains exact HTTPS/443 — PASS.

Post-design check: adding PUT to the bounded transport does not broaden destination or methods outside the explicit Bar action; Box wrappers cannot request it — PASS.

## Project Structure

```text
mvp_runtime/adapters/huawei_bar310.py
runtime/device-catalog.json
mvp_runtime/polling.py
app.js
product-catalog.js
python_tests/test_huawei_bar310.py
python_tests/test_catalog.py
python_tests/test_polling.py
tests.js
docs/decisions/ADR-0026-huawei-bar310-port-closure.md
docs/architecture.md
docs/context-map.md
docs/implementation-log.md
specs/026-huawei-bar310-port-closure/
```

**Structure Decision**: management logic lives only in the exact Bar wrapper/core module and is activated through `management_tasks`; general server/job and credential pipeline are reused unchanged.

## Complexity Tracking

No constitution violations. The asymmetric Telnet result is intentional: absence of web management is reported as a model-level observation, never interpreted as measured network-port status.
