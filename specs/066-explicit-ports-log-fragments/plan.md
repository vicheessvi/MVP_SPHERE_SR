# Plan

## Design

Retire only global disable_insecure_management_services at plan/probe/launch/
resume guards; retain historical ID readers and existing private adapter evidence.
Remove UI control/counters and current plan summary port capability fields; no
default source/action derivation from legacy checkbox. Keep independent TE20 IDs
and single-target restrictions. Old report/journal may be inspected, not replayed
as bulk. User's port states are never automatically restored or toggled.

Huawei File scanners keep the same bounded line/event grammar and EOF checks as
metadata: ok=true means full successful byte-read/known log parsing, NOT complete
XML. sourceCompleteness=complete|fragment records that distinction. Accepted
records are unchanged; incomplete envelope is warning, not throwing away valid
events. Failed reads/header remain failures. This fixes input compatibility,
not event semantics, so successful current-rule checkpoints remain reusable.

Whitelist the enum in checkpoint validation. Propagate sourceFragment through
all Huawei event indexes/merge; when any duplicate has complete source, complete
evidence wins. SQL offhours may count positive observations, but only-fragment
coverage cannot become the 'none' cohort. UI explains warnings/published result,
not 'исправьте файл' for a recognized readable fragment. No raw rows/EOF copied.

## Constitution check до/после design

PASS: explicit user approval replaces legacy port bulk permission. No new vendor
API/transport/model capability, no real writes in development. Files not altered;
new quality enum never asserts full XML. Positive events keep source/rule refs,
absence/incomplete remains unknown. Atomic finish, checksums, memory-only secrets,
admin/Origin/CSRF, source/model/identity and per-device one-write guards preserved.

## Порядок

TDD → retire ports/UI → scanner/metadata/checkpoint → event quality/SQL → real
browser resume/publish → regressions, documentation and safe release if requested.
