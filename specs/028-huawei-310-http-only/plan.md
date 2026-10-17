# Implementation Plan: HTTP-only management for Huawei 310 devices

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Status**: Guarded implementation complete locally; controlled Box live acceptance pending

## Summary

Use the existing opt-in management workflow. For exact Bar 310, stop probing the unsupported Telnet configuration key and report that Telnet management is unavailable; retain its confirmed HTTP read/minimal-write/post-read behavior. The administrator confirmed `enable_http=0` as the safe target for exact Box 310/610. Add separate guarded contracts that make no write unless a current device/bundle establishes exact model, identity, setting schema and the possibility of post-read verification.

## Technical Context

**Language/Version**: Python 3.11+, HTML5, CSS3, Vanilla JavaScript

**Primary Dependencies**: Python standard library and existing vendored browser assets only

**Storage**: Memory-only state/job; redacted JSON only in the explicitly chosen folder

**Testing**: Python unittest, Node regression/reference/syntax checks, controlled read-only Box discovery

**Target Platform**: Local Windows host with explicit exact-IP HTTPS/443 device access

**Project Type**: Browser application with loopback Python polling runtime

**Performance Goals**: Preserve existing sequential polling and ACK-before-next-device behavior

**Constraints**: No Box write from Bar model inference; exact pre/post model and stable identity; fail closed on bundle/schema drift; no Telnet configuration requests for exact 310-family models; no external data transfer

**Scale/Scope**: Exact Bar 310, Box 310 and Box 610 models only; Box variants remain out of scope

## Constitution Check

*Gate before research*: Principles I–VI are compatible with the specification because the administrator supplies the model-specific safe value and all other Box setting evidence is checked at runtime before writing. A write based solely on a Box name would violate IV (unknown data fail closed) and VI (safe handling of infrastructure). **PASS with guarded fail-closed requirements.**

*Post-design gate*: **PASS for guarded implementation**. [Box 310](contracts/box310-http-only-v1.md) and [Box 610](contracts/box610-http-only-v1.md) have separate exact-model contracts, one user-confirmed safe target and mandatory current-bundle/read/post-read guards. Synthetic negative tests are required before enabling the catalog action. Live Box acceptance remains separate and cannot be claimed by synthetic tests.

## Phase 0: Research

See [research.md](research.md). The generic Huawei 310-family configuration API is documented and the administrator confirmed Box `enable_http=0` as the safe target. Current Box bundle markers and response schemas remain guarded runtime checks. The user reports no visible Telnet setting; the available Huawei-branded Box brochure lists Telnet as a protocol, so the result must not assert that the network service or TCP/23 is universally absent.

## Phase 1: Design & Contracts

The [data model](data-model.md) and two separate Box contracts define exact pre/post-auth model, stable identity, current config bundle markers and bounded read of an integer `enable_http` in `{0,1}`. The user-confirmed `0` is the only write target; send a single-item PUT only when the current value is `1`, then read `0` again. If bundle/read/schema/identity drifts, fail before PUT. Neither Box nor Bar reads or writes Telnet. The catalog action may add exact Box aliases only after synthetic negative tests pass. Bar and TE actions remain separately scoped. Controlled Box live validation is required before calling the contracts confirmed.

## Project Structure

```text
specs/028-huawei-310-http-only/     specification, research, model contracts, quickstart
mvp_runtime/adapters/huawei_bar310.py  shared guarded core and Bar HTTP-only action
mvp_runtime/adapters/huawei_box310.py  exact Box 310 guarded action contract
mvp_runtime/adapters/huawei_box610.py  exact Box 610 guarded action contract
runtime/device-catalog.json        exact capability allowlist
app.js, product-catalog.js         selection, wording and reference
python_tests/, tests.js            contract and integration regression
```

**Structure Decision**: Preserve three public exact-model contracts; reuse only evidence-confirmed shared mechanisms. Do not infer Box write semantics from code reuse.

## Complexity Tracking

No exception to the constitution is approved. The user-confirmed Box disable value and strict runtime checks permit provisional guarded implementation; the contracts must remain explicitly unconfirmed until controlled live tests on both Box models.
