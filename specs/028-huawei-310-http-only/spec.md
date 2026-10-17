# Feature Specification: HTTP-only management for Huawei 310 devices

**Feature Branch**: `codex/secure-local-runtime`

**Created**: 2026-10-17

**Status**: Implemented locally — controlled Box 310/610 live validation pending

**Input**: The administrator confirmed that Huawei Bar 310, Box 310 and Box 610 have no Telnet management option. The existing port-closure task must act only on HTTP for these exact models and report Telnet as absent.

## Clarifications

### Session 2026-10-17

- Q: Does the backend value `enable_http=0` have the same disable meaning on Box 310 and Box 610 as on Bar 310? → A: Yes, confirmed by the administrator; exact-model, current-bundle and post-read gates still apply.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Accurate service report (Priority: P1)

An administrator selects the existing management task for an exact Huawei 310-family device and sees HTTP and Telnet reported separately. The report never suggests that Telnet was disabled by the tool.

**Independent Test**: Select each exact model in a synthetic plan and inspect the result without changing device settings.

**Acceptance Scenarios**:

1. **Given** an exact Bar 310, Box 310 or Box 610, **When** the HTTP-only task is evaluated, **Then** Telnet is reported as absent and no Telnet configuration request is sent.
2. **Given** another Huawei model, **When** its existing task runs, **Then** its model-specific Telnet behavior remains unchanged.

---

### User Story 2 - Safely disable HTTP on Bar 310 (Priority: P1)

The already-confirmed Bar 310 HTTP action remains available with exact-model checks and post-change verification, but no longer depends on reading a nonexistent Telnet setting.

**Independent Test**: Simulate HTTP enabled, disabled, and unknown values; verify that only the enabled case produces one safe HTTP change and no Telnet request occurs.

**Acceptance Scenarios**:

1. **Given** verified exact Bar 310 and enabled HTTP, **When** the administrator explicitly selects the task, **Then** HTTP is disabled and verified by a second read.
2. **Given** HTTP already disabled, **When** the task runs, **Then** it reports compliance without a write.

---

### User Story 3 - Safely disable HTTP on Box 310 and Box 610 (Priority: P1)

The administrator can use the same HTTP-only task on either exact Box model using the administrator-confirmed disable value. Unsupported versions and unexpected setting responses must be skipped safely rather than guessed from Bar 310.

**Independent Test**: For each exact Box model, verify the model and identity gates, one HTTP-only change when required, post-read confirmation, and refusal on schema or firmware drift.

**Acceptance Scenarios**:

1. **Given** verified exact Box 310 or Box 610, its current HTTP configuration matches the approved contract, and the task is selected, **When** HTTP is enabled, **Then** exactly one HTTP setting is changed to the administrator-confirmed safe value and post-read confirms it is disabled.
2. **Given** the Box model, setting, or safe disable value is unconfirmed, **When** the task is requested, **Then** no write is attempted and the result explains that the protocol requires confirmation.

### Edge Cases

- A firmware variant unexpectedly exposes Telnet: do not infer how to manage it; stop and request separate evidence review.
- A Box with a model suffix or ambiguous identity is not eligible for the write task.
- A successful web request without confirmed HTTP post-read is not reported as a successful change.
- The absence of a Telnet menu entry is not treated as a network-port measurement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The management task MUST be opt-in and limited to exact Bar 310, Box 310 and Box 610 identities plus already-supported TE models.
- **FR-002**: For the three 310-family models, the task MUST NOT read or write a Telnet configuration setting; its result MUST state that Telnet is absent according to the confirmed product requirement, not that the tool disabled it.
- **FR-003**: HTTP changes MUST be attempted only after exact model, stable identity, current firmware/interface markers and the model-specific HTTP read schema are confirmed. The administrator confirmed `enable_http=0` as the safe disable value for each exact 310 model.
- **FR-004**: Each HTTP change MUST be minimal, limited to one setting, and verified by reading it again.
- **FR-005**: If a Box current bundle, model, identity or HTTP read/post-read schema does not match the approved contract, that model MUST perform no write and distinguish this from an authentication or network error.
- **FR-006**: Existing ordinary polling for Bar 310, Box 310 and Box 610 and the TE-family management contracts MUST remain unchanged.
- **FR-007**: The user-facing task and reference text MUST distinguish HTTP-only handling of the 310 family from HTTP-and-Telnet handling of TE devices.
- **FR-008**: No credentials, tokens, raw settings responses, or private device identifiers MAY enter the plan, logs, analytics or repository.

### Key Entities

- **Exact device contract**: model, identity, validated setting semantics and action eligibility.
- **Service action result**: HTTP state before/after, write attempt, verification outcome, and Telnet absence marker.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All three exact models show Telnet as absent in the task result; zero Telnet configuration requests are made.
- **SC-002**: Each eligible model performs at most one HTTP write per task, and 100% of successful changes have a confirming post-read.
- **SC-003**: Unknown model, identity or HTTP-setting evidence leads to zero writes in every control scenario.
- **SC-004**: Ordinary polling and TE-family management regression suites pass without behavior changes.

## Assumptions

- The administrator's visual inspection is accepted as a product requirement that these exact models expose no Telnet management function. It is not proof of TCP/23 status on every device.
- Bar 310 HTTP-setting semantics are supported by the prior controlled device investigation. The administrator confirms the same disable value for Box 310 and Box 610; controlled live validation remains pending for those two models and is not inferred from synthetic tests.
- Existing local session, selected target list, credentials and output-folder controls are reused.
