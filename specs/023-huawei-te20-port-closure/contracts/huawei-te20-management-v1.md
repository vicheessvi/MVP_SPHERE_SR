# Contract: Huawei TE20 disable insecure management services

## Preconditions

1. Exact target belongs to the immutable plan allowlist and the separate port-closure list.
2. The selected action is exactly `disable_insecure_management_services`.
3. The device resolves to exact `vcs / Huawei / TE20` and uses `huawei_te20_web_cgi_v1`.
4. TE20-specific legacy pre-auth evidence is confirmed before credentials.
5. Post-auth version contains exact TE20 and identity is confirmed by serial or valid MAC.
6. The current authenticated bundle contains `WEB_GetCfgParamAPI`, `WEB_SaveCfgParamAPI`, `enabletelnet` and `enable_http`.
7. Both current config values are read with the exact supported schema.

## Operations

1. Read `enabletelnet` and `enable_http` through `WEB_GetCfgParamAPI` in the authenticated TE20 HTTPS session.
2. If both values already equal their safe targets, return `already_compliant` without a save.
3. Otherwise call `WEB_SaveCfgParamAPI` exactly once with:
   - `enabletelnet=0`;
   - `enable_http=0`;
   - the current in-memory CSRF token required by the session.
4. Re-read both values through the same configuration action.
5. Return success only when the post-read exactly confirms both safe targets.

Any other configuration identifier is forbidden. A successful save envelope without a successful post-read is failure. TCP listener probing is outside the result contract. TE20 keeps its exact TLS 1.1 transport profile and per-run certificate opt-in.

## Safe result

The result exposes only the action ID, status, transport label, `changed`, `writeAttempted`, safe before/after service states and an optional normalized safe error. It does not expose credentials, cookies, CSRF, request payloads or raw response bodies.
