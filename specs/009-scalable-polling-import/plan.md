# Implementation Plan: Масштабируемый импорт результатов опроса

**Branch**: `009-scalable-polling-import` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Summary

Заменить используемый UI последовательный импорт с полным deep-clone и rebuild на файл на browser-only пакетный конвейер. Конвейер читает ограниченный пакет с bounded concurrency, последовательно применяет результаты к одному согласованному state, использует IP/duplicate/history indexes, обновляет только соседние change-пары, регулярно yield-ит event loop и публикует throttled progress с отменой. Существующий последовательный API сохраняется как эталон для regression parity.

## Technical Context

**Language/Version**: JavaScript ES2020+ в браузере и Node.js только для тестов/benchmark

**Primary Dependencies**: Browser File API, Web Crypto, DOM; production без внешних runtime-зависимостей

**Storage**: Volatile in-memory state текущей страницы; исходный file-only контракт не меняется

**Testing**: `tests.js` в `tests.html`, `runtime-tests.js`, `server-tests.js`, синтетический Node benchmark

**Target Platform**: Современный Windows-браузер, прямой запуск `file://.../index.html`

**Project Type**: Одностраничное browser-only приложение

**Performance Goals**: Почти линейный рост относительно числа новых JSON; ≤1 SR lookup и ≤2 пересчитанных соседних пар на новый результат; cooperative yield до 50 мс непрерывной работы в синтетическом guard

**Constraints**: Без backend/localhost/Worker по умолчанию; без сети и реальных пользовательских данных; bounded memory/concurrency; семантический паритет feature 008

**Scale/Scope**: Автоматические сценарии 1k/5k/7 862/10k, ручной 25k, ежедневное добавление 1k к истории 50k

## Constitution Check

*GATE: проверено до Phase 0 и повторно после Phase 1.*

- **Локальность данных**: PASS — File API, память страницы и Web Crypto; сетевые вызовы не добавляются.
- **Single administrator / file-only UX**: PASS — роли и запуск `index.html` не меняются.
- **Provenance/raw data**: PASS — raw text, SHA-256, filename и relative path сохраняются.
- **Temporal integrity**: PASS — binary insertion и пересчёт только затронутых соседей поддерживают поздние результаты.
- **Idempotency**: PASS — ключ `run + filename + hash` индексируется до parse/diff.
- **Evidence over assumptions**: PASS — решение основано на baseline profiling; Web Worker отклонён как неоправданный.
- **Testing/traceability**: PASS — TDD parity, operation-count guards и before/after benchmark обязательны.
- **Constitution drift note**: действующий ADR-0008 и контракт проекта определяют volatile file-only режим; оптимизация не расширяет это уже принятое отклонение от исторических формулировок о loopback/encrypted storage.

## Project Structure

### Documentation (this feature)

```text
specs/009-scalable-polling-import/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/import-pipeline.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
app.js                          # import engine, progress state and UI
styles.css                     # progress panel
tests.js                       # functional, parity and operation guards
runtime-tests.js               # direct-file/runtime contracts
benchmarks/import-performance.js
docs/decisions/ADR-0009-scalable-import-pipeline.md
docs/architecture.md
docs/context-map.md
docs/implementation-log.md
README.md
```

**Structure Decision**: Сохраняется текущая single-file browser architecture. Новый конвейер выделяется функциями внутри `app.js`, чтобы не добавлять module loading, Worker или server, несовместимые с прямым `file://` запуском.

## Design

1. `groupPollingFilesByRunFolder` остаётся единственным распознавателем и сортировщиком запусков.
2. `createPollingImportContext` один раз строит отдельные current/historical IP indexes, другие Map/Set и сортированные компактные массивы истории; только current IP index участвует в matching, UI повторно использует context, пока state identity актуален.
3. `processPollingImportBatches` работает по группам и пакетам по 32 файла, читает их с concurrency 2–6, затем освобождает тексты.
4. `ingestIndexedPollingFile` проверяет hash-дубликат, один раз parse/normalize, атомарно добавляет result/issue/history и изменяет только две соседние пары.
5. После каждого пакета выполняются compact change removals, progress callback и cooperative yield (`scheduler.yield` либо `setTimeout(0)`).
6. UI-render throttled примерно 100 мс; Dashboard не вычисляется на маршруте загрузки и обновляется один раз после окончания.
7. Cancellation token проверяется перед чтением и между файлами; завершённые атомарные результаты остаются валидными.

## Complexity Tracking

| Решение | Обоснование | Более простой вариант отклонён потому что |
|---|---|---|
| Неперсистентные Map/Set индексы | Убирают O(JSON × SR) и повторные полные scans | `find/filter` на файл уже измеренно нелинейны |
| Инкрементальные соседние пары | Сохраняют late-arrival semantics без полного rebuild | Только latest result ломает вставку старого запуска |
| Bounded read queue | Ускоряет File API без удержания всех raw/parsed объектов | Строго последовательное чтение медленнее, безграничный Promise.all опасен для памяти |

## Post-Design Constitution Re-check

PASS. Дизайн сохраняет локальность, provenance, временную корректность, идемпотентность и `file://`; новых нарушений или внешних зависимостей нет.
