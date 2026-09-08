# Implementation Plan: Huawei TE20 port closure

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-huawei-te20-port-closure/spec.md`

## Summary

Extend the existing opt-in `disable_insecure_management_services` capability to exact Huawei TE20 while preserving its separate TLS 1.1 polling transport boundary. Reuse the proven read/minimal-write/re-read management action, permit TE20 only after its existing post-auth exact-model and identity gates, add exact catalog/UI capability projection, and document the controlled real-device evidence. No plan schema, output schema, dependency, storage or network scope changes.

## Technical Context

**Language/Version**: Python 3.11+ standard library; HTML5/CSS3/Vanilla JavaScript ES2020+

**Primary Dependencies**: Python standard library only in production; vendored SheetJS CE for browser XLSX parsing; Node.js only for development regression checks

**Storage**: Session memory only; redacted JSON written solely to the user-selected run folder

**Testing**: `unittest`, Python `compileall`, JavaScript regression harness, JS syntax checks, reference validator, secret/artifact/private-IP scans

**Target Platform**: Windows workstation with installed Python 3.11+ and local browser

**Project Type**: Local browser application with an authorized loopback Python polling runtime

**Performance Goals**: One bounded read/write/re-read management action per exact selected TE20; no extra device-wide discovery and no change to polling interval behavior

**Constraints**: Exact target allowlist, explicit user opt-in, separate target XLSX, TE20-only TLS 1.1 profile, self-signed certificate opt-in, same-session credentials/cookies/CSRF, no external network, no third-party Python packages, fail-closed schema/model/identity gates, no raw sensitive responses

**Scale/Scope**: Add one exact model to one existing management capability; retain current multi-device plan and result schemas

## Constitution Check

*GATE before research: PASS. Re-check after design: PASS.*

- **Immutable evidence**: raw SR/XLSX and device responses are not rewritten or stored; only a redacted derived result is eligible for explicit output.
- **Identity before comparison/write**: the existing TE20 post-auth exact-model plus serial-or-MAC gate runs before management action execution.
- **Deterministic normalization**: exact normalized category/manufacturer/model resolution is reused; no approximate IP or model matching is introduced.
- **Incomplete data safety**: missing markers, missing values, unknown schema, interrupted verification and identity mismatch all stop or fail without a success claim.
- **Explainability**: management result preserves status, write-attempt flag and safe before/after service states separately from ordinary polling success.
- **Local secret protection**: existing in-memory XLSX pool, loopback runtime, redaction and terminal cleanup remain unchanged; no secret-bearing artifact is added.
- **Quality workflow**: Full SpecKit, synthetic contract tests, complete regression suite and controlled real-device evidence are required.

Post-design re-check confirms no constitutional violation. Complexity tracking is not required.

## Project Structure

### Documentation (this feature)

```text
specs/023-huawei-te20-port-closure/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── huawei-te20-management-v1.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
mvp_runtime/
├── adapters/huawei_te40.py     # Shared bounded Huawei web-CGI action with TE20-specific transport
├── catalog.py                  # Exact management capability resolution
└── polling.py                  # Plan routing and safe unsupported completion

runtime/
└── device-catalog.json         # Exact model/action manifest

app.js                          # Capability projection and plan UI
product-catalog.js              # Russian reference/help text
scripts/validate-reference.js   # Reference/catalog validation
python_tests/                   # Python contract and routing tests
tests.js                        # Frontend regression tests
docs/                           # Architecture, context, decision and implementation record
```

**Structure Decision**: Keep the existing single management action and shared Huawei adapter. TE20 remains a separate polling transport; only the exact action eligibility set expands. This avoids a duplicate endpoint implementation and preserves current plan/server/job contracts.

## Complexity Tracking

No constitution violations or additional architectural layers are introduced.
