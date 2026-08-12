# Research: Оборудование, время опроса и масштабируемый SR

## Browser File API и время файла

**Решение**: использовать валидное `File.lastModified` и маркировать источник `file_last_modified`. Не называть это временем создания. Если descriptor не содержит конечное положительное значение, хранить `capturedAt: null`, `capturedAtSource: "unavailable"`.

**Основание**: стандарт File API определяет только `lastModified`; при неизвестном значении реализация может вернуть текущее время. Creation time в доступном браузерном контракте отсутствует. Поэтому папка `YYYY-MM-DD_HH-MM-SS` остаётся доказательством времени запуска/группировки, но не отдельного результата.

**Источники**:

- W3C File API: <https://www.w3.org/TR/FileAPI/>
- MDN File.lastModified: <https://developer.mozilla.org/en-US/docs/Web/API/File/lastModified>

## Baseline SR import (до изменения production code)

Synthetic workbook содержит все обязательные SR columns, уникальные strong identifiers и семь типов. Node benchmark исключает `fixtureWorkbookWrite` из пользовательского пути. `browserFileRead` невозможно честно измерить в Node и оставлено `null`; этот этап проверяется вручную в `file://` acceptance.

| Строк | Import pipeline | Строк/с | Max event-loop lag | Workbook parse | Normalization | Serialize | Deep clone | Dashboard |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 000 | 245 ms | 4 080 | 235 ms | 44 ms | 47 ms | 4 ms | 7 ms | 10 ms |
| 5 000 | 4 821 ms | 1 037 | 4 811 ms | 215 ms | 252 ms | 22 ms | 36 ms | 16 ms |
| 10 000 | 19 728 ms | 507 | 19 718 ms | 382 ms | 457 ms | 45 ms | 76 ms | 22 ms |
| 25 000 | 128 859 ms | 194 | 128 849 ms | 1 050 ms | 1 106 ms | 155 ms | 185 ms | 70 ms |

**Вывод**: главный bottleneck — `locations.find` и `inventoryDevices.filter` внутри цикла строк, то есть O(rows²). SheetJS parsing, validation, serialization, clone и Dashboard существенно меньше, но UI дополнительно делает full `saveState` и `deepClone` после импорта. Нужны indexes, batch/yield и один state handoff.

## Optimized SR import

| Строк | Import pipeline | Строк/с | Max event-loop lag | Ускорение pipeline |
|---:|---:|---:|---:|---:|
| 1 000 | 84 ms | 11 945 | 20 ms | 2,9× |
| 5 000 | 381 ms | 13 134 | 15 ms | 12,7× |
| 10 000 | 768 ms | 13 019 | 22 ms | 25,7× |
| 25 000 | 1 870 ms | 13 366 | 27 ms | 68,9× |

Рост стал близким к линейному. На 25k processing укладывается примерно в 1,87 s вместо 128,86 s; workbook parsing остаётся около 1,03 s и теперь является заметной, но линейной частью. Validation 360 ms, serialization 149 ms, deep clone 223 ms и Dashboard 112 ms измерены отдельно. UI больше не выполняет save/serialize/deep-clone roundtrip после успешного file-only импорта.

## Категории и adapters

**Решение**: единый descriptor catalog с семью взаимоисключающими predicates. Новые категории участвуют в inventory, matching и Dashboard, но не получают vendor transport. `resolvePollingCapability` возвращает `not_implemented` и `protocol_required` до подтверждения API/auth/response schema.

## Selective change detection

**Решение**: allowlist вместо полного flatten. Начальная конфигурация включает только уже доказанно используемые Extron paths: тип контроллера и версия прошивки для контроллеров/панелей. Новые категории и прочие производители получают пустой список. Raw JSON при этом сохраняется.

**Отклонено**: универсальный diff всего `webBlocks`, blacklist timestamps и предположение о полях новых manufacturers — эти подходы создают шум либо выдумывают бизнес-смысл.
