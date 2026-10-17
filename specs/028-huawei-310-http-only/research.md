# Research: Huawei 310-family HTTP-only management

**Date**: 2026-10-17

## Confirmed

- The administrator reports that the web interfaces of exact Bar 310, Box 310 and Box 610 have no visible Telnet control. Treat this as absence of a web-management option, not as proof about TCP/23 on every firmware.
- [Prior controlled Bar 310 research](../026-huawei-bar310-port-closure/research.md) established the exact Bar HTTP backend value `enable_http=0`, safe reads, an idempotent accepted save and `already_compliant` result on the tested device. This does not establish the Box value meaning.
- A Huawei-authored 310-family HTTP API guide (22.2.2, [available copy](https://us.v-cdn.net/6031006/uploads/editor/9a/ee7mcw7tnddt.pdf)) describes the general `POST/PUT /v1/om/config` mechanism for Bar/Box. It does not confirm `enable_http=0` for either Box model in the reviewed material.
- The administrator explicitly confirmed that `enable_http=0` means disabled on exact Box 310 and Box 610 as on Bar 310. This is model-specific user evidence for the target value, not a substitute for checking each current firmware's bundle and response shape at runtime.
- A Huawei-branded [Box 310/610 brochure](https://vsharesoft.com/uploads/soft/20230922/1-2309221K4303B.pdf) lists Telnet among network protocols. It does not establish that TCP/23 listens on current devices, but prevents a universal claim that the protocol is absent from every Box firmware.

## Decision

The user-facing result may say “управление Telnet отсутствует; настройка не изменялась” for exact 310 models. It must not say the tool closed TCP/23. The Bar-only Telnet configuration read has been removed. Build separate guarded Box 310/610 HTTP-only action contracts around the administrator-confirmed value `0`: require exact model/identity and matching current bundle markers, accept only the expected `{0,1}` configuration schema, send at most one minimal PUT when current value is `1`, and require post-read `0`. A current firmware that fails any gate makes no write. Label Box action validation provisional until controlled live results arrive.

## Evidence still required per Box model

1. A controlled read-only session on an exact Box 310 and an exact Box 610, confirming pre/post-auth model, stable identity, firmware and current web-bundle markers.
2. A redacted response shape for a read of the HTTP configuration field on each Box model, to validate the guarded schema before a write.
3. A controlled minimal save/post-read test before declaring the corresponding Box write contract confirmed. Never enable HTTP merely to create a test condition.

## Alternatives considered

- Unconditionally copy the Bar 310 workflow to both Box models: rejected; even with the user-confirmed value, exact current firmware and response schema must be checked before a write.
- Infer Telnet service state from missing web controls: rejected; UI absence is not a TCP listener test, and Huawei's Box brochure lists the protocol.
- Leave Telnet management unchanged and label it explicitly: accepted until stronger per-model evidence is available.
