# Implementation Plan: NTP Huawei TE20

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

## Summary

Добавить в план schema v3 фиксированный action `set_te20_ntp_settings` с тремя ограниченными полями. После existing HTTPS/443 TLS1.1 model/identity gates читать `synSerTime`, `ntpGetMode`, `timeServer`, отправлять максимум один `WEB_SaveCfgParamAPI` только с изменёнными CfgItemInt/CfgItemString и подтверждать post-read.

## Technical Context

Python 3.11+ standard library, HTML/CSS/Vanilla JavaScript, Windows loopback. Новых зависимостей нет. Данные плана только в памяти и явно выбранной пользователем папке результатов/восстановления. Ввод имени сервера ограничен 41 символом текущей формы TE20.

## Constitution Check

До исследования и после проектирования: I–V PASS — raw SR/JSON не изменяются, неизвестное не объявляется успешным; VI PASS — нет внешней передачи, логов с секретами, HTTP fallback или сторонних пакетов. Реальная запись отложена до отдельного конкретного выбора администратора. Исключений нет.

## Project Structure

`app.js`, `runtime/device-catalog.json`, `mvp_runtime/adapters/huawei_te40.py`, `mvp_runtime/polling.py`, `mvp_runtime/server.py`, `runtime/polling-recovery.js`, `tests.js`, `python_tests/`, `product-catalog.js`, `docs/`.

## Complexity Tracking

Нарушений Constitution 4.0.0 нет.
