# Implementation Plan: Device log collection

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

## Summary

Расширить existing plan/job ACK-поток двумя флагами `collectJson`/`collectLogs`. Exact TE20 после model/identity получает XML через `/log?actkn=...`; exact TE30/40/50/60 при своих bundle-маркерах используют отдельный `/log?Token=...`. Браузер пишет поток в выбранную папку. В режиме только логов API-результат подтверждает прогресс, но JSON-файл не создаётся, а журнал продолжения записывается в папку логов. Для иных моделей нет log-запроса. Ручной импорт вычисляет только метаданные и признаки формата.

## Technical Context

Python 3.11+ stdlib, Vanilla JS, Windows loopback, browser File System Access API. Новых зависимостей и серверного дискового spool нет. Одновременно один pending log, выдача чанками. Оригиналы остаются только в пользовательской папке.

## Constitution Check

До исследования и после проектирования: I–V PASS — исходный лог не модифицируется, качество/identity явно отмечаются; VI PASS — только локальная сеть к точному IP и same-origin loopback, credentials только в памяти, без внешней передачи и скрытых копий. Неизвестный контракт не запускает сеть. Исключений нет.

## Project Structure

`app.js`, `mvp_runtime/adapters/huawei_te40.py`, `mvp_runtime/polling.py`, `mvp_runtime/polling_job.py`, `mvp_runtime/server.py`, `runtime/polling-recovery.js`, `tests.js`, `python_tests/`, `product-catalog.js`, `docs/`.

## Complexity Tracking

Существующий ACK-контракт расширяется отдельной потоковой выдачей, чтобы не помещать потенциально большой лог в JSON и не создавать временный файл.
