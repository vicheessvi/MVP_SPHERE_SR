# Research: Huawei Bar 310 polling

## Decision 1 — Treat Bar 310 as a separate contract family

**Decision**: Register a dedicated `huawei_bar310_rest_v1` transport for exact Bar 310 model aliases. Do not add Bar 310 to the TE30/TE40/TE50/TE60 CGI transport.

**Rationale**: A controlled read-only inspection on 2026-09-19 showed a React web shell and `/v1/...` resources rather than the TE-family `/system/login/login.js` plus `WEB_Get*API` resource flow. Huawei's official Bar 310 documentation confirms that Bar 310 is a distinct HarmonyOS integrated endpoint with its own web configuration interface: <https://support.huawei.com/enterprise/en/doc/EDOC1100420388/7ae45faa/before-you-start> and <https://e.huawei.com/cn/products/enterprise-collaboration/cloudlink/cloudlink-bar-310>.

**Alternatives considered**:

- Extend the TE adapter based on vendor name: rejected because endpoint and schema evidence are different.
- Leave the model `protocol_required`: rejected because exact transport, authentication and read-only responses were reproduced on the user-authorized device.

## Decision 2 — Exact model gate before credentials

**Decision**: Require a successful bounded GET of `/v1/login/device`, decode its nested JSON `data`, and require `licenseEquipName == "Bar 310"` before opening the credential loop. The main same-origin JavaScript bundle must also contain all exact login and resource path markers.

**Rationale**: The endpoint disclosed the exact model without credentials. Combining exact model and bundle markers provides a stronger fail-closed gate than the plan label alone.

**Alternatives considered**:

- Trust only the SR model: rejected because an incorrect IP could expose credentials to another appliance.
- Infer compatibility from an image or page title: rejected because presentation assets are not protocol evidence.

## Decision 3 — Reproduce the browser login sequence

**Decision**: Use HTTPS/443 and one ephemeral cookie jar: GET device evidence, POST JSON `null` to `/v1/login/session`, POST one `{account,password}` candidate at a time to `/v1/login/account`, require `acCSRFToken`, then POST JSON `null` to `/action.cgi?ActionID=WEB_ChangeSessionID` with `X-Access-Token`. After collection, DELETE `/v1/login/session` best-effort.

**Rationale**: This is the exact sequence and header named by the loaded web bundle and confirmed by one controlled successful login. The XLSX contained one accepted row; no value, token, cookie or raw response was retained.

**Alternatives considered**:

- Basic or Digest authentication: rejected because the device UI does not use either.
- Encrypt credentials in JavaScript before HTTPS: rejected because the device UI posts the JSON fields directly inside TLS.
- HTTP fallback: rejected because the observed UI enforces HTTPS and local security policy forbids a silent downgrade.

## Decision 4 — Fixed read-only allowlist

**Decision**: Collect only:

- `/v1/om/version`
- `/v1/om/version/specification`
- `/v1/om/config/systemtime`
- `/v1/om/license`
- `/v1/om/device/status`

Every request is GET with `X-Access-Token`; each envelope and field set is bounded and type-checked.

**Rationale**: These five requests were present in the same-origin bundle and returned sufficient exact model, SN/ESN, MAC, firmware, local time, uptime, sleep state and licensed capability evidence. An observed DHCP endpoint returned an application error for the tested static configuration, so it is excluded from the required v1 contract rather than guessed around.

**Alternatives considered**:

- Store the electronic-label text: rejected because its internal unstructured content is unnecessary for stable identity and would expand sensitive output.
- Query all `/v1/om/config` values: rejected because it is broad, unnecessary and may expose unrelated secrets.

## Decision 5 — Success and drift gates

**Decision**: Require post-auth `terminalType == "Bar 310"` and at least one stable identity: non-empty SN/ESN or a valid MAC. Missing optional fields become per-resource diagnostics; missing model/identity or a changed required envelope fails `resource_schema_unconfirmed`.

**Rationale**: This blocks catalog/IP mistakes and firmware drift without turning a partial optional response into false deletion or false success.

## Decision 6 — Security and test evidence

**Decision**: Store only synthetic responses in tests. Cover model-before-credentials, row-order authorization, cookie/token handling, GET-only resource allowlist, best-effort logout, auth rejection, bundle/schema drift, TLS/timeout/oversize mapping and secret redaction. Remove the temporary live probe before final scan.

**Rationale**: It satisfies the local-only and evidence-review rules while keeping all real IP, identity values, credentials and response bodies out of Git.
