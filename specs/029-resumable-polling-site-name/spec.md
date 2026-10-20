# Feature Specification: Resumable polling and Huawei Site Name

**Feature Branch**: `codex/secure-local-runtime`
**Created**: 2026-10-19
**Status**: Implemented locally; device validation pending
**Input**: Continue automatic polling after isolated JSON write errors or process/browser interruption; add Site Name to Huawei terminal results.

## Clarifications

### 2026-10-20

The administrator confirmed the intended setting: TE20/TE30/TE40/TE50/TE60 use `System Settings → Display → Site name`; Bar 310 and Box 310 use `Настройки → Графический экран → Имя сайта (Site name)`. This is the terminal's own configured name, not the SR location name. Box 610's menu path was not provided. The UI path does not itself establish a safe machine-readable interface.

## User Scenarios & Testing

### User Story 1 — Continue after an isolated save error (P1)

An administrator runs a multi-device poll. If one JSON cannot be saved, the failure is recorded, the next device is polled, and the run ends with a warning rather than losing all later results.

**Independent Test**: Make the first file write fail in a two-device test run and confirm the second result is saved.

**Acceptance Scenarios**:

1. Given a two-device plan, when the first result cannot be saved, then the second device is still polled and its result can be saved.
2. Given a run with one failed save, when the run finishes, then the administrator sees a warning and the affected target is identifiable.

### User Story 2 — Resume after interruption (P1)

After a browser or OS restart, the administrator starts the tool, selects the same results folder, enters credentials again, and presses «Продолжить опрос». Existing valid result files are not repeated. An uncertain device-management write is not repeated automatically.

**Independent Test**: Start a two-device run, save the first result, restart the page, reselect the folder, and confirm only the second target is polled. In write mode, unresolved targets are flagged for review.

**Acceptance Scenarios**:

1. Given one valid saved result, when the administrator reselects the folder, reloads the source list, enters credentials and chooses to continue, then that device is not polled again.
2. Given an uncertain outcome of a device-management change, when the run is resumed, then that target is flagged for review and is not changed again automatically.
3. Given the browser reopens while the local polling process is still active, when the same results folder is selected, then the screen reconnects to that process without starting a second job.

### User Story 3 — Capture Site Name (P2)

For supported Huawei terminals, Site Name appears in the result when the device provides a verified value. Otherwise the file explains that the value is unavailable; it never substitutes an SR location name.

**Independent Test**: Simulate a device that provides Site Name and one that does not; verify the value appears only in the first result.

**Acceptance Scenarios**:

1. Given a verified Huawei TE20/TE30/TE40/TE50/TE60 or Bar 310/Box 310/Box 610 device that exposes Site Name through the guarded read contract, when it is polled, then the exact value appears in the result.
2. Given a Huawei terminal without a verified Site Name source, when it is polled, then the result marks the value as unconfirmed and does not reuse its SR location name.

### Edge cases

- A closed browser leaves a result awaiting save: a bounded timeout terminates the job and clears its credentials.
- The result file was written but the acknowledgement was lost: recovery verifies the actual JSON by exact IP before skipping.
- Recovery information is malformed or contains credential-like fields: it is ignored, not executed.
- Unrelated JSON files and the recovery manifest itself are not imported as device results.
- Site Name is empty, missing, invalid, or unavailable: mark it as unknown without failing the base poll.

## Requirements

- **FR-001**: A failed file save MUST be counted separately from a device polling error and allow the next device.
- **FR-002**: The run MUST show a warning and a non-secret event for each failed result save.
- **FR-003**: The selected output folder MUST contain visible, non-secret recovery information before polling begins.
- **FR-004**: Recovery MUST require explicit folder selection, fresh credentials and a manual button. No credentials, their hashes, session tokens or cookies may persist in the manifest.
- **FR-005**: Existing valid JSON MUST be reconciled by exact IP and skipped. Before a new runtime job, the administrator MUST reimport the same SR or dedicated target list and its target IP/model/manufacturer projection MUST match the manifest.
- **FR-006**: Uncertain management writes MUST NOT be replayed automatically.
- **FR-007**: When a browser stops saving results, the operation MUST stop after a bounded wait and clear its credentials.
- **FR-008**: Site Name MUST come only from a verified device source; unknown values MUST remain explicit unknowns.
- **FR-009**: The manual import workflow MUST ignore recovery information as device data.

## Key Entities

- **Recovery record**: user-visible, non-secret planned target order, saved results and failure events.
- **Save failure event**: target position and safe code; no raw OS path or exception text.
- **Site Name reading**: value and source/status separate from SR location.

## Success Criteria

- **SC-001**: A failed first save in a two-device job does not prevent the second result.
- **SC-002**: Restart recovery does not re-poll a device with a valid saved JSON.
- **SC-003**: A write-task target with uncertain outcome is reported for review and not automatically retried.
- **SC-004**: No credential material appears in the recovery manifest or result metadata.

## Assumptions

- Fully unattended continuation after OS restart is incompatible with intentionally ephemeral credentials and folder permissions; resumption occurs after explicit re-selection and re-entry.
- The current Huawei mailbox interface is optional and device/firmware-specific; live confirmation is still required.
