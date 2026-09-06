# Implementation Plan: Закрытие HTTP и Telnet на Huawei TE40

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-06 | **Spec**: [spec.md](spec.md)

## Summary

Добавить opt-in management task в plan v3 с отдельным сеансовым XLSX-источником целей структуры SR, направлять её только точному Huawei TE40 после успешного read-only опроса, выполнять минимальное чтение/сохранение подтверждённых firmware-параметров и считать операцию успешной после повторного чтения целевых значений меню кодека.

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
- Адаптер читает `enabletelnet` и `enable_http`, отправляет только целевые значения `0` и `1` и повторно читает их.
- Если значения меню уже соответствуют цели, write не выполняется. TCP listener не входит в критерий задачи.
- Ошибка action не удаляет результаты read-only опроса, но делает результат устройства неуспешным; следующие устройства продолжают обрабатываться.
- Автоматический rollback запрещён: открытие HTTP/Telnet обратно увеличивает риск и не подтверждает исходное состояние.

## Live finding

На тестовом TE40 firmware подтвердил UI-семантику, успешный save-envelope с пустым `data` и повторное чтение `enabletelnet=0`, `enable_http=1`. TCP/80 может оставаться доступен, однако по уточнённому решению пользователя это не является ошибкой данной задачи: её результат отражает значения меню кодека.

## Complexity Tracking

Нет нарушения constitution. HTTPS-аутентификация, проверка модели, ограниченный payload и post-read остаются обязательными; изменён только явно заданный пользователем критерий результата.
