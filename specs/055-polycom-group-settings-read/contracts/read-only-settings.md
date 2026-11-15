# Read-only settings contract

Production route: existing exact Group 300/310/500/700 HTTPS adapter. Only after current login/main bundle gates, successful session, exact post-auth model and serial/MAC may it issue bounded `POST /rest/config` requests with a single `names` entry. Each `vars` response must contain exactly one object with the requested exact name; unrelated keys or malformed responses reject that field. Current bundle must contain both the field-to-constant mapping and FQ-name definition. No GET-all/config dump or write action is allowed.

| Field | Narrow FQ name(s) from current Group 310 bundle | Expected raw shape |
|---|---|---|
| Telnet | `security.remoteaccess.telnet.enabled` | string boolean |
| HTTP | `security.remoteaccess.web.enabled`, `security.remoteaccess.web.httpsonly`, `security.remoteaccess.web.httpport` | two string booleans and bounded numeric port; HTTP allowed only when Web Access is enabled and HTTPS-only is disabled |
| SNMPv2 | `management.snmp.enabled`, `management.snmp.versiontwo` | two independent string booleans |
| Auto-update | `softupdate.pollingenabled` | string boolean |
| Auto-answer | `comm.callsetting.callfeatures.autoanswer.answersinglecall`, `...answermultipointcall` | independent `Yes/No` strings |
| NTP | `time.timeserver.mode`, `time.timeserver.address`, `time.timeserver.address1` | bounded strings; second address uses bundle-confirmed instance 1 |
| Wi-Fi | no menu exposure in these exact models | `not_exposed` only |
| SSH | `security.remoteaccess.ssh.enabled` | string boolean for `Enable Legacy API Over SSH` only; SSH service state stays unknown |
| Power | `system.remote.hangupkeylongpressfunc` | bounded action code; no sleep inference |

An absent bundle marker gives `protocol_required`. A failed or malformed read gives `unavailable` for that field only. Unknown enum code is not translated to enabled/disabled. Sensitive neighboring config names are excluded from requests and all outputs. After separate administrator validation, new successful exact Group 300/310/500/700 results carry `confirmed_user_validation`; previously imported provisional files remain provisional. Group 300 has no HTTP credential fallback, and a confirmed device does not prove compatibility with its older HTTPS-incompatible firmware. No claim is made about TCP listener state.
