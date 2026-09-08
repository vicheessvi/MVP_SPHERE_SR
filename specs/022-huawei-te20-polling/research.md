# Research: Huawei TE20 polling

Controlled device evidence established that TE20 accepts HTTPS only with an exact TLS 1.1 profile, exposes the same four login actions, and returns `ucTerType`/`ucCustomType` instead of pre-auth `szTermType`. Unauthenticated version, serial and MAC actions are denied. After one credential attempt the version resource reports Huawei TE20, identity is available, and all six existing read-only resource schemas match TE30–TE60.

Decision: register a separate TE20 transport while reusing the bounded login/resource implementation. This isolates deprecated TLS and the weaker pre-auth evidence from TE30–TE60. Exact model and identity remain mandatory immediately after authentication. Port-closure capability is not extended.
