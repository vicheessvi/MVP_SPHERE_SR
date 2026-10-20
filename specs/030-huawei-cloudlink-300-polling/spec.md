# Feature Specification: Huawei CloudLink 300-family polling

**Feature Branch**: `codex/secure-local-runtime`
**Created**: 2026-10-20
**Status**: Implemented; Bar 300 controlled read and Box 300/600 user validation confirmed
**Input**: Prepare a full read-only poll for a connected Huawei CloudLink Bar 300, including Site name, and safely reuse the confirmed behavior for exact Box 300 and Box 600 models.

## User Scenarios & Testing

### User Story 1 — Poll exact Bar 300 (Priority: P1)

The administrator selects an exact Bar 300 and obtains a JSON result containing device identity, available version/status/network data and the device's configured Site name.

**Independent Test**: Poll one administrator-selected Bar 300 and compare the result with its web interface.

**Acceptance Scenarios**:

1. Given an exact Bar 300 and working credentials, when it is polled, then the JSON includes the confirmed model and identity plus Site name if the device exposes it through a verified read.
2. Given a mismatched device, when it is selected as Bar 300, then credentials are not sent to the unverified model and no successful Bar 300 result is fabricated.

### User Story 2 — Reuse safely for Box 300 and Box 600 (Priority: P1)

The administrator can select either exact Box model. The tool uses shared behavior only if that model's own device response confirms compatibility; it never silently treats one Box as a Bar.

**Independent Test**: Simulate each exact model and a wrong-model response; verify distinct model identity and common result shape.

**Acceptance Scenarios**:

1. Given a verified exact Box 300 or Box 600 with a compatible interface, when it is polled, then a model-specific JSON result includes Site name when confirmed.
2. Given an unknown firmware, suffix variant or incompatible interface, when polling is planned, then the attempt fails safely without a guessed result or configuration change.

### User Story 3 — Preserve existing workflows (Priority: P2)

The new models participate in the existing automatic plan and chosen-folder JSON output without changing manual import, credentials lifecycle, or the polling contracts of other Huawei models.

**Independent Test**: Use a mixed synthetic plan and inspect routing and result files.

**Acceptance Scenarios**:

1. Given a mixed plan, when it runs, then each exact model is routed to its own confirmed contract and other models retain their behavior.
2. Given any result, when it is saved, then login/password/session material does not appear in the JSON.

### Edge Cases

- A browser bundle or firmware differs from the observed Bar 300: refuse unsupported requests.
- Site name is absent or unreadable: record an explicit unknown status; never substitute the SR location.
- The administrator independently confirmed successful Box 300/600 reports and Site name equality with each device menu; future firmware drift must still fail closed.
- A timeout, TLS or authorization failure does not produce a false successful device result.

## Requirements

- **FR-001**: The tool MUST identify exact Bar 300 before accepting its result.
- **FR-002**: The tool MUST protect credentials by verifying the device before sending them and clearing them at the normal job boundary.
- **FR-003**: The tool MUST collect only evidenced, read-only parameters and include configured Site name when verified.
- **FR-004**: Box 300 and Box 600 MUST have separate exact-model identity checks even if implementation is shared.
- **FR-005**: Unsupported variants MUST remain visibly unsupported and MUST NOT receive a guessed fallback protocol.
- **FR-006**: The JSON MUST retain existing structure and redaction rules; manual import MUST continue to work.
- **FR-007**: Polling these models MUST NOT enable management writes or change device settings.

## Key Entities

- **Device identity**: expected and observed model, stable serial or MAC evidence.
- **Polling result**: per-device JSON with source-backed fields and explicit unknown statuses.
- **Site name**: name configured on the endpoint, distinct from SR location name.

## Success Criteria

- **SC-001**: A controlled Bar 300 poll yields one JSON whose identity and Site name match the live device interface.
- **SC-002**: Every tested model mismatch is rejected before credentials or marked unsuccessful after login without cross-model assignment.
- **SC-003**: Box 300/600 synthetic contract tests pass and the administrator confirms successful reports and Site name equality separately for both exact models.
- **SC-004**: Existing Python and JavaScript regression suites pass without credential data in outputs.

## Assumptions

- The Bar 300 was available for controlled live investigation. Box 300/600 were later validated independently by the administrator on their working PC; no raw reports or credentials were transferred into the repository.
- The administrator-confirmed Site name menu path identifies the field, not by itself a network API.
