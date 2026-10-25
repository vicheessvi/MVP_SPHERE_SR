# Research: Polycom RealPresence Group polling

## Decision 1 — Management transport

**Decision**: Use the observed HTTPS web interface on port 443 for this tool. Do not use HTTP/80, Telnet/24 or SSH/22 in the production adapter.

**Rationale**: The [official Group Series Integrator Reference Guide 6.2.2](https://kaas.hpcloud.hp.com/pdf-public/pdf_9121586_en-US-1.pdf) documents Group-family command API over Telnet/24 and SSH/22. Telnet exposes credentials, while the project production runtime cannot depend on an SSH package or external executable. The connected 310 exposes a working HTTPS web session and narrow read endpoints with Python standard-library transport. The same official guide documents `serialnum`, `uptime get`, `version`, `systemname get` and exact model retrieval, supporting the family's common information model but not proving identical web endpoints on every firmware.

**Alternatives considered**: Telnet rejected for credentials exposure; SSH deferred because a portable stdlib SSH client is unavailable; browser-only manual extraction rejected for mass polling.

## Decision 2 — Observed Group 310 web contract

**Decision**: Gate the current Polycom login page/bundle before credentials; perform one bounded `POST /rest/session` Login; read `GET /rest/system`, `GET /rest/system/status`, `GET /rest/system/time`, `GET /rest/system/uptime`; after exact model verification, read only the wired MAC config variable with `POST /rest/config` `{"names":["system.network.wired.ethernet.macaddress"]}`; always attempt `POST /rest/session` Logout.

**Rationale**: Controlled local read-only investigation of the connected Group 310 showed these exact methods in the current web bundles and confirmed their response shapes. `/rest/system` exposed model, serial, software version, system name, device state/time and uptime; the narrow config query returned one named variable. No raw response, target IP, credential or session token was committed. The observed model string was `RealPresence Group 310` on software family 6.2.1. Unauthenticated `/rest/system` returned 403, so exact model cannot be checked before login.

**Alternatives considered**: Broad `/rest/config` read rejected due possible passwords; invented model-specific endpoints rejected; optional management tasks rejected because this feature is read-only.

The implemented guarded adapter was then run in memory against the connected 310. Exact model, serial, MAC and firmware checks passed; 13 bounded status entries were accepted after accommodating the observed list-valued `state` field; all resource reads and logout completed without reported error. This records only contract outcomes, not device data.

## Decision 3 — Four-model safety boundary

**Decision**: Four exact model descriptors may share the transport, but only the 310 is `confirmed_local_validation`; 300/500/700 are `provisional_user_validation` pending real-device checks. Fail closed on login marker, model, identity, response schema or allowed resource drift. Other Polycom models remain `protocol_required`.

**Rationale**: The official guide covers all four Group models, but current live web evidence covers only the 310. Model number alone cannot prove firmware compatibility.

**Alternatives considered**: Claiming all four tested rejected; keeping the other three permanently unsupported would not prepare them for the administrator's requested trials.

## Decision 4 — Sensitive data boundary

**Decision**: Never persist or echo credentials, cookies, login bodies or broad config responses. Keep only selected whitelist fields and redacted error codes. Default to certificate validation; use the existing explicit per-run self-signed-certificate option only when needed.

**Rationale**: Local-only protection and constitution 3.2.0 require ephemeral secrets and source-backed, bounded results. The live test required unverified TLS because the device certificate was not trusted by the host; that does not become a silent global default.
