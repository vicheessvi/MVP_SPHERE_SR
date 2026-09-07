# Feature Specification: Закрытие HTTP и Telnet на Huawei TE30/TE40/TE50/TE60

**Feature Branch**: `codex/secure-local-runtime`

**Created**: 2026-09-07

**Status**: Implemented with guarded provisional support for TE30/TE50/TE60

**Input**: Расширить существующую задачу закрытия HTTP и Telnet с Huawei TE40 на Huawei TE30, TE50 и TE60, сохранив один общий алгоритм и прежние ограничения безопасности.

## User Scenarios & Testing

### User Story 1 — Единый выбор поддерживаемого семейства (Priority: P1)

Администратор МЦТП включает задачу и выбирает из отдельного списка точные модели Huawei TE30, TE40, TE50 или TE60 теми же фильтрами либо по точному IP.

**Independent Test**: Каждая из четырёх моделей считается допустимой целью; TE20, TX50, неизвестная Huawei и другой производитель пропускаются без write-команды.

### User Story 2 — Guarded изменение конфигурации (Priority: P1)

После обычного опроса устройство проходит повторные проверки модели, идентичности и совместимости текущего web-контракта. Только затем инструмент читает и изменяет два разрешённых значения меню.

**Independent Test**: Для каждой exact-модели подтверждённая синтетическая схема получает один минимальный save и post-read; mismatch либо schema drift получает ноль save.

### User Story 3 — Проверяемый результат без секретов (Priority: P2)

JSON сообщает `applied`, `already_compliant`, `skipped_unsupported` или `failed`, не раскрывая credentials, cookie, CSRF и raw response.

**Independent Test**: Все четыре модельных сценария проходят redaction и сохраняют прежний последовательный ACK workflow.

## Edge Cases

- Точная модель до входа либо после входа отличается от плана: запись запрещена.
- Bundle не содержит все action/config markers либо ответ чтения имеет другую схему: запись запрещена.
- Значения уже целевые: save не выполняется.
- Post-read не подтверждает оба значения: результат ошибочный, автоматический rollback запрещён.
- TCP listener остаётся доступен при целевых значениях меню: результат считается успешным по согласованному критерию.

## Requirements

- **FR-001**: Capability MUST быть разрешена ровно для Huawei TE30, TE40, TE50 и TE60.
- **FR-002**: Все четыре модели MUST использовать один общий guarded алгоритм без модельных копий.
- **FR-003**: Явный opt-in, plan schema v3, отдельный XLSX целей и точный IP MUST сохраняться без изменения.
- **FR-004**: До write MUST совпасть planned, pre-auth и post-auth exact-модель и MUST быть подтверждена identity.
- **FR-005**: Наличие `WEB_GetCfgParamAPI`, `WEB_SaveCfgParamAPI`, `enabletelnet` и `enable_http` в текущем bundle MUST быть обязательным.
- **FR-006**: Перед write оба значения MUST быть успешно прочитаны по подтверждённой схеме.
- **FR-007**: Save MUST содержать только `enabletelnet=0` и `enable_http=1`; любые другие config ID запрещены.
- **FR-008**: Успех MUST определяться повторным чтением двух целевых значений меню; TCP probe MUST NOT менять статус.
- **FR-009**: Неизвестная модель, несовпадение модели, identity failure, неизвестный bundle и schema drift MUST завершаться без write.
- **FR-010**: Результат и ошибки MUST оставаться redacted, а credentials MUST существовать только в памяти задания.
- **FR-011**: Интерфейс и Справочник MUST перечислять все четыре поддерживаемые модели и не утверждать live-подтверждение write для TE30/TE50/TE60 до реального теста.
- **FR-012**: Обычный read-only опрос и ручная загрузка MUST остаться без изменения.

## Key Entities

- **Management capability**: общий exact-model allowlist из четырёх моделей.
- **Guarded contract decision**: результат проверки модели, identity, markers и схемы до записи.
- **Action result**: безопасный статус и подтверждённые состояния меню до/после.

## Assumptions

- TE30/TE50/TE60 имеют тот же web-CGI contract на проверяемых прошивках; предположение подтверждается runtime-проверками до каждой записи и требует контролируемой live-validation.
- Реальная write-операция уже подтверждена только на TE40.

## Success Criteria

- **SC-001**: 100% четырёх exact-моделей проходят catalog/UI/runtime synthetic capability tests.
- **SC-002**: 100% неподдерживаемых и mismatch/schema-drift сценариев выполняют ноль save-команд.
- **SC-003**: Каждый успешный сценарий отправляет ровно два разрешённых значения и подтверждает их post-read.
- **SC-004**: 100% regression/reference/security проверок проходят без появления секретов и реальных инфраструктурных данных.
