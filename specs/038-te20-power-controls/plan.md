# Implementation Plan: Power Huawei TE20

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

## Summary

Добавить один фиксированный action `set_te20_power_settings` с необязательными выборами. Existing HTTPS/443 TLS1.1 adapter после model/identity gates читает `suppotReboot`, `sleepTime`, `enableTimeReboot`, `rebootHour`, `rebootMinute`, выполняет максимум один `WEB_SaveCfgParamAPI` с изменёнными CfgItemInt и exact post-read.

## Technical Context

Python 3.11+ stdlib, Vanilla JS, Windows loopback; без новых зависимостей. План schema v3, один IP из SR. Данные только в памяти сеанса и явно выбранной папке результатов/восстановления. Проверки unittest, `node tests.js`, reference validator.

## Constitution Check

До исследования и после проектирования: I–V PASS — raw данные не изменяются, неизвестное не считается успехом; VI PASS — секреты в памяти, только HTTPS, нет внешней передачи. Live write требует отдельного точного выбора пользователя. Исключений нет.

## Project Structure

`app.js`, `runtime/device-catalog.json`, `mvp_runtime/adapters/huawei_te40.py`, `mvp_runtime/polling.py`, `mvp_runtime/server.py`, `tests.js`, `python_tests/`, `product-catalog.js`, `docs/`.

## Complexity Tracking

Нарушений Constitution 4.0.0 нет.
