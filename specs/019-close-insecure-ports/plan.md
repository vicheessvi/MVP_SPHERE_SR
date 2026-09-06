# Implementation Plan: Закрытие HTTP и Telnet на Huawei TE40

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-06 | **Spec**: [spec.md](spec.md)

## Summary

Добавить opt-in management task в plan v3 с отдельным сеансовым XLSX-источником целей структуры SR, направлять её только точному Huawei TE40 после успешного read-only опроса, выполнять минимальное чтение/сохранение подтверждённых firmware-параметров и считать операцию успешной лишь после повторного чтения и TCP-проверки 23/80/443.

## Technical Context

**Language/Version**: Python 3.11+ standard library; Vanilla JavaScript

**Dependencies**: существующие `http.client`, `ssl`, `socket`, каталог, polling/job/server; сторонние пакеты отсутствуют

**Storage**: прежняя память сессии и выбранная пользователем папка JSON

**Testing**: Python `unittest`, Node regression, reference validator, compileall, live controlled verification

**Target**: Windows 10/11; loopback runtime; Huawei TE40 HTTPS/443

## Constitution Check

**Pre-design: PASS. Post-design: PASS.** Задача выключена по умолчанию; exact-IP и двойная проверка модели предшествуют записи; payload ограничен двумя параметрами; результат redacted; credentials остаются в памяти; неизвестный contract и несовпадение фактических портов завершаются fail closed. Исключений нет.

## Design

- Plan schema v3 содержит массив `managementTasks`; runtime v2 обязан отклонить новый план, а не проигнорировать изменение.
- При выбранной задаче cascade/IP selection строится только по `managementTargetDevices`, атомарно разобранным из отдельного XLSX; основная SR не требуется и не изменяется.
- План хранит только безопасную runtime-проекцию целей, `targetSource=port_closure_list` и SHA-256 файла; raw XLSX-строки не сохраняются.
- Общий каталог отдельно описывает capability точной TE40; read-only опрос TE30/TE50/TE60 не означает право изменять их настройки.
- Адаптер читает `enabletelnet` и `enable_http`, отправляет только целевые значения `0` и `1`, повторно читает их и проверяет TCP/23 закрыт, TCP/80 закрыт, TCP/443 открыт.
- Если параметры и listener уже соответствуют цели, write не выполняется.
- Ошибка action не удаляет результаты read-only опроса, но делает результат устройства неуспешным; следующие устройства продолжают обрабатываться.
- Автоматический rollback запрещён: открытие HTTP/Telnet обратно увеличивает риск и не подтверждает исходное состояние.

## Live finding

На тестовом TE40 firmware подтвердил UI-семантику и успешный save-envelope с пустым `data`. При этом `enable_http=1` и отключённый Telnet подтверждены, TCP/23 закрыт и TCP/443 открыт, однако TCP/80 остаётся доступен и отдаёт HTTP 200. Поэтому SC-005 не закрыт; реализация сохраняет fail-closed статус вместо ложного успеха.

## Complexity Tracking

Нет нарушения constitution. Незакрытый TCP/80 является ограничением подтверждённого vendor behavior, а не основанием ослабить критерий успеха.
