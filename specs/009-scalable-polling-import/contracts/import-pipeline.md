# Contract: Indexed batch import

## `processPollingImportBatches(state, input)`

Input:

- `files`: descriptors `{ name, relativePath, text? }` либо browser File wrappers;
- `actorId`;
- optional `readText(file)`, `onProgress(progress)`, `shouldCancel()`, `yieldControl()`, `batchSize`, `concurrency`, `context`.

Output Promise:

```js
{
  ok,
  cancelled,
  state,
  context,
  summary: { total, processed, succeeded, errors, duplicates, runs },
  metrics: { reads, parses, srLookups, normalized, diffPairs, yields, batches }
}
```

Guarantees:

- no more than configured concurrent reads;
- run groups ordered chronologically;
- per-file errors isolated;
- at most one SR map lookup per non-duplicate file;
- duplicate skipped before parse/normalize/diff;
- ≤2 recalculated adjacent pairs per accepted matched result;
- progress callback receives snapshots, never raw data;
- cancellation resolves normally with valid partial state.

## Progress stages

`Поиск файлов` → `Подготовка запусков опроса` → `Чтение файлов` → `Обработка результатов` → `Сохранение данных` → `Обновление аналитики` → `Готово`.

## Compatibility

Legacy `ingestPollingFolderTree` remains available for deterministic parity tests. Browser UI uses only the indexed batch contract.
