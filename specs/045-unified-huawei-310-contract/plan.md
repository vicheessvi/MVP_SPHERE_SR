# Implementation Plan: Единый контракт Huawei 310

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

Перевести exact Bar 310, Box 310 и Box 610 на один transport `huawei_310_rest_v1` и один contract ID `huawei-310-rest-v1` на базе проверенного Bar 310. Сохранить отдельные model-key инвентаря, exact pre/post-auth gates, модельные validation statuses и импорт старых JSON. Обычный опрос остаётся read-only; opt-in HTTP-write не расширяется.

## Technical Context

**Language/Version**: Python 3.11+, Vanilla JavaScript.
**Primary Dependencies**: только стандартная библиотека; существующий Huawei 310 core.
**Storage**: память задания и выбранные пользователем файлы JSON.
**Testing**: Python unittest, `node tests.js`, `node scripts/validate-reference.js`.
**Target Platform**: Windows, локальный Python runtime и браузер.
**Project Type**: локальный инструмент опроса.
**Performance Goals**: неизменный объём bounded запросов на устройство.
**Constraints**: один transport/contract ID, только три exact модели, прежние model/identity и TLS gates, исторические JSON не переписывать.
**Scale/Scope**: три модели и их подтверждённые alias без суффиксов.

## Constitution Check

I–VI PASS до и после дизайна: сырые результаты не изменяются, идентичность проверяется до credentials и повторно после входа, unknown остаётся unknown, Box provisional не становится confirmed автоматически. После отдельных пользовательских проверок новые Box JSON имеют `confirmed_user_validation`, исторические provisional остаются исходными. Секреты и сетевые границы не меняются. Отклонений нет.

## Project Structure

```text
specs/045-unified-huawei-310-contract/  спецификация и контракт
mvp_runtime/adapters/huawei_bar310.py   общий guarded core/dispatcher
mvp_runtime/adapters/huawei_box310.py   совместимый тонкий wrapper
mvp_runtime/adapters/huawei_box610.py   совместимый тонкий wrapper
mvp_runtime/polling.py                  единая регистрация transport
runtime/device-catalog.json            три model-key, общий transport
app.js                                 три model-key, общий transport
python_tests/, tests.js                 миграция/безопасность/регрессия
product-catalog.js, docs/              описание и решение
```

**Structure Decision**: модельные ключи остаются раздельными для сопоставления SR и старых файлов; transport/contract ID общий. Legacy wrapper-функции могут делегировать общему dispatcher без сохранения старых contract ID в новых JSON.

## Complexity Tracking

Отклонений от Constitution нет.
