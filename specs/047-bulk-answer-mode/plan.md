# Implementation Plan: Массовый Answer mode

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

Расширить только выбор целей для существующих модельных Answer mode action: один IP или фильтры актуальной SR. Один массовый план содержит один action ID, только совместимые точные устройства и явное подтверждение числа целей. Исполнитель последовательно применяет прежние per-device model/identity/pre-read/one-write/post-read; неясные write не повторяет.

## Technical Context

**Language/Version**: Python 3.11+, Vanilla JavaScript.
**Primary Dependencies**: существующие модели каталога, план v3 и локальный polling job.
**Storage**: память задания и выбранные пользователем результаты JSON.
**Testing**: Python unittest, `node tests.js`, `node scripts/validate-reference.js`.
**Target Platform**: Windows, локальный Python runtime/browser.
**Project Type**: локальный инструмент опроса/управления.
**Performance Goals**: неизменная последовательная обработка, интервал и сохранение каждого результата.
**Constraints**: актуальная SR, один модельный action ID, все выбранные цели совместимы, отдельное подтверждение, отсутствие автоповтора неясной записи.
**Scale/Scope**: TE20, TE30/40/50/60, Bar 310/Box 310/Box 610; одиночный режим сохраняется.

## Constitution Check

I–VI PASS: исходные файлы не меняются; каждая цель повторно проверяется по модели/идентичности; ошибка не становится успехом; write и read раздельны; секреты только в памяти. После дизайна PASS: смешанные группы блокируются до запуска, модельные контракты неизменны.

## Project Structure

```text
specs/047-bulk-answer-mode/  требования, контракт, тест-сценарии
app.js                      фильтры, число целей и подтверждение
mvp_runtime/polling.py      повторная проверка массового плана
mvp_runtime/server.py       существующий gate плана
python_tests/, tests.js     фильтры, конфликт, частичный отказ
product-catalog.js, docs/   справка и решение
```

## Complexity Tracking

Отклонений нет.
