# Implementation Plan: чтение настроек Huawei TE30/40/50/60

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

Дополнить существующий read-only TE transport независимыми, строго проверяемыми чтениями общих настроек и отдельных SNMP/Wi‑Fi методов. Неполная прошивка оставляет соответствующее поле неизвестным; TE20 не затрагивается.

## Technical Context

**Language/Version**: Python 3.11+ standard library, Vanilla JavaScript.
**Primary Dependencies**: существующие локальные адаптер и browser runtime.
**Storage**: только память задания и явно выбранный готовый JSON.
**Testing**: Python unittest, `node tests.js`, `node scripts/validate-reference.js`.
**Target Platform**: Windows loopback runtime.
**Project Type**: локальное приложение.
**Performance Goals**: не более трёх дополнительных read-only запросов на устройство.
**Constraints**: exact model/identity, только выбранный IP, без третьих сервисов и новых зависимостей.
**Scale/Scope**: точные TE30/40/50/60, без изменений TE20 и write-actions.

## Constitution Check

До исследования: неизменность исходных ответов и проверка идентичности соблюдаются; неизвестные поля не подменяются нулями, секреты не сохраняются. После проектирования: каждый источник имеет marker/schema gate, CSRF и ограниченную проекцию; нарушения принципов I–VI не выявлены.

## Project Structure

```text
specs/041-te-family-settings-read/   требования и проверка
mvp_runtime/adapters/huawei_te40.py  read-only поля
app.js                               безопасная проекция и фактический отчёт
python_tests/test_huawei_te40.py     адаптерные контракты
tests.js                             проекция и отсутствие секретов
product-catalog.js                  Справочник
```

**Structure Decision**: существующий guarded TE transport, без нового адаптера.

## Complexity Tracking

Отклонений от Constitution нет.
