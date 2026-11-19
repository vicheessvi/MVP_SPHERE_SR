# Plan: DB-first analytics

Python stdlib SQLite строит индексируемый read model в той же выбранной БД из прежних порций, с возобновляемой подготовкой. Клиент получает только bootstrap, SQL-агрегаты, страницу и operational SR context для ввода/опросов. Новые импорты имеют отдельный staging и атомарный publish; старый replacement-save из лёгкого клиента запрещён.

## Constitution Check

До и после исследования: source snapshots и файлы не меняются; вычисленные индексы расположены только в выбранной папке; auth/Origin/CSRF сохраняются. Модельные правила событий не расширяются, миллионы строк не пересылаются в браузер. Прямой file fallback сохраняется.

## Research

Два read-only исследования подтвердили: restore собирает все массивы, render ждёт синхронной аналитики; есть spread RangeError и квадратичный mean. Поэтому устраняются причины, а не только повышается лимит.

## Implementation

`mvp_runtime/read_model.py` — нормализованные таблицы, staging, SQL views; `workspace.py/server.py` — охраняемые API и миграция. `runtime/db-views.js` — запросы, bounded UI и графики, `app.js` — интеграция, временный контекст импортов и polling. Страница <=100 строк, response revision/cursor, серверные XLSX-выборки. Число записей не ограничено прикладным потолком.
