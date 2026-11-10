# Implementation Plan: Чтение настроек Box 310/610

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

Расширить существующее общее guarded-ядро Huawei 310 для точных Box 310/610 условным read-only профилем настроек. Оба Box используют один алгоритм чтения, но свои exact-model контрактные идентификаторы и независимый статус пользовательской проверки. Баровские значения являются кандидатами только при наличии точных маркеров в текущем bundle и строгих ответов; пользователь сверит каждую модель позже.

## Technical Context

**Language/Version**: Python 3.11+, Vanilla JavaScript.
**Primary Dependencies**: только стандартная библиотека Python; существующий `mvp_runtime/adapters/huawei_bar310.py` и Box wrappers.
**Storage**: память задания и явно выбранный JSON; секреты не сохраняются.
**Testing**: Python unittest, `node tests.js`, `node scripts/validate-reference.js`.
**Target Platform**: Windows, локальный Python runtime и браузер.
**Project Type**: локальный инструмент опроса и аналитики.
**Performance Goals**: ограниченный набор точечных чтений только после identity gates.
**Constraints**: HTTPS/443, точные модели, только read; отсутствие доказательств на реальных Box обозначается provisional; write-задачи не расширяются.
**Scale/Scope**: exact Box 310 и Box 610, без суффиксов.

## Constitution Check

I–VI PASS при сохранении исходного результата, модельной идентичности, неопределённости вместо догадки, независимого статуса проверки и исключения секретов. После дизайна PASS: новые запросы разрешены только модельно и по маркерам, неполные результаты не блокируют обычный опрос.

## Project Structure

```text
specs/044-box310-610-settings-read/   требования, контракт, сценарии
mvp_runtime/adapters/huawei_bar310.py  общее guarded-ядро и read profile
mvp_runtime/adapters/huawei_box310.py  exact Box 310 descriptor
mvp_runtime/adapters/huawei_box610.py  exact Box 610 descriptor
app.js                               безопасная проекция и предварительный статус
python_tests/test_huawei_bar310.py    модельные контрактные тесты
tests.js                              регрессии импорта
product-catalog.js, docs/            Справочник и решения
```

**Structure Decision**: одно ядро чтения без копирования кода, два независимых exact-model descriptor и validation gate.

## Complexity Tracking

Отклонений от Constitution нет.
