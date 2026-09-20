# Implementation Plan: Отдельные контракты Huawei Box 310 и Box 610

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/025-huawei-box-polling/spec.md`

## Summary

Выделить подтверждённую транспортную реализацию Huawei 310-family в параметризуемое ядро, сохранив отдельный публичный контракт Bar 310 и добавив два изначально guarded/provisional wrapper-контракта Box 310 и Box 610. После независимых успешных пользовательских проверок оба Box wrapper-контракта получили подтверждённый evidence status. Каждый wrapper задаёт собственные plan aliases, exact pre/post model, contract ID и evidence status. Каталог маршрутизирует модели отдельно; любые несовпадения блокируются до credentials либо до успешного результата.

## Technical Context

**Language/Version**: Python 3.11+, HTML5, Vanilla JavaScript

**Primary Dependencies**: только стандартная библиотека Python; существующий локальный runtime и vendored browser assets

**Storage**: только память текущего задания; JSON сохраняется лишь в выбранную пользователем папку

**Testing**: `unittest`, `node tests.js`, reference validator, syntax/compile checks

**Target Platform**: локальный Windows-компьютер с Python 3.11+

**Project Type**: локальное browser-приложение с loopback Python runtime

**Performance Goals**: не добавлять лишних сетевых запросов относительно Bar 310; bounded response limits сохраняются

**Constraints**: HTTPS/443, exact-model-before-credentials, GET-only resources, no external dependencies, no HTTP fallback

**Scale/Scope**: два новых exact manifests и два отдельных transport IDs; варианты Box `-S/-C/-K` вне scope

## Constitution Check

- I: результат сохраняет raw polling evidence только в явно выбранном JSON; synthetic tests не содержат live data — PASS.
- II: pre-auth exact model и post-auth stable identity предшествуют успешному результату — PASS.
- III: общая проекция детерминирована одним versioned resource contract — PASS.
- IV: missing/schema drift даёт unknown/failure, а не ложное удаление или успех — PASS.
- V: contract ID, evidence status и safe error объясняют вывод — PASS.
- VI: credentials/cookie/token memory-only, standard-library HTTPS, no external transfer — PASS.

Post-validation re-check: отдельные wrapper-контракты не ослабляют ни один gate; подтверждение Box 310 и Box 610 зафиксировано независимо — PASS.

## Project Structure

```text
mvp_runtime/adapters/huawei_bar310.py   # общее guarded 310-family ядро и подтверждённый Bar wrapper
mvp_runtime/adapters/huawei_box310.py   # отдельный Box 310 wrapper
mvp_runtime/adapters/huawei_box610.py   # отдельный Box 610 wrapper
mvp_runtime/polling.py                  # регистрация transports
runtime/device-catalog.json             # exact manifests
app.js                                  # frontend capability catalog
product-catalog.js                      # пользовательский справочник
python_tests/test_huawei_box.py         # model isolation/security tests
python_tests/test_catalog.py
python_tests/test_polling.py
tests.js
docs/decisions/ADR-0025-huawei-box-polling.md
specs/025-huawei-box-polling/
```

**Structure Decision**: сохранить один bounded transport implementation, но не один vendor contract. Модельные wrappers являются единственными публичными точками входа и передают immutable contract profile в ядро.

## Complexity Tracking

Нарушений constitution нет.
