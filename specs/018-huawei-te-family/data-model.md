# Data Model: Huawei TE30/TE40/TE50/TE60 shared polling

## HuaweiTeTarget

- `plannedModel`: normalized exact `te30`, `te40`, `te50` or `te60`.
- `ip`: exact current-plan IPv4.
- `allowInsecureTls`: one-run TLS decision.

Validation: any other model is rejected before network use by catalog/adapter.

## PreAuthIdentity

- `terminalType`: `szTermType` from the unauthenticated login-info response.
- `matchesPlannedModel`: token-boundary comparison with `plannedModel`.

Transition: mismatch ends at `validation`/`target_model_mismatch` before certificate authentication.

## PostAuthIdentity

- `versionModel`: model from the bounded version resource.
- `serialOrMacPresent`: at least one supported stable identity value.

Transition: both checks pass to a successful result; otherwise `resource_schema_unconfirmed`.

## HuaweiPollResult

Same existing JSON shape and six resource groups. `vendorPolling.contract` identifies the shared TE30/TE40/TE50/TE60 contract; secrets and raw headers remain excluded.
