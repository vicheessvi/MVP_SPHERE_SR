# Research: Huawei TE40 polling

## Decision 1 — Evidence source and contract boundary

**Decision**: Treat a reproducible inspection of the target TE40 web bundle and responses on 2026-09-03 as the evidence source for contract v1. Require the login bundle markers `WEB_GetLoginInfo`, `Web_RequestSessionID`, `Web_RequestCertificate` and `WEB_ChangeSessionID` before sending credentials. Require the authenticated bundle marker `WEB_GetSystemMacAddrAPI` before collecting resources.

**Rationale**: The installed firmware exposes its own request sequence and exact action names. Marker validation prevents credentials from being sent to an unrelated HTTPS service at the plan IP and prevents guessed vendor behavior.

**Alternatives considered**: Product-name heuristics were rejected because they do not prove transport or authentication. Internet examples were rejected because they may describe a different firmware generation.

## Decision 2 — Transport and TLS policy

**Decision**: Use HTTPS on port 443 only. Default certificate verification remains strict. When the plan explicitly enables insecure TLS for the target, allow the observed TLS 1.2 legacy-server handshake and self-signed certificate only for that exact connection. Do not fall back to HTTP.

**Rationale**: The device redirects logical web actions to HTTPS and the observed firmware negotiates TLS 1.2 with a legacy cipher profile. Scoping the exception to an explicit target preserves the existing security boundary.

**Alternatives considered**: Plain HTTP was rejected because the login action refuses it. Global certificate or OS policy changes were rejected because they affect unrelated traffic.

## Decision 3 — Browser-compatible authentication

**Decision**: Warm the same four static pages used by the legacy frame UI, retain Set-Cookie values only in memory, then perform the four POST actions in order. Use browser-equivalent `Origin`, `Referer`, `X-Requested-With` and `userType` headers. Send the credentials only in the certificate action. Add the returned CSRF token to every later JSON request.

**Rationale**: The workbook pair is accepted when the initialization, cookie and XHR context are present. A bare certificate POST is rejected even with otherwise valid credentials.

**Alternatives considered**: Basic authentication and direct action calls were rejected by observed responses. Browser automation was rejected for production because the existing Python runtime must operate without controlling or storing a browser profile.

## Decision 4 — Read-only resource allowlist

**Decision**: Contract v1 permits only these observed POST actions after login: `WEB_GetProductEsnAPI`, `WEB_GetSystemMacAddrAPI`, `WEB_GetVersionInfoAPI`, `WEB_GetTermSpecsInfoAPI`, `WEB_GetSysLocalTimeAPI` and `WEB_GetDhcpIPInfoAPI`.

**Rationale**: Each action exists in the authenticated firmware bundle, returns `success = 1` with the documented inner keys and has read-only naming/use in that bundle. The set covers identity, firmware, capabilities, device time and network data without configuration changes.

**Alternatives considered**: Polling every discovered `WEB_Get*` action was rejected because discovery alone does not prove safe semantics or bounded response size. Configuration, mailbox, call-state and update actions are outside the first scope.

## Decision 5 — Response schema and projection

**Decision**: Accept only an outer JSON object with integer `success` and JSON-encoded `data`. Validate each action against a bounded set of expected keys and primitive/container types. Preserve vendor spelling inside `rawResources`; expose a compact `webBlocks` projection for existing analytics. A successful snapshot requires a non-empty product ESN or at least one syntactically valid MAC plus a recognized model/version response.

**Rationale**: Exact shape validation makes firmware drift explicit. Keeping vendor fields available supports later analysis without guessing their meaning, while the projection provides current UI compatibility.

**Alternatives considered**: Returning only raw bodies was rejected because it risks unbounded and sensitive content. Treating any HTTP 200 as success was rejected because the CGI reports application errors inside JSON.

## Decision 6 — Model-specific catalog routing

**Decision**: Split Huawei TE40 into a supported model-specific catalog entry and retain a manufacturer fallback containing all other known Huawei models as `protocol_required`. Resolver order becomes exact model match first, then fail-closed manufacturer fallback.

**Rationale**: The current catalog has one entry per manufacturer and would otherwise enable an evidenced TE40 transport for unevidenced models.

**Alternatives considered**: Enabling the whole Huawei entry was rejected as unsafe. Letting the adapter reject other models after plan construction was rejected because it would still mark them supported and allow unnecessary network/credential activity.

## Decision 7 — Tests and live evidence handling

**Decision**: Store only synthetic device responses in tests. Cover exact request order, headers, TLS flag, cookies, CSRF insertion, auth failure, active session, unknown bundle, malformed/oversized response, partial optional resource failure and redaction. Keep the live probe and all real values outside Git.

**Rationale**: Synthetic fixtures are deterministic and respect the constitution rule that real infrastructure data never enters repository history.

**Alternatives considered**: Recording a real HTTP transcript was rejected because it would contain sensitive identifiers and session material.
