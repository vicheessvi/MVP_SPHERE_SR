# Contract: Huawei TE40 legacy web CGI v1

## Scope

Read-only automatic polling for exact model Huawei TE40 through the web contract evidenced from the device firmware bundle. Synthetic host examples use documentation-only addresses.

## Transport

- Scheme/port: `https://<exact-plan-ip>:443`.
- Timeout: bounded per request, default 8 seconds.
- Response bounds: 8 MiB for static bundle, 1 MiB for each CGI response. The bound covers the reproducibly observed 7,163,568-byte firmware bundle without allowing unbounded reads.
- TLS verification: strict unless the plan explicitly enables target-scoped insecure TLS.
- No redirect to a different host, no DNS target, no HTTP fallback.

## Pre-authentication evidence

The client loads `/`, `/index.html`, `/hidden_frame.html`, `/login.html` and `/system/login/login.js`. The login bundle must contain all four markers:

- `WEB_GetLoginInfo`
- `Web_RequestSessionID`
- `Web_RequestCertificate`
- `WEB_ChangeSessionID`

Failure returns `unsupported_web_contract` before credential transmission.

## Authentication sequence

All actions are POST requests under `/action.cgi?ActionID=<action>?rmd=<nonce>` with same-origin `Origin`/`Referer`, XHR and `userType: web` headers.

1. `WEB_GetLoginInfo`, empty body. `AlreadyLogin == 1` returns `interactive_session_active`; the adapter does not log out another session.
2. `Web_RequestSessionID`, empty body.
3. `Web_RequestCertificate`, JSON body containing only `user` and `password` from one memory-only candidate.
4. Require non-empty `acCSRFToken` in decoded response data.
5. `WEB_ChangeSessionID`, empty body.

The cookie jar, credentials and CSRF token are adapter-local and omitted from every result and diagnostic.

## Envelope

Expected outer response:

```json
{"success": 1, "data": "{\"syntheticKey\":\"syntheticValue\"}"}
```

`data` must be valid JSON. `success: 0` with an exception is mapped to a stable safe error without retaining the response body.

## Authenticated request body

Every read-only action receives a JSON object containing `acCSRFToken`. No other field is added unless explicitly defined by a later contract version.

## Read-only actions and minimum shape

| Resource key | Action | Expected inner keys |
|---|---|---|
| `productEsn` | `WEB_GetProductEsnAPI` | `product_esn: string` |
| `systemMac` | `WEB_GetSystemMacAddrAPI` | `system_wanMAC_addr: string`, `system_lanMAC_addr: string` |
| `versionInfo` | `WEB_GetVersionInfoAPI` | `model`, `softVersion`, `hardVersion`, `logicVersion`; optional `micVersion`, `inCamVersion` |
| `termSpecs` | `WEB_GetTermSpecsInfoAPI` | bounded primitive capability fields such as `audioProtocol`, `videoProtocol`, `ipSpeed`, `maxEnc`, `maxDec` |
| `localTime` | `WEB_GetSysLocalTimeAPI` | integer `year`, `month`, `day`, `hour`, `minute`, `second`; optional daylight fields |
| `dhcpInfo` | `WEB_GetDhcpIPInfoAPI` | IPv4 address, mask and gateway strings; optional IPv6 fields |

Before these actions the authenticated `/system/web_all.js` must contain their exact markers. Missing optional action evidence omits that action; missing identity/version evidence fails the contract.

## Safe errors

- `tls_certificate_rejected`
- `tls_handshake_failed`
- `request_timeout`
- `response_too_large`
- `unsupported_web_contract`
- `interactive_session_active`
- `authorization_failed`
- `csrf_token_missing`
- `resource_envelope_invalid`
- `resource_schema_unconfirmed`

No safe error contains headers, cookies, tokens, credential values or raw response bodies.
