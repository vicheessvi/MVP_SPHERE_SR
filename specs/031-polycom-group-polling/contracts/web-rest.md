# Guarded local web contract: Polycom Group family

## Target and transport

- Explicit allowlisted IPv4 target, HTTPS port 443 only, no redirects to a different host or scheme.
- Default certificate verification. Existing explicit `allowInsecureTls` applies only to the selected run.
- Request timeout bounded by runtime (maximum 30 seconds), response bodies and decompression bounded.
- No HTTP/80, Telnet/24 or SSH/22 fallback.

## Pre-auth gate

1. `GET /` or `/login.html`: require Polycom login page and same-origin login bundle path.
2. Read the current login bundle and require exact markers for `POST /rest/session` action `Login` and `Logout`.
3. If any marker or same-origin constraint fails, do not send credentials.

The exact model cannot be read pre-auth on observed firmware: `GET /rest/system` returned 403. This is a documented limitation, not a reason to guess a model.

## Session and reads

1. `POST /rest/session` with only `action=Login`, the current candidate's user and password. A `success=true` response and bounded same-origin session cookie are required. Candidates are tried in the administrator's entered order; no fallback credential source is used. Administrators should avoid loading many incorrect pairs because the device may lock an account.
2. `GET /index.html`, then its same-origin `main.js?build=<digits>`; require exact resource and MAC variable markers before corresponding reads.
3. `GET /rest/system`: require exact `model = RealPresence Group N`, valid bounded schema and at least serial or later valid MAC.
4. `GET /rest/system/status`, `GET /rest/system/time`, `GET /rest/system/uptime`: accept only bounded, typed read-only values. Failure of optional fields is reported as unavailable, not as zero.
5. `POST /rest/config` with exactly `{"names":["system.network.wired.ethernet.macaddress"]}`; response must contain exactly the requested name and a valid MAC or field is unavailable. `vars` write payloads are forbidden.
6. `POST /rest/session` with only `action=Logout` in all authenticated terminal paths.

## Output and failure

- Never include username, password, cookie, session id, full login/config body, arbitrary status fields or raw exception text.
- Model mismatch, missing stable identity, unknown login/bundle scheme or malformed core system response: unsuccessful result with safe error code.
- Exact Group 310: `confirmed_local_validation`. Exact 300/500/700: `provisional_user_validation` until independent controlled validation.
- Suffix variants and HDX models remain `protocol_required`.
