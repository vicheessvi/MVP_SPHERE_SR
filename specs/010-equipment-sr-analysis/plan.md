# Implementation Plan: Оборудование, время опроса и масштабируемый SR

**Branch**: `010-equipment-sr-analysis` | **Date**: 2026-08-12 | **Spec**: [spec.md](spec.md)

## Summary

Сформировать каталог семи взаимоисключающих категорий оборудования и вложенную навигацию на одном inventory renderer. Перевести время результата опроса на доказательство конкретного файла (`File.lastModified` либо `unavailable`), разделить ошибки по фактической причине, а полный raw diff заменить централизованным allowlist значимых параметров. Импорт SR переводится с квадратичных `find/filter` на заранее построенные индексы, пакетную обработку и cooperative yield; Dashboard агрегирует семь категорий одним проходом.

## Technical Context

**Language/Version**: JavaScript ES2020+ в браузере; Node.js только для тестов и synthetic benchmark

**Primary Dependencies**: Browser File API, Web Crypto, DOM, локальная SheetJS CE 0.20.3

**Storage**: Только volatile memory текущей вкладки; persistent storage не добавляется

**Testing**: `tests.js`, `runtime-tests.js`, `server-tests.js`, `scripts/validate-reference.js`, Node benchmark

**Target Platform**: Windows, современный браузер, прямое открытие `file://.../index.html`

**Project Type**: Одностраничное browser-only приложение

**Performance Goals**: Близкий к линейному импорт 1k/5k/10k/25k SR-строк; индексный lookup на строку; batch progress и event-loop yield

**Constraints**: Без сети, CDN, backend, persistent browser storage, реальных credentials/IP-выгрузок и вымышленных vendor API

**Scale/Scope**: Семь категорий; SR до 25k synthetic rows; история с late arrival и одинаковыми/неизвестными timestamps

## Constitution Check

*GATE: проверено до Phase 0 и повторно после Phase 1.*

- **Локальность и граница доверия**: PASS — только выбранные файлы и память страницы, сетевые вызовы не добавляются.
- **Доказуемость времени**: PASS — folder timestamp остаётся свойством запуска; результат получает только `file_last_modified` либо `unavailable`.
- **Raw provenance**: PASS — raw SR/JSON и внутренние enum не локализуются и не отбрасываются.
- **No invented protocols**: PASS — новые категории получают `not_implemented/protocol_required`, adapters не выдумываются.
- **Единый каталог продукта**: PASS — модули, термины, категории и analyzed rules централизуются в `product-catalog.js`.
- **Temporal integrity**: PASS — известные timestamps сортируются устойчиво; unknown не маскируется временем папки; late insertion пересчитывает соседние пары.
- **Performance evidence**: PASS — baseline измерен до изменения: 1k 245 ms, 5k 4.82 s, 10k 19.73 s, 25k 128.86 s.
- **Testing/traceability**: PASS — TDD, benchmark before/after, ADR, reference validator и secret scan обязательны.

## Project Structure

### Documentation (this feature)

```text
specs/010-equipment-sr-analysis/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/equipment-analysis.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
product-catalog.js                       # categories, routes, terms, selective rules
app.js                                   # SR indexes/import, timestamps, status/diff, shared UI
styles.css                               # nested navigation and SR progress
tests.js                                 # unit/integration/performance guards
runtime-tests.js                         # file-only and no-persistence contracts
benchmarks/sr-import-performance.js      # 1k/5k/10k/25k before/after
docs/decisions/ADR-0010-equipment-analysis.md
docs/architecture.md
docs/context-map.md
docs/implementation-log.md
README.md
```

**Structure Decision**: Сохраняется текущая browser-only single-file architecture. Общие descriptors и presentation dictionary находятся в каталоге продукта; все категории используют существующий renderer и один набор selectors.

## Design

1. `EQUIPMENT_CATEGORY_CATALOG` задаёт семь IDs, routes, русские labels и точные SR predicates; `MODULE_CATALOG` строит один parent и семь дочерних routes.
2. `createSrImportContext` один раз строит location и identity indexes, затем `processSrImportRows` обрабатывает batches и обновляет progress без render на строку.
3. Run folder timestamp сохраняет группировку. File descriptor переносит `lastModified`; `resolvePollingResultTimestamp` возвращает только доказанный `file_last_modified` или `unavailable`.
4. `derivePollingStatus` различает network/auth/processing только по подтверждённым markers; malformed/read/unmatched остаются data/import outcomes.
5. `ANALYZED_PARAMETER_RULES` разрешает только подтверждённые JSON paths. Diff получает device scope, path label и rationale; scope без правил даёт пустой diff.
6. Chronology использует known result time, стабильный tie-breaker и отдельное размещение unknown; unknown result не образует ложных chronological changes.
7. Dashboard category counts и drill-down строятся из catalog IDs в одном проходе; UI показывает компактный список семи категорий.

## Complexity Tracking

| Решение | Обоснование | Почему недостаточен простой вариант |
|---|---|---|
| Неперсистентные Map/Set индексы SR | Убирают измеренное O(rows²) | `find/filter` на строку блокирует 25k почти 129 секунд |
| Каталог rules для selective diff | Предотвращает шум и вымышленные параметры | Blacklist служебных paths не ограничивает неизвестные raw поля |
| Явный unknown timestamp | Сохраняет доказательность | Подстановка folder/import time создаёт ложную хронологию |

## Post-Design Constitution Re-check

PASS. Дизайн не меняет file-only режим, не добавляет внешнюю передачу, сохраняет raw evidence и вводит более строгие provenance/status/diff правила.
