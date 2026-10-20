# Research

## Per-file save failure

**Decision**: Treat ACK(false) as a failed output artifact, not a failed entire device plan.
**Rationale**: The next device is independent; backpressure is preserved.
**Alternative**: Abort all polling, which loses later results and caused the reported defect.

## Restart recovery

**Decision**: Keep a visible non-secret manifest beside the results, require folder re-selection and credential re-entry, and reconcile actual JSON files by exact IP.
**Rationale**: Browser directory handles and runtime credentials intentionally do not survive restart.
**Alternative**: Browser storage/AppData vault violates the local ephemerality rule. Fully unattended reboot recovery would require persisting credentials, which is not authorized.

## Unknown write outcome

**Decision**: Do not replay ambiguous management actions automatically.
**Rationale**: A crash can occur after a device accepted a write but before the JSON save.
**Alternative**: Blind retry risks duplicate configuration changes and false reporting.

## Huawei Site Name

**Administrator-provided UI evidence (2026-10-20)**: TE20/TE30/TE40/TE50/TE60 show the setting at `System Settings → Display → Site name`; Bar 310 and Box 310 show it at `Настройки → Графический экран → Имя сайта (Site name)`. This identifies the intended field, not the HTTP resource or response schema. No Box 610 menu location was supplied.

**Future-model evidence (2026-10-20)**: The administrator also manually verified the same `Настройки → Графический экран → Имя сайта (Site name)` path for CloudLink Bar 300, Box 300 and Box 600. Their polling transport is not established by this UI evidence; a separate model-specific contract remains required. See `docs/future-huawei-cloudlink-300-600.md`.

**Decision (updated 2026-10-20)**: Extend the existing TE20 and Bar/Box 310/610 pollers with the same optional mailbox read. It is only attempted after exact post-auth model/identity validation and when the current bundle contains both exact action markers. Missing marker yields `protocol_required`; failed/invalid response yields `unavailable`.
**Rationale**: Huawei's TE-family HTTP API documents subscription and `state.sitename`. A Huawei-authored Box/Bar 310 HTTP API reference documents `WEB_GetMailboxDataAPI` (including the `WEB_GetMailBoxDataAPI` variant) and the same state field. TE20 uses its exact legacy transport and only reaches this action when its own bundle exposes both markers; no TE30 firmware contract is assumed. The POSTs subscribe/read mailbox state in the current authenticated session; they do not write configuration. Live validation for TE20 and 310 firmware remains pending.
**Alternative**: Substituting SR location name would be false evidence; a guessed endpoint is forbidden.

**Sources**: [Huawei TE30/40/50/60 HTTP API reference](https://support.huawei.com/enterprise/zh/doc/EDOC1100074790/19b69006); Huawei-authored *Box 310, Box 610, and Bar 310 HTTP API Reference Guide*, issue 2023-11-13, section on mailbox data (live firmware compatibility pending).
