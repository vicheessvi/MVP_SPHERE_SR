# Research: Huawei TE20 port closure

## Decision: reuse the existing management action

The controlled TE20 session exposed all four required bundle markers, returned both management parameters in the expected binary schema, and accepted a minimal payload. A later observation of the real codec menu showed that the TE30–TE60 HTTP value had been interpreted incorrectly for TE20. The existing read/write/re-read implementation is retained, but target values and state interpretation are now selected by exact model.

Alternatives considered:

- A new TE20 write adapter would duplicate identical action names and result logic while increasing drift risk; only the model-specific target map differs.
- Leaving TE20 read-only would contradict the confirmed device evidence and requested workflow.
- Enabling an insecure service before the test remains rejected. Correctness is established by writing only the model-specific disable values and re-reading the menu state.

## Decision: retain the TE20 transport boundary

TE20 continues to use `huawei_te20_web_cgi_v1` and its exact TLS 1.1 profile. The management capability resolves to that same transport for TE20; TE30/TE40/TE50/TE60 continue using `huawei_te_web_cgi_v1`.

Rationale: write compatibility does not erase the material TLS and pre-auth differences already documented for TE20.

Alternative considered: moving TE20 into the family transport was rejected because it would broaden legacy TLS and weaken exact pre-auth contract separation.

## Decision: preserve all existing safety gates

The action executes only after immutable exact-IP routing, explicit task opt-in, exact planned TE20, confirmed legacy pre-auth schema, exact post-auth TE20, serial-or-valid-MAC identity, current bundle markers and exact configuration schema. Follow-up observation of the real TE20 menu showed that the inherited TE30–TE60 HTTP target left HTTP enabled. The TE20-only safe targets are therefore `enabletelnet=0` and `enable_http=0`; success requires post-read equality. TE30/TE40/TE50/TE60 retain their separate confirmed `enable_http=1` target.

Rationale: model-name compatibility alone is insufficient authority for a configuration change.

Alternative considered: trusting a successful save response was rejected because it cannot prove that the menu state changed.

## Controlled evidence boundary

On 2026-09-08 a real TE20 was tested through the existing credential-pool and HTTPS session flow. A first probe blocked the save request and confirmed that both current menu values were already safe. A second controlled probe sent exactly one minimal safe save and performed two configuration reads. The final read confirmed HTTP and Telnet disabled. No insecure value was sent, and no credential, target address, MAC, serial or raw response is retained in the repository.
