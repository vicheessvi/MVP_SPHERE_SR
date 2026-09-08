# Contract: huawei-te20-web-cgi-v1

1. Exact target is `vcs / Huawei / TE20` from the immutable plan.
2. Connect to exact IP on HTTPS/443 with TLS 1.1 min=max; certificate bypass is per-run opt-in only.
3. Load `/`, `/index.html`, `/hidden_frame.html`, `/login.html`, `/system/login/login.js` within existing bounds.
4. Require the four known login action markers.
5. `WEB_GetLoginInfo` must report no active session and exact legacy numeric schema.
6. Run `Web_RequestSessionID`, try the in-memory XLSX pool, obtain CSRF through `Web_RequestCertificate`, then `WEB_ChangeSessionID`.
7. Load bounded `/system/web_all.js` and read only product ESN, system MAC, version, term specs, local time and DHCP info actions.
8. Require exact TE20 in version and serial or valid MAC.
9. Sanitize and return the standard JSON projection. Never execute management actions.
