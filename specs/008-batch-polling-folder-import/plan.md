# Implementation Plan: Пакетный импорт папок опросов

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-batch-polling-folder-import/spec.md`

## Summary

Добавить рекурсивную группировку выбранных локальных файлов по ближайшей датированной родительской папке, импортировать каждую группу как отдельный запуск в хронологическом порядке, показывать частичные ошибки и оставить единственным пользовательским запуском прямое открытие `index.html`.

## Technical Context

**Language/Version**: HTML5, CSS3, Vanilla JavaScript ES2022

**Primary Dependencies**: браузерные File API и Web Crypto; локально vendored SheetJS CE 0.20.3 для существующего SR-импорта

**Storage**: только оперативная память текущей вкладки через `createVolatileStorage`

**Testing**: Node.js test harness в `tests.js`, статическая валидация справочника, синтаксические проверки

**Target Platform**: Windows 10/11, актуальный Chromium/Edge, запуск `file://.../index.html`

**Project Type**: автономное локальное одностраничное приложение

**Performance Goals**: группировка 1 000 путей без заметной задержки интерфейса; одна операция выбора для 10 и более папок

**Constraints**: без внешней сети, без сервера, без `localStorage`/`IndexedDB`, без чтения файлов учётных данных, исходный JSON неизменяем

**Scale/Scope**: одна общая папка, произвольное число датированных подпапок и JSON в пределах доступной памяти браузера

## Constitution Check

- **I. Неизменяемые исходные доказательства — PASS**: сохраняются исходный JSON, SHA-256, время опроса, время импорта и относительный путь.
- **II. Идентичность предшествует сравнению — PASS**: существующее сопоставление по нормализованному IP не меняется.
- **III. Детерминированная нормализация — PASS**: группы и сеансы сортируются по времени и пути.
- **IV. Безопасная работа с неполными данными — PASS**: ошибка одного файла не превращается в отсутствие остальных устройств.
- **V. Объяснимость — PASS**: пользователь видит итог по папкам и отдельные причины ошибок.
- **VI. Локальная защита — PASS**: File API читает только явно выбранные файлы, данные остаются в памяти вкладки, сетевых вызовов нет.

Повторная проверка после проектирования: PASS. Нарушений конституции и исключений нет.

## Project Structure

### Documentation (this feature)

```text
specs/008-batch-polling-folder-import/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── folder-tree-import.md
│   └── launch-mode.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
index.html             # единственная точка запуска
runtime-config.js      # маркер прямого файлового запуска
app.js                 # группировка, импорт, UI и публичные pure primitives
product-catalog.js     # синхронизированный Справочник
tests.js               # unit/integration regression tests
README.md              # пользовательский запуск и структура импорта
docs/                  # архитектура и журнал решений
```

**Structure Decision**: Сохраняется автономная структура без сборщика и новых зависимостей; новая логика добавляется как тестируемые чистые функции в `app.js` и используется обработчиком формы.

## Complexity Tracking

Нарушений, требующих оправдания, нет.
