# Research: Общий опрос Huawei TE30, TE40, TE50 и TE60

## Official family evidence

**Decision**: Treat Huawei's official `TE30, TE40, TE50, TE60, TX50 V600R019C00 HTTP API Programming Reference` as evidence that TE30, TE40, TE50 and TE60 share an HTTP API family and authentication lifecycle.

**Source**: https://support.huawei.com/enterprise/zh/doc/EDOC1100074790/19b69006

**Rationale**: The official document covers all four requested models together and describes `/action.cgi`, session ID request, certificate authentication and session change. This materially supports the hypothesis but does not prove every installed firmware bundle.

## Runtime evidence gate

**Decision**: Before credentials, require the existing login bundle markers and require the pre-auth `szTermType` to contain the planned exact model token. After authentication, require the version resource to contain the same token plus serial or valid MAC.

**Rationale**: A catalog label alone is not evidence. The double check prevents accidental credential submission to a different model and rejects firmware/schema drift.

## Supported scope

**Decision**: Enable only TE30, TE40, TE50 and TE60. Keep TE20, TX50 and all other Huawei models in the existing `protocol_required` fallback.

**Alternatives considered**: Enabling the entire officially documented family was rejected because the user did not request TX50. Copying the TE40 adapter per model was rejected because it would duplicate one hypothesized common contract.

## Live confirmation

**Decision**: Mark compatibility as provisionally enabled behind runtime fingerprinting until real TE30, TE50 and TE60 addresses from current SR are polled and their redacted JSON is reviewed.

**Rationale**: Synthetic tests prove control flow and safety, not the exact firmware installed on the user's terminals.
