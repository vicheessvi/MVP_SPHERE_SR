# Implementation Plan: Сбор логов Huawei CloudLink 300

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-13 | **Spec**: [spec.md](spec.md)

## Summary

Подключить подтверждённый на Bar 300 потоковый `GET /log?rmd=<nonce>` с XML `LogModule` к существующей независимой опции `collectLogs`, не создавая новый экран или хранилище. Box 300/600 допускаются только при собственных exact model/identity gates и двух признаках текущего web-интерфейса; их результат остаётся предварительным до проверки пользователем каждой модели.

## Technical Context

- **Language/Version**: Python 3.11+ stdlib runtime; HTML/CSS/Vanilla JavaScript в браузере.
- **Primary Dependencies**: Только существующий стандартный runtime; новых зависимостей нет.
- **Storage**: Поток в явно выбранную папку логов с timestamp-папкой; без серверного spool.
- **Testing**: Python `unittest`, `node tests.js`, `node scripts/validate-reference.js`, проверка синтаксиса и секретов.
- **Target Platform**: Windows, авторизованный same-origin loopback runtime; прямой `file://` остаётся ручным режимом без сетевого опроса.
- **Project Type**: Локальное приложение для опроса и аналитики устройств.
- **Performance Goals**: Не буферизовать полный журнал в памяти; один поток на устройство, ошибки одного файла не останавливают следующие цели.
- **Constraints**: Exact model/identity до экспорта, разрешённый IP плана, явное согласие на самоподписанный TLS, только подтверждённый URL и схема ответа, отсутствие сырых строк в status/JSON.
- **Scale/Scope**: Три точные модели Bar 300, Box 300, Box 600; существующие режимы JSON, логи, JSON+логи и ручной импорт.

## Constitution Check

- I–V: оригинал и provenance сохраняются существующим workflow; лог не превращается автоматически в событие или достоверную аналитику без проверенного parser.
- VI: секреты остаются в памяти задания, TLS-послабление только по разрешению запуска, поток в выбранную папку без скрытых копий и внешней передачи.
- Gate PASS: bundle подтвердил точный `GET /log?rmd=…`, а read-only сеанс exact Bar 300 — HTTP 200, `application/x-octet-stream`, XML `LogModule` в префиксе. Полный поток ещё не исследован; opener обязан оставаться ограниченным и отказоустойчивым.
- Post-design recheck PASS: поток не буферизуется целиком, остаётся в уже существующем пользовательском хранилище, Box получают отдельные gates и предварительный статус; constitution 4.0.0 не нарушена.

## Project Structure

### Documentation

```text
specs/052-cloudlink-300-log-collection/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/log-export.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code

```text
mvp_runtime/adapters/huawei_300.py
mvp_runtime/polling.py
python_tests/test_huawei_300.py
python_tests/test_polling.py
product-catalog.js
docs/context-map.md
docs/implementation-log.md
```

**Structure Decision**: Использовать уже существующий `PollingJob` → loopback stream → browser-selected log root и существующий импорт. UI, server, job и схема плана не меняются, если исследованный формат совместим с текущим импортом.

## Phase 0 — Research

1. Точный export action Bar 300 подтверждён текущим bundle и read-only ответом после model/identity.
2. Метод GET, cookie текущего сеанса, MIME и XML-префикс подтверждены без сохранения сырых строк; отсутствие `Content-Length` требует потоковой передачи.
3. Box 300/600 используют только условный read при собственных model gates и bundle-маркерах; без live Box статус предварительный.

## Phase 1 — Design

1. Описать потоковый opener и `logCollection` в [contracts/log-export.md](contracts/log-export.md).
2. Описать metadata/status и отказные состояния в [data-model.md](data-model.md).
3. Описать контроль Bar и будущие проверки Box в [quickstart.md](quickstart.md).

## Implementation & Validation

Добавить минимальный opener в `huawei_300.py`, разрешённые transport в `polling.py`, синтетические тесты успеха/отказа/секретов и проверить полный локальный workflow. При отсутствии точных bundle-маркеров оставить `protocol_required`, не угадывая URI.
