# Implementation Plan: возобновляемый импорт логов

**Branch**: `codex/secure-local-runtime` | **Spec**: [spec.md](spec.md)

## Summary

Ревизии из порций SQLite, независимые файловые checkpoint, ограниченный параллельный разбор и фактическая скорость чтения в UI.

## Technical Context

Windows, Vanilla JS, Web Workers, Python 3.11 stdlib SQLite, существующий loopback и admin gate. Проверки: `node tests.js`, `python -m unittest discover -s python_tests`.

## Constitution Check

До и после проектирования: оригиналы не копируются, права доступа и модельные правила не расширяются. Незавершённое состояние хранится отдельно в выбранной БД; завершённая ревизия публикуется атомарно. При обновлении читается старая схема, без удаления пользовательской папки.

## Structure

`app.js` — транспорт, импортер, индикаторы; `runtime/huawei-*-log-events.js` — блоки чтения; `mvp_runtime/workspace.py` и `server.py` — транзакции и API. Дополнительных зависимостей нет.
