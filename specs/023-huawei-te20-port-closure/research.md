# Research: Huawei TE20 port closure

## Decision: reuse the existing management action

The controlled TE20 session exposed all four required bundle markers, returned both management parameters in the expected binary schema, accepted the same minimal safe payload, and returned both safe values on the post-read. The existing read/write/re-read implementation is therefore reused instead of creating a second TE20-specific write function.

Alternatives considered:

- A new TE20 write adapter would duplicate identical action names, payload and result logic while increasing drift risk.
- Leaving TE20 read-only would contradict the confirmed device evidence and requested workflow.
- Enabling an insecure service before the test was rejected. The device was already safe, so the write evidence was produced by idempotently re-sending only safe values.

## Decision: retain the TE20 transport boundary

TE20 continues to use `huawei_te20_web_cgi_v1` and its exact TLS 1.1 profile. The management capability resolves to that same transport for TE20; TE30/TE40/TE50/TE60 continue using `huawei_te_web_cgi_v1`.

Rationale: write compatibility does not erase the material TLS and pre-auth differences already documented for TE20.

Alternative considered: moving TE20 into the family transport was rejected because it would broaden legacy TLS and weaken exact pre-auth contract separation.

## Decision: preserve all existing safety gates

The action executes only after immutable exact-IP routing, explicit task opt-in, exact planned TE20, confirmed legacy pre-auth schema, exact post-auth TE20, serial-or-valid-MAC identity, current bundle markers and exact configuration schema. The only allowed target values remain `enabletelnet=0` and `enable_http=1`; success requires post-read equality.

Rationale: model-name compatibility alone is insufficient authority for a configuration change.

Alternative considered: trusting a successful save response was rejected because it cannot prove that the menu state changed.

## Controlled evidence boundary

On 2026-09-08 a real TE20 was tested through the existing credential-pool and HTTPS session flow. A first probe blocked the save request and confirmed that both current menu values were already safe. A second controlled probe sent exactly one minimal safe save and performed two configuration reads. The final read confirmed HTTP and Telnet disabled. No insecure value was sent, and no credential, target address, MAC, serial or raw response is retained in the repository.
