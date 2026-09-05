# Contract: Huawei TE30/TE40/TE50/TE60 legacy web CGI v1

## Target gate

- Category: `vcs`
- Manufacturer: normalized Huawei alias
- Planned model: exact `TE30`, `TE40`, `TE50` or `TE60`
- Transport: HTTPS/443, exact plan IP, existing one-run TLS policy

## Pre-credential sequence

1. Load `/`, `/index.html`, `/hidden_frame.html`, `/login.html`.
2. Validate all known login markers in `/system/login/login.js`.
3. Call `WEB_GetLoginInfo`; reject active sessions.
4. Require a token-boundary match between `szTermType` and the planned model.
5. Call `Web_RequestSessionID`.

No username/password request may occur before step 4 passes.

## Credential and read sequence

Use the existing bounded candidate pool for `Web_RequestCertificate`, call `WEB_ChangeSessionID`, validate `/system/web_all.js`, then request only:

- `WEB_GetProductEsnAPI`
- `WEB_GetSystemMacAddrAPI`
- `WEB_GetVersionInfoAPI`
- `WEB_GetTermSpecsInfoAPI`
- `WEB_GetSysLocalTimeAPI`
- `WEB_GetDhcpIPInfoAPI`

The authenticated version model must contain the same planned model token and identity must contain serial or a valid MAC.

## Failure contract

- Unsupported planned model: `invalid_or_unsupported_target`
- Pre-auth model mismatch/missing type: `target_model_mismatch`
- Post-auth model or identity mismatch: `resource_schema_unconfirmed`
- Unknown bundle/schema, auth, TLS and timeout: existing safe codes

No credential, cookie, CSRF token, Authorization value or raw sensitive response is returned.
