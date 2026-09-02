# Implementation Plan: Аналитика перезагрузок устройств

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-02 | **Spec**: [spec.md](spec.md)

## Summary

Добавить между «Главным экраном» и «Оборудованием» модуль, который для каждого точно сопоставленного файла Extron вычисляет последний запуск как `Device Status.Date − Device Status.Uptime`. Правило `extron-reboot-v2` объединяет времена запуска одного устройства в пределах пяти секунд и считает каждое новое уникальное время отдельной перезагрузкой. Производные события остаются в памяти сеанса; единый срез питает KPI, графики и таблицу.

## Technical Context

**Language/Version**: HTML5, CSS3, Vanilla JavaScript (ES2020+); Python 3.11+ standard-library runtime остаётся источником автоматических JSON

**Primary Dependencies**: browser File/System Access API; существующий vendored SheetJS; внешние chart-библиотеки не добавляются

**Storage**: только текущий in-memory state вкладки/runtime; исходные SR/JSON не изменяются

**Testing**: `node tests.js`, `node scripts/validate-reference.js`, `node --check`

**Target Platform**: Windows, Chromium-based browser; `file://index.html` для ручного импорта и loopback Python launch для автоматического workflow

**Project Type**: локальное одностраничное приложение с Python loopback runtime

**Performance Goals**: расчёт и срез 5 000 устройств / 25 000 результатов менее 2 секунд

**Constraints**: offline/local-only, без persistent browser storage, без внешней сети/CDN/telemetry, без изменения raw data, fail-closed при неоднозначности

**Scale/Scope**: один новый верхнеуровневый route, до 25 000 результатов в сеансе, пять измерений агрегации и шесть фильтров

## Constitution Check

*GATE before research: PASS. Re-check after design: PASS.*

- **I. Неизменяемые доказательства**: события ссылаются на два result id и paths evidence; raw payload не меняется.
- **II. Идентичность**: участвуют только результаты с точным `deviceId` актуального SR; приближённого IP-сопоставления нет.
- **III. Детерминизм**: версия правила `extron-reboot-v2`; строгий parser даты, арифметика и кластеризация с допуском пять секунд детерминированы.
- **IV. Неполные данные**: неизвестное время, uptime, конфликт полей и одинаковые timestamps учитываются как недостаточные данные.
- **V. Объяснимость**: событие хранит пару наблюдений, интервал, правило и provenance; multiple reboot не выдаётся за точное число.
- **VI. Локальная защита**: анализ в памяти, без сети, storage, секретов и внешних зависимостей.
- **Workflow**: specification, research, data model, contract, tests-first и ADR входят в поставку.

Нарушений constitution и исключений нет.

## Project Structure

### Documentation (this feature)

```text
specs/015-reboot-analytics/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/reboot-analytics.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
app.js                         # timestamp provenance, rule/index/selectors, route/UI
product-catalog.js             # route и централизованный Справочник
styles.css                     # доступные графики и responsive layout
tests.js                       # unit/regression/performance
mvp_runtime/adapters/extron.py # uptimeObservedAt в момент чтения подтверждённого ресурса
python_tests/test_extron.py    # timestamp contract regression
docs/context-map.md
docs/project-vision.md
docs/implementation-log.md
docs/decisions/ADR-0015-reboot-analytics.md
```

**Structure Decision**: сохранить монолитную структуру интерфейса и добавить чистый аналитический слой в `app.js`; производные события не включать в state schema. `product-catalog.js` остаётся единственным источником маршрута и справочной карточки. Подтверждённый Extron adapter добавляет только provenance-время фактического чтения уже существующего uptime resource, не новый vendor API.

## Complexity Tracking

Не требуется: constitution violations отсутствуют.
