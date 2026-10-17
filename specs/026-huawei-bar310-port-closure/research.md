# Research: Huawei Bar 310 management settings

## Evidence

- The official Huawei product/configuration documentation identifies CloudLink Bar 310 and its local web management surface, but does not publish the private internal field contract used by the installed UI.
- Controlled read-only inspection of the connected exact Bar 310 confirmed the existing `/v1/login/*` session, exact pre/post model, stable identity and current bundle.
- The live bundle defines SystemSettingsService `POST /v1/om/config` for reads and `PUT /v1/om/config` for saves.
- The HTTP handler treats a transition from `0` to `1` as unsafe. Live firmware accepted an idempotent `enable_http=0` save and rejected display value `2`, confirming backend semantics `0 = disable`, `1 = enable`.
- Live authenticated read of `enable_http` succeeded and returned `0`. An idempotent save of the same `0` was accepted without changing state; the final action therefore returned `already_compliant` without a write. A historical standalone live read of `enabletelnet` returned exact firmware error `100666097`; TCP/23 was unavailable on that one device. The administrator later confirmed no Telnet control in the web interface, so the current action no longer sends this read.

## Decision

1. Add a Bar-only action contract, preserving existing exact pre/post model and identity checks.
2. Require management-specific bundle markers for config endpoints, fields and PUT semantics.
3. Read only HTTP configuration; do not query Telnet configuration during the action.
4. Report the absence of Telnet web management as `not_exposed` without claiming the network port is closed.
5. Write only HTTP as `CfgItemInt[{enable_http,0}]` and verify by post-read.
6. Never send `enabletelnet` until a real Bar 310 exposes a readable/verifiable field in a separately reviewed contract.
7. Keep Box 310 and Box 610 read-only.

## Rejected alternatives

- Reuse TE payload values: Bar uses a different REST config service and value domain.
- Guess `action.cgi` for both fields: live evidence showed the Bar UI uses `/v1/om/config`; the CGI read did not provide a valid combined schema.
- Write Telnet despite failed read: violates fail-closed and cannot be verified.
- Use TCP listeners as the primary success criterion: product behavior is defined by confirmed menu values, and Telnet is reported separately as unavailable.
