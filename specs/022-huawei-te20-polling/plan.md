# Implementation Plan: Huawei TE20 polling

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-08

Register a separate exact TE20 catalog entry and adapter key. Reuse the bounded Huawei CGI flow, add an exact per-model TLS profile and a TE20-specific pre-auth gate, retain exact post-auth model/identity validation, and keep write capabilities limited to TE30–TE60.

Python 3.11+ standard library and Vanilla JavaScript remain unchanged; no dependency or storage is added. Constitution check: PASS with documented limitation that TE20 cannot disclose model before credentials; exact immutable plan, controlled legacy fingerprint and mandatory immediate post-auth model/identity provide the bounded evidence chain.
