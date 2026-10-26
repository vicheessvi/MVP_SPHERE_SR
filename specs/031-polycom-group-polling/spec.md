# Feature Specification: Polycom RealPresence Group polling

**Feature Branch**: `codex/secure-local-runtime`
**Created**: 2026-10-25
**Status**: Implemented; Group 310, 500 and 700 user validation confirmed, Group 300 pending
**Input**: Prepare an automatic device poll for Polycom RealPresence Group 310, 300, 500 and 700; test the connected Group 310 and determine whether the models can share an algorithm.

## User Scenarios & Testing

### User Story 1 — Poll Group 310 (Priority: P1)

The administrator selects a Group 310 from the device plan and receives a JSON snapshot of its confirmed identity, software version, system name, network identity, current status, device time and uptime.

**Why this priority**: Group 310 is available now for a controlled comparison with its own interface.

**Independent Test**: Poll the connected Group 310 once, inspect the saved JSON and compare selected fields with its web interface.

**Acceptance Scenarios**:

1. Given a selected Group 310 with valid credentials, when polled, then exactly one redacted JSON result contains a confirmed model and stable identity plus available read-only fields.
2. Given a different model or unexpected interface, when selected as Group 310, then the result is unsuccessful and no cross-model identity is accepted.

### User Story 2 — Safely reuse for Group 300, 500 and 700 (Priority: P1)

The administrator can plan a poll for each exact Group model without treating the models as interchangeable. Shared behavior is used only while each device confirms its own model and compatible interface.

**Why this priority**: The user needs one family of polls. At initial implementation only Group 310 was available; Group 500 and 700 were validated later by the administrator.

**Independent Test**: Exercise each exact model with synthetic responses and a mismatched response; preserve separate live-validation status for each model.

**Acceptance Scenarios**:

1. Given a selected exact Group 300, 500 or 700 with matching model and expected response shape, when polled, then the result identifies that exact model and its individual validation status.
2. Given a suffix variant, unknown model or changed response shape, when polled, then no successful result is fabricated.

### User Story 3 — Preserve local workflow (Priority: P2)

The new polls use the existing plan, manually entered credentials, chosen results folder and analytics import without weakening local-only handling or changing other adapters.

**Why this priority**: The new family must coexist with established automatic and manual workflows.

**Independent Test**: Run a mixed synthetic plan and existing regression suites.

**Acceptance Scenarios**:

1. Given mixed targets, when the plan runs, then each exact model is routed to its own contract and results keep the established JSON shape.
2. Given any success or failure, when its JSON is prepared, then no credential, session token or cookie is present.

### Edge Cases

- Device unavailable, authentication rejected, expired session, unexpected TLS certificate or unsupported firmware: report a safe failure without raw server content.
- A model mismatch before or after login: do not classify the response as the planned model.
- Missing MAC, serial, uptime or status: mark that field unavailable; do not substitute SR or guessed values.
- Group 300 may share the Group 310/500/700 family interface but has not been validated live; success on one model does not confirm another. An earlier Group 500 model mismatch has no established cause and does not justify weakening exact identity checks.
- Group 300 software 4.1.5-180072 failed during HTTPS validation before credentials although browser HTTP access worked. Software 5.0+ is a candidate for testing, not a guaranteed working range or a reason to send credentials via HTTP.
- Device reports sensitive configuration fields: do not include them merely because they are returned by a broad endpoint.

## Requirements

### Functional Requirements

- **FR-001**: The tool MUST support separate exact model choices for Group 310, 300, 500 and 700 in the automatic plan.
- **FR-002**: The tool MUST use only evidenced, bounded, read-only requests for the selected device and MUST NOT change device settings.
- **FR-003**: The tool MUST confirm the observed model and stable device identity before accepting a successful result.
- **FR-004**: A successful result MUST include available model, serial number, software version, system name, MAC address, device status, device time and uptime, with provenance or explicit unavailable status for optional fields.
- **FR-005**: The tool MUST send credentials only to the administrator-selected IP after recognizing the expected Polycom login interface, and MUST NOT include credentials, session material or raw server errors in output. Exact model confirmation occurs after login because this firmware does not reveal it before authentication.
- **FR-006**: Untested Group 300 MUST retain a provisional validation status until checked on a real device; confirmed Group 310/500/700 statuses MUST remain separate, and suffix variants MUST remain unsupported.
- **FR-007**: Existing manual import and other vendor polls MUST remain functional.

### Key Entities

- **Planned Group target**: exact expected model, selected IP and existing local credential choice.
- **Observed device identity**: model, serial number and MAC address from the device.
- **Polling snapshot**: time-stamped read-only result with bounded source-backed fields, per-field availability and validation status.

## Success Criteria

### Measurable Outcomes

- **SC-001**: One controlled Group 310 poll produces one valid JSON result whose model, serial, software version and MAC match its interface.
- **SC-002**: All four exact models pass synthetic contract tests for matching identity, mismatched identity, authentication failure and malformed responses.
- **SC-003**: Every captured result is free of credentials, cookies and tokens, including failure cases.
- **SC-004**: Existing Python, interface and reference checks pass; no established vendor model changes routing.

## Assumptions

- Group 310 was available for controlled local validation. The administrator later confirmed successful operational polls of Group 310, Group 500 and Group 700 separately. Group 300 remains provisional; no raw reports or credentials were transferred into the repository.
- The administrator consents to a local management login using the credentials supplied for this test. Credentials remain transient and are not copied to project files.
- Only read-only inventory/status collection is in scope. Calls, configuration changes and insecure Telnet polling are out of scope.
