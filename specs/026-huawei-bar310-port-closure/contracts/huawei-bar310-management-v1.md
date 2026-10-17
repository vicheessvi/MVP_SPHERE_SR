# Contract: Huawei Bar 310 management v1

## Eligibility gates

1. The plan explicitly selects `disable_insecure_management_services`.
2. Catalog resolves exact Bar 310 through `huawei_bar310_rest_v1`.
3. Current bundle passes the existing login/resource markers and management-specific config markers.
4. Pre-auth `licenseEquipName` and post-auth `terminalType` are exact `Bar 310`.
5. SN/ESN or a valid device MAC provides stable identity.

## Operation

1. `POST /v1/om/config` with `{"CfgIDString":["enable_http"]}`.
2. Continue only when HTTP is an integer in `{0,1}`. No Telnet configuration read or write is made; the exact Bar model reports `not_exposed` for web management of Telnet.
3. If HTTP is not `0`, send one `PUT /v1/om/config` containing exactly:

```json
{"CfgItemInt":[{"CfgItemID":"enable_http","CfgItemInfo":0}],"CfgItemString":[]}
```

4. Repeat step 1. Success requires `enable_http=0`.
5. Logout and clear in-memory cookie/token on every terminal path.

## Forbidden behavior

- No `enabletelnet` read or write. `not_exposed` does not claim that TCP/23 was measured or closed.
- No HTTP fallback, guessed endpoint, full-form save or additional config ID.
- No Box 310/610 eligibility.
- No raw response, credential, cookie or token in output.
