# Implementation Plan: Answer mode Huawei 310

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

Добавить два отдельные action ID для общего Huawei 310 transport: установить автоматический либо ручной ответ. «Не менять» не создаёт задачи. План допускает один exact IP из текущей SR и не совмещает действие с другими write-задачами. Core после model/identity/bundle gates выполняет точное pre-read, максимум один minimal PUT и post-read; на Box write остаётся предварительным.

## Technical Context

**Language/Version**: Python 3.11+, Vanilla JavaScript.
**Primary Dependencies**: стандартная библиотека; существующие `huawei_310_rest_v1`, план и локальный runtime.
**Storage**: только память задания и выбранный JSON; секреты не сохраняются.
**Testing**: Python unittest, `node tests.js`, `node scripts/validate-reference.js`, контрольный Bar 310.
**Target Platform**: Windows, локальный Python runtime/browser.
**Project Type**: локальный инструмент опроса и управления.
**Performance Goals**: один config pre-read, максимум один minimal write, один post-read.
**Constraints**: exact model/IP/SR, отдельное согласие, HTTPS/443, самоподписанный сертификат только текущего запуска, неизвестное — отказ.
**Scale/Scope**: один Bar 310/Box 310/Box 610; без суффиксов и без массовой write-задачи.

## Constitution Check

I–VI PASS до/после дизайна: исходные JSON неизменяемы, точная идентичность до сравнения/записи, отсутствие ответа — unknown, write не смешивается с read и не содержит секретов. Box статус не повышается по тесту Bar. Отклонений нет.

## Project Structure

```text
specs/046-huawei-310-answer-mode/   требования, evidence, контракт
app.js                               выбор, single-IP gate, подтверждение
runtime/device-catalog.json          allowlist action
mvp_runtime/polling.py, server.py     независимая проверка плана
mvp_runtime/adapters/huawei_bar310.py guarded pre-read/one-write/post-read
python_tests/, tests.js              положительные/отрицательные сценарии
product-catalog.js, docs/            Справочник и решение
```

## Complexity Tracking

Отклонений от Constitution нет.
