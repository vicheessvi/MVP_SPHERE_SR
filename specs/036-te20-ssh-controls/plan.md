# Implementation Plan: TE20 SSH

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

## Summary

Добавить два фиксированных exact-TE20 action ID и трёхпозиционный UI. Использовать существующий HTTPS/443 CGI transport, model/identity gates, однополевое чтение `enable_ssh`, максимум одну запись 0/1 и post-read.

## Technical Context

Python 3.11+ stdlib, Vanilla JavaScript, Windows loopback runtime; новых зависимостей и постоянного хранилища нет. План schema v3, один IP из SR. Проверки: unittest, node tests/reference, compileall.

## Constitution Check

До исследования и после проектирования: I–V PASS — raw SR/JSON не меняются, неизвестное состояние не становится успешным; VI PASS — локальные секреты только в памяти, Python admin gate, нет HTTP fallback или внешней передачи. Исключений нет.

## Project Structure

`app.js`, `runtime/device-catalog.json`, `mvp_runtime/adapters/huawei_te40.py`, `mvp_runtime/polling.py`, `mvp_runtime/server.py`, `tests.js`, `python_tests/`, `product-catalog.js`, `docs/`.

## Complexity Tracking

Нарушений Constitution 4.0.0 нет.
