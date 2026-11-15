# Implementation Plan: Сбор логов Polycom Group

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary

Добавить read-only экспорт оригинального `.tgz` в общий guarded Polycom adapter после его текущих exact model/identity и web-bundle gates; поток передавать существующему browser ACK без server spool. Расширить только явную цепочку имени/MIME/формата `.tgz` в job, loopback server, браузерной записи и метаданных импорта. Старые `.xml` контракты Huawei не меняются. После реализации администратор отдельно подтвердил успешный сбор логов Group 300/310/500/700 на проверенных устройствах.

## Technical Context

- **Language/Version**: Python 3.11+ standard library, Vanilla JavaScript.
- **Dependencies**: Новых нет; существующие browser File System Access API и локальная Python stdlib.
- **Storage**: Только пользовательская папка логов с timestamp-папкой, без сервера-хранилища; session/jobs в памяти.
- **Testing**: Python `unittest`, `node tests.js`, syntax/compile/reference checks, controlled Group 310 read-only export.
- **Target Platform**: Windows, локальный loopback runtime, HTTPS/443 к явно выбранной цели.
- **Project Type**: Локальное browser-приложение с Python runtime.
- **Performance Goals**: Потоковые порции 64 КиБ, без полного архива в состоянии приложения; ограничение сжатого потока 64 МиБ и таймаутов.
- **Constraints**: Нет write, HTTP fallback, архива в JSON/diagnostics, извлечения на диск или новых внешних сервисов.
- **Scale/Scope**: Четыре exact модели, один общий экспортный контракт с отдельными model gates, существующие план/импорт.

## Constitution Check

До исследования: PASS. Лог сохраняется только по явному выбору и не меняет исходные данные; модель и идентичность проверяются до экспорта; неизвестная схема даёт отказ, не подмену файла. После проектирования: PASS при условии точного URL из текущего bundle, ограничения размера/формата, отсутствия raw log в JSON/API status и fail-isolated сохранения. Устройство не изменяется, credentials остаются только в памяти задания. Нарушений нет.

## Project Structure

```text
mvp_runtime/adapters/polycom_group.py   # exact post-auth export and bounded stream
mvp_runtime/polling.py                  # allowlisted log transports
mvp_runtime/polling_job.py              # format-specific pending log metadata
mvp_runtime/server.py                   # explicit content type for stream
app.js                                  # browser save and metadata-only import
python_tests/test_polycom_group.py     # adapter contract tests
python_tests/test_polling.py           # routing and plan tests
python_tests/test_polling_job.py       # ACK and filename tests
python_tests/test_server.py            # loopback MIME/stream tests
tests.js                                # UI save/import/regression tests
product-catalog.js                     # Справочник
docs/context-map.md
docs/decisions/ADR-0059-polycom-group-log-collection.md
specs/056-polycom-group-log-collection/
```

## Complexity Tracking

Нарушений constitution нет. Расширение формата затрагивает несколько звеньев только потому, что текущие безопасные проверки явно допускают исключительно XML; ослабление этих проверок без отдельного `.tgz` allowlist недопустимо.
