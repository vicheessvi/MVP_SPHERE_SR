# Research: Huawei Box 310 and Box 610 polling

## Decision 1 — Separate contracts, shared guarded core

**Decision**: Keep `huawei_bar310_rest_v1` unchanged externally and add `huawei_box310_rest_v1` plus `huawei_box610_rest_v1`. Share only bounded request/session/projection code.

**Rationale**: Huawei publishes a combined “Box 310, Box 610, and Bar 310 HTTP API Reference Guide” and shared upgrade/license/operation documentation, which supports a common family hypothesis. Bar 310, Box 310 and Box 610 have now each been observed through a successful user-controlled poll, while identity/evidence remains model-specific.

**Alternatives considered**: One three-model contract was rejected because success on one model would obscure evidence provenance. Full code duplication was rejected because it would cause security drift.

## Decision 2 — Runtime-discovered `/v1` compatibility only

**Decision**: Box wrappers may use the Bar 310 `/v1` sequence only when the target root bundle contains the full exact marker set and `/v1/login/device` declares the wrapper's exact model before credentials.

**Rationale**: The manufacturer’s documented external API uses `action.cgi`, while the tested Bar web UI uses a hybrid `/v1` flow. No undocumented fallback is allowed. A Box with only the external API fails safely as `unsupported_web_contract` and can receive a later evidence-based adapter.

## Decision 3 — Provisional result marking

**Decision**: The initial Box results carried `provisional_user_validation`. After separate successful working-computer polls of Box 310 and Box 610, both exact contracts now carry `confirmed_user_validation`, independently of Bar and of each other.

**Rationale**: This permits the user-requested field test without presenting synthetic compatibility as already proven.

## Decision 4 — Exact standard models only

**Decision**: Plan aliases may include `CloudLink` and existing SR spelling `CloudLinc`, but the device must declare exact `Box 310` or `Box 610`. `-S`, `-C`, `-K` variants remain protocol-required.

**Rationale**: Huawei lists variants with different capabilities; product-family naming is not protocol evidence.
