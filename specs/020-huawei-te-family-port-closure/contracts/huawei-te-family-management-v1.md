# Contract: Huawei TE30/TE40/TE50/TE60 disable insecure management services

## Preconditions

1. Target exact IP belongs to the plan allowlist and separate port-closure list.
2. Planned, pre-auth and post-auth model is the same exact member of TE30/TE40/TE50/TE60.
3. Identity is confirmed by serial or valid MAC.
4. Current bundle contains all required action/config markers.
5. Current values of both allowed fields are read with the expected schema.

## Operations

1. Read `enabletelnet` and `enable_http` with `WEB_GetCfgParamAPI`.
2. If needed, call one `WEB_SaveCfgParamAPI` containing only `enabletelnet=0` and `enable_http=1`.
3. Re-read both values in the same HTTPS session.

Any other config ID is forbidden. Successful save without successful post-read is failure. TCP listener state is outside this contract.
