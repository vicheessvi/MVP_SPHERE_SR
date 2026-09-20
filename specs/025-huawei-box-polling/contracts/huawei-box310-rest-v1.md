# Contract: `huawei_box310_rest_v1`

- Plan models: `Box 310`, `CloudLink Box 310`, `CloudLinc Box 310`.
- Device-side model before and after credentials: exact `Box 310`.
- Transport: HTTPS/443 only; no HTTP fallback.
- Compatibility discovery: one bounded same-origin main bundle with the complete Bar/Box `/v1` marker set.
- Authentication: ephemeral session/account, `X-Access-Token`, session change; credentials top-to-bottom.
- Read allowlist: version, specification, system time, license, device status.
- Success: exact post-auth model plus SN/ESN or valid MAC and compatible schemas.
- Output: common five `webBlocks`; `evidenceStatus = provisional_user_validation`.
- Writes and management actions: forbidden.

If any path or schema differs on the real device, the contract MUST fail closed and MUST NOT invent or probe additional authenticated endpoints.
