# Data Model: Huawei Box contracts

## ModelContractProfile

- `contract_id`: unique persisted contract identifier.
- `contract_model`: exact pre-auth and post-auth device model.
- `plan_models`: normalized SR/plan aliases allowed to select this wrapper.
- `evidence_status`: `confirmed_user_validation` or `provisional_user_validation`.
- `evidence_label`: safe human-readable interface evidence.

Validation: profile values are immutable constants owned by a model wrapper. Exact device model equality is required; aliases never weaken the device-side gate.

## PollingResult

- Existing common fields: `ip`, `capturedAt`, `ok`, `failedStage`, safe diagnostics.
- `vendorPolling.contract`: model-specific ID.
- `vendorPolling.model`: exact contract model.
- `vendorPolling.evidenceStatus`: confirmation boundary.
- Existing compatible blocks: `Device Info`, `Firmware`, `Device Status`, `LAN Settings`, `Capabilities`.

## State transitions

`planned` → `bundle_confirmed` → `preauth_model_confirmed` → `session_opened` → `authorized` → `postauth_identity_confirmed` → `completed`.

Any mismatch transitions directly to a terminal safe failure. Credentials may be sent only after `preauth_model_confirmed`.
