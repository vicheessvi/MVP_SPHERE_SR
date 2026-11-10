# Implementation Plan: Фактические настройки Huawei CloudLink Bar 310

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

Дополнить обычный read-only опрос exact Bar 310 фактическими настройками, которые сейчас обозначены `protocol_required`, не меняя контракт Box-моделей. Каждый запрос и преобразование значения включать только после проверки схемы текущего web-интерфейса и сверки с меню устройства. Обновить JSON, тесты, Справочник и документацию.

## Technical Context

**Language/Version**: Python 3.11+ (standard library), Vanilla JavaScript.
**Primary Dependencies**: существующий guarded HTTPS-адаптер `mvp_runtime/adapters/huawei_bar310.py`, `device_settings.py`.
**Storage**: только память задания и явно выбранный итоговый JSON; исходные ответы устройства не сохраняются.
**Testing**: `python -m unittest discover -s python_tests -v`, `node tests.js`, `node scripts/validate-reference.js`.
**Target Platform**: Windows, локальный Python runtime и браузер.
**Project Type**: локальный инструмент инвентаризации и аналитики.
**Performance Goals**: чтение каждого набора настроек в одном ограниченном запросе, без широкого экспорта конфигурации.
**Constraints**: только HTTPS/443, exact pre-auth model и post-auth identity; существующий read-only контракт; самоподписанный сертификат только по согласию текущего сеанса; ни одного write-запроса.
**Scale/Scope**: только exact Bar 310; Box 310/610 и другие Bar не наследуют новые чтения.

## Constitution Check

I–VI: PASS при условии неизменности исходного JSON, точной проверки идентичности, явной неопределённости при отсутствии доказательств и исключения секретов из результата. После дизайна проверить ещё раз. Неподтверждённые поля остаются `protocol_required`, а не переводятся в значения по умолчанию.

## Research Gate

Для каждого нового поля необходимы: маркер в текущем bundle, точный read-only ресурс и тело запроса, схема ответа, семантика значений и сверка с меню. Текущий bundle и ответы подтверждены контролируемым чтением для перечисленных в [research.md](research.md) полей; значения трёх видимых пунктов питания дополнительно сверены со скриншотом администратора. Не найденные в текущем меню подполя не изобретать и не переносить вывод на другие прошивки.

## Project Structure

```text
specs/043-bar310-settings-read/    требования, доказательства, контракт, тест-план
mvp_runtime/adapters/huawei_bar310.py   guarded модельный опрос
mvp_runtime/adapters/device_settings.py схема фактических полей
python_tests/test_huawei_bar310.py      модельные и отрицательные тесты
app.js, product-catalog.js             представление и справка
docs/                                 архитектурное решение и журнал
```

**Structure Decision**: расширить только существующий Bar 310 adapter после его model/identity gates. Не создавать общий запрос конфигурации для всего семейства 310.

## Complexity Tracking

Отклонений от Constitution не планируется.
