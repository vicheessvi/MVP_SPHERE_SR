# Research

## Live Bar 300 evidence (controlled read-only session, 2026-10-20)

**Decision**: Use a distinct legacy CGI transport, not the 310 REST transport.
**Rationale**: The selected Bar 300 returned a 200 web page with `static/js/main.chunk.js`. Its current bundle contains `WEB_GetLoginInfo`, session/certificate actions, the six existing Huawei read actions and `WEB_GetCfgParamAPI`; it lacks the 310 `/v1/login/*` and `/v1/om/*` endpoints. The bundle maps `UI_TERM_BAR300:18`, `UI_TERM_BOX300:19`, `UI_TERM_BOX600:22`. Pre-auth login info reported model code 18 and no active session. Controlled credential entry succeeded without logging secrets. Post-auth version identified exact Bar 300, serial/MAC were present, and six read-only resources responded. The web UI's `getSiteNameConfigs` sends `CfgIDString:["sitename"]` to `WEB_GetCfgParamAPI`; a bounded read returned a string value. The actual IP, credentials and returned values were not written to the repository.

**Alternative**: Reusing 310 REST would call nonexistent endpoints and risk credential exposure. Assuming TE20 pre-auth type 0 would reject this model or route incorrectly.

## Box 300 and Box 600

**Decision**: Share the CGI implementation only under separate exact-model gates, with provisional live-validation status.
**Rationale**: The observed Bar 300 bundle names the two Box model codes. [Huawei firmware guidance](https://support.huaweicloud.com/intl/en-us/meeting_faq/equip_ver.html) and the [shared Bar/Box software branch](https://support.huawei.com/enterprise/en/intelligent-collaboration/cloudlink-bar-300-pid-22666157/software/261809000) support product-line relatedness but do not prove each Box firmware's API. Therefore the adapter must inspect each Box's own bundle and pre-/post-auth identity; model drift fails closed.

**Alternative**: Treating all Box variants as Bar 300 is not acceptable. Keeping them unsupported would not meet the user's requested testable rollout, but exact guarded attempts are safe.

**Validation update (2026-10-20)**: The administrator independently reported successful JSON reports for exact Box 300 and Box 600 and confirmed that `siteName.value` matches the Site name shown in each device menu. The two model contracts now use `confirmed_user_validation`; the original pre-/post-auth gates and firmware drift behavior remain unchanged. No raw results were copied into Git.

## Site name and result

**Decision**: Read the configuration field directly through the model's current bundle-confirmed `WEB_GetCfgParamAPI`, and include it in `siteName.value` plus Device Info when valid.
**Rationale**: The device's own UI code and live response confirm this exact read path. Huawei's [CloudLink web instructions](https://support.huaweicloud.com/intl/en-us/usermanual-meeting/web_box.html) identify Site name as the endpoint's own name.
**Alternative**: The mailbox `sitename` path is not required for this firmware, and SR location name is not equivalent.
