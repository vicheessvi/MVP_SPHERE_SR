# Implementation Plan: Отключение автообновления Huawei TE20

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

## Summary

Добавить для exact TE20 отдельный opt-in action `disable_te20_auto_update`, доступный для одного IP из текущей SR. UI оставляет значение «Не менять» по умолчанию. Runtime использует существующий exact-model HTTPS/CGI transport и подтверждённое чтение `isenableautoupgrade`; после model/identity gates выполняет pre-read, при необходимости максимум одну запись `0` и точный post-read.

## Technical Context

**Language/Version**: Python 3.11+ standard library, Vanilla JavaScript
**Primary Dependencies**: Существующий loopback runtime и catalog; новых нет
**Storage**: Только память задания, готовый JSON в выбранной папке
**Testing**: unittest, `node tests.js`, reference validator
**Target Platform**: Windows, локальный Python runtime
**Project Type**: Browser UI + loopback Python executor
**Performance Goals**: Не более одного write-запроса для выбранного параметра
**Constraints**: Один exact TE20 по IP из SR, явное подтверждение, без HTTP fallback и внешней передачи
**Scale/Scope**: Одно действие на одном устройстве

## Constitution Check

- I–V: исходные SR/JSON не меняются; неизвестное значение не становится успешным; результат раздельный и объяснимый — PASS.
- VI: credentials только в памяти, Python admin gate, HTTPS/443, без сторонних зависимостей и внешней передачи — PASS.
- Workflow: Full SpecKit, synthetic negative tests и отдельная реальная проверка — PASS.
- После проектирования: нарушений конституции не выявлено; исключения не нужны.

## Project Structure

```text
app.js; product-catalog.js; runtime/device-catalog.json
mvp_runtime/adapters/huawei_te40.py; mvp_runtime/polling.py; mvp_runtime/server.py
tests.js; python_tests/test_huawei_te40.py; python_tests/test_polling.py; python_tests/test_server.py
specs/035-te20-disable-auto-update/; docs/decisions/; docs/implementation-log.md
```

**Structure Decision**: Использовать существующие plan schema v3, catalog, single-target gate и TE20 adapter; новый transport не требуется.

## Complexity Tracking

Нарушений Constitution 4.0.0 нет.
