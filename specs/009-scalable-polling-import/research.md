# Research: Профилирование и выбор архитектуры

## Baseline

Использован синтетический dataset без пользовательских данных. Payload включает ping, web interface, тип контроллера, firmware и diagnostics.

| JSON | Устройства | Результат старого pipeline | Throughput |
|---:|---:|---:|---:|
| 100 | 100 | 159,11 мс | 628,48 files/s |
| 1 000 | 1 000 | 11 146,23 мс | 89,72 files/s |
| 5 000 | 1 000 | >180 с, timeout | <27,78 files/s |
| 7 862 | 1 000 | >45 с, protective timeout | <174,71 files/s lower bound only |
| 10 000 | 1 000 | >45 с, protective timeout | <222,22 files/s lower bound only |

Для 1 000 файлов isolated stages: grouping 9,57 мс, JSON.parse 2,13 мс, IP extraction 1,00 мс, SR full scan 8,80 мс, normalization 9,56 мс, storage serialization 10,20 мс, dashboard aggregation 8,26 мс. Полный import — 11 146,23 мс.

Operation count на 1 000: 1 000 000 SR comparisons, минимум 2 003 полных deep-clone, 1 000 полных rebuild истории одного устройства, один storage commit, ноль Dashboard recalculation внутри pipeline и ноль промежуточных UI renders.

## Decision 1: Удалить полные копирования из hot path

**Decision**: Новый bulk pipeline изменяет выделенный state атомарными операциями и не вызывает immutable legacy wrappers на каждый файл.

**Rationale**: Isolated CPU stages занимают десятки миллисекунд, тогда как growing-state clone/rebuild — секунды и O(N²).

**Alternatives**: `structuredClone` отклонён: он быстрее JSON clone, но сохраняет квадратичную модель. Web Worker отклонён: переносит симптом, но сериализация огромного состояния остаётся.

## Decision 2: Cooperative batches и bounded reads

**Decision**: Batch 32 файла, read concurrency определяется `hardwareConcurrency`, ограничивается диапазоном 2–6; yield после пакета. Значение уменьшено с 48 после контрольного пика event-loop lag на 25 000 JSON.

**Rationale**: Ограничивает retained raw strings/objects, обеспечивает progress/cancel и не создаёт тысячи Promise одновременно.

**Alternatives**: Полностью последовательное чтение не использует параллелизм File API; `Promise.all(allFiles)` создаёт memory/GC pressure.

## Decision 3: Индексы

**Decision**: Map IP→device candidates, Set duplicate keys, Map run identity→run, Map device→sorted result references, Map adjacent pair→changes.

**Rationale**: Один линейный build заменяет scans на каждый JSON. Context кэшируется в памяти пока identity state не изменилась.

## Decision 4: Incremental temporal diff

**Decision**: Binary insert в device history. При вставке между A и B удаляется только пара A→B и создаются A→new и new→B; на краях создаётся одна пара.

**Rationale**: Поддерживает late arrivals и пересчитывает ≤2 pairs/result.

## Decision 5: Throttled UX

**Decision**: Progress обновляется после логических шагов, DOM-render не чаще 100 мс, rate рассчитывается по elapsed/processed, ETA показывается после появления скорости.

**Rationale**: Живой UI не должен становиться новым bottleneck. Dashboard остаётся lazy и не вычисляется на каждый файл.

## Decision 6: Storage boundary

**Decision**: Учитывать реальную архитектуру — канонический state находится в памяти страницы; не создавать фиктивные IndexedDB transactions. Полная validation/serialization выполняется только в контрольных тестах и по существующим явным операциям.

**Rationale**: Feature 008 intentionally removed persistent browser storage; per-file save отсутствует уже сейчас.
