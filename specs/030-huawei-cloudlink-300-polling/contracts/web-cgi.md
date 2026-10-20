# Guarded 300-family web-CGI contract

- Transport: HTTPS/443 to the exact plan IP, existing per-run TLS opt-in, bounded timeout/response; no HTTP fallback.
- Pre-auth: current root and `/static/js/main.chunk.js` must contain the known login/read markers and exact `UI_TERM_*` numeric mapping; `WEB_GetLoginInfo` must return `AlreadyLogin=0`, matching `ucTerType`, `ucCustomType=0` and a valid legacy envelope before credentials.
- Authentication: fixed session request → certificate exchange using the entered pairs in order → session change. Cookies/CSRF remain in process memory; no response exposes them.
- Post-auth: fixed reads `WEB_GetVersionInfoAPI`, `WEB_GetProductEsnAPI`, `WEB_GetSystemMacAddrAPI`, `WEB_GetTermSpecsInfoAPI`, `WEB_GetSysLocalTimeAPI`, `WEB_GetDhcpIPInfoAPI`; exact model plus serial or valid MAC required.
- Site name: only `WEB_GetCfgParamAPI` with `CfgIDString:["sitename"]`; accept only a bounded string `data.sitename` and label source. No setting is saved or modified.
- Allowed methods: GET for static pages/bundle, POST for the fixed login/session and read actions, optional POST logout. No PUT/DELETE/configuration-save action.
- Failure: unknown bundle/model/schema, missing identity, auth failure or timeout yields safe status; no guessed alternate endpoint and no automatic credential retries outside the entered pool.
