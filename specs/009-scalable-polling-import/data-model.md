# Data Model: Масштабируемый импорт

## ImportProgress (ephemeral)

| Field | Type | Meaning |
|---|---|---|
| `stage` | string | Текущий пользовательский этап |
| `total` | number | Найденные JSON |
| `processed` | number | Завершённые файлы |
| `succeeded` | number | Принятые результаты |
| `errors` | number | Ошибки пути/чтения/JSON |
| `duplicates` | number | Пропущенные дубликаты |
| `currentRun` | string/null | Текущая dated-папка |
| `startedAt` | number | monotonic timestamp |
| `filesPerSecond` | number | Средняя/сглаженная скорость |
| `etaSeconds` | number/null | Оценка оставшегося времени |
| `cancelRequested` | boolean | Запрос отмены |
| `status` | running/completed/cancelled/failed | Итог session |

Progress не входит в persisted domain state и не содержит raw JSON.

## PollingImportContext (ephemeral)

- `state`: identity канонического объекта.
- `inventoryByIp: Map<string, InventoryDevice[]>`.
- `runByIdentity: Map<string, PollingRun>`.
- `duplicateKeys: Set<string>`.
- `historyByDevice: Map<string, PollingResult[]>`, отсортировано по `polledAt` и стабильному ID.
- `changesByPair: Map<string, DeviceChange[]>`.
- `removedChangeIds: Set<string>`.
- `metrics`: lookup/parse/diff/yield/read counters для tests/benchmark.

## Batch lifecycle

`descriptors → bounded read results → one parsed payload at a time → domain result → release batch text references`.

## Invariants

1. `processed = succeeded + errors + duplicates` после каждой атомарной операции.
2. Каждая принятая запись с deviceId находится ровно в одном sorted history index.
3. Active changes отражают только соседние пары текущей истории.
4. Duplicate key добавляется только после принятия результата либо уже существует из state.
5. Cancellation никогда не оставляет наполовину добавленный PollingResult.
6. Domain schema feature 008 не изменяется.
