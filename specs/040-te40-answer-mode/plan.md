# Implementation Plan: Answer Mode Huawei TE30/40/50/60

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

Отдельный выбор ручного и автоматического ответа для одного exact TE30/40/50/60 из текущей SR. Повторное использование подтверждённого TE web-CGI transport, но с модельной проверкой и текущими маркерами формы. TE40 прошёл контролируемый переход в автоматический режим; остальные модели предварительные.

## Technical Context

**Language/Version**: Python 3.11+ standard library; Vanilla JS.

**Primary Dependencies**: Только существующий runtime и локальный каталог.

**Storage**: Только память задания; готовый JSON в выбранной папке.

**Testing**: `python -m unittest discover -s python_tests -v`, `node tests.js`, `node scripts/validate-reference.js`.

**Target Platform**: Windows loopback runtime.

**Project Type**: Локальный browser UI и Python polling runtime.

**Performance Goals**: Не более одного дополнительного чтения до/после записи.

**Constraints**: Один точный IP из SR, отдельное подтверждение, без новых зависимостей и внешних вызовов.

**Scale/Scope**: Один терминал за write-задание.

## Constitution Check

До исследования: принципы I–VI соблюдены; raw результаты не переписываются, идентичность проверяется до записи, неизвестная схема блокирует действие, секреты остаются в памяти. После проектирования: те же ограничения сохранены; чтение перед записью, максимум одна запись и точное повторное чтение. Отклонений нет.

## Project Structure

```text
specs/040-te40-answer-mode/       требования и проверки
mvp_runtime/adapters/huawei_te40.py  guarded action
mvp_runtime/polling.py            проверка плана
runtime/device-catalog.json       exact capability
app.js                            выбор и согласие
python_tests/, tests.js           регрессия
product-catalog.js               Справочник
```

**Structure Decision**: Использовать существующий общий TE transport без нового сетевого маршрута.

## Complexity Tracking

Отклонений от constitution нет.
