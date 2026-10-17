# Feature Specification: Закрытие HTTP и Telnet на Huawei Bar 310

**Feature Branch**: `codex/secure-local-runtime`

**Created**: 2026-09-20

**Status**: Complete — controlled real-device validation passed

**Input**: Пользователь потребовал добавить для точного Huawei CloudLink Bar 310 существующую явную задачу закрытия HTTP/80 и Telnet/23. Для контролируемой проверки подключён Bar 310; credentials переданы отдельным XLSX и не входят в feature artifacts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Закрыть HTTP на точном Bar 310 (Priority: P1)

Администратор включает существующую задачу закрытия небезопасных служб для точного Bar 310. Runtime должен сначала подтвердить exact-модель и устойчивую identity, прочитать текущее значение из меню, при необходимости выполнить одну минимальную запись и повторно прочитать значение.

**Independent Test**: синтетический Bar 310 с `enable_http=1` получает ровно один `PUT /v1/om/config` с `enable_http=0`, после чего post-read подтверждает `0`; без opt-in записи нет.

**Acceptance Scenarios**:

1. **Given** exact Bar 310, подтверждённый bundle/schema и opt-in, **When** HTTP включён, **Then** отправляется только `enable_http=0`, а успех фиксируется после post-read.
2. **Given** HTTP уже имеет значение `0`, **When** задача запущена, **Then** результат `already_compliant` и запись отсутствует.
3. **Given** модель, identity, bundle marker или схема не совпадает, **When** задача запущена, **Then** результат безопасно завершается без записи.

---

### User Story 2 - Не выполнять неподтверждённую запись Telnet (Priority: P1)

Администратор подтвердил отсутствие управления Telnet в web-интерфейсе Bar 310. Историческое чтение `enabletelnet` на одном устройстве вернуло код отсутствующего параметра; текущее действие не должно повторять этот запрос, угадывать другой endpoint или объявлять TCP/23 закрытым.

**Independent Test**: при HTTP-only задаче не отправляется ни чтение, ни запись Telnet; результат показывает `not_exposed` как отсутствие управления через web-интерфейс, а HTTP обрабатывается отдельно.

**Acceptance Scenarios**:

1. **Given** exact Bar 310 и подтверждённый HTTP-контракт, **When** запускается задача, **Then** Telnet помечается `not_exposed` без сетевого обращения к его настройке, а HTTP обрабатывается отдельно.
2. **Given** HTTP возвращает неизвестную ошибку либо неожиданную схему, **When** задача запущена, **Then** никакая запись не выполняется.

---

### User Story 3 - Сохранить остальные модели и read-only опрос без регрессии (Priority: P2)

Обычный опрос Bar 310, Box 310/610 и существующая write-задача TE20/30/40/50/60 должны сохранить свои контракты. Box-модели не получают capability закрытия портов.

**Independent Test**: каталог назначает capability только exact Bar 310 и ранее разрешённым TE; Bar без management task выполняет прежний read-only flow; Box остаются read-only.

### Edge Cases

- Значение HTTP вне подтверждённого набора `{0,1}`: fail closed, без PUT.
- Ответ PUT успешен, но post-read не равен `0`: действие ошибочно, итог опроса неуспешен.
- Сеанс разрывается после отключения HTTP: runtime делает bounded post-read по существующей HTTPS/443-сессии; при невозможности подтверждения не объявляет успех.
- Telnet неожиданно появляется в интерфейсе: текущий контракт не читает и не пишет его без отдельной controlled validation.
- Box 310/610 или неизвестный Huawei попадает в план: capability отсутствует до credentials.
- Credentials, cookie, access token, реальные IP/MAC/serial и raw error body не попадают в результат, тесты или Git.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Exact `Bar 310`, `CloudLink Bar 310` и совместимый исторический alias `CloudLinc Bar 310` MUST поддерживать существующую capability `disable_insecure_management_services` через Bar transport.
- **FR-002**: Capability MUST исполняться только при явном opt-in plan schema v3 и отдельном списке целей закрытия портов.
- **FR-003**: До любой записи MUST пройти pre-auth exact-model gate, post-auth exact-model gate, stable identity, bundle marker и config schema checks.
- **FR-004**: Runtime MUST читать HTTP через `POST /v1/om/config` с единственным ID `enable_http`.
- **FR-005**: Для exact Bar 310 безопасная цель HTTP MUST быть `enable_http=0`; запись MUST быть `PUT /v1/om/config` и содержать только один `CfgItemInt` без credentials/token в body.
- **FR-006**: Успех изменения HTTP MUST определяться post-read значения `0`; TCP listener не является критерием результата.
- **FR-007**: Runtime MUST отображать `not_exposed` как отсутствие управления Telnet через текущий web-интерфейс, не утверждая измеренное состояние TCP/23.
- **FR-008**: Runtime MUST NOT читать или записывать `enabletelnet` в рамках HTTP-only задачи для Bar 310.
- **FR-009**: `managementActions` MUST содержать безопасные состояния HTTP/Telnet, `changed`, `writeAttempted`, status и safeError без raw responses.
- **FR-010**: Обычный Bar polling без opt-in MUST оставаться GET/read-only относительно конфигурации.
- **FR-011**: Box 310/610 MUST оставаться без management capability.
- **FR-012**: Native transport MAY добавить только метод PUT; destination остаётся exact planned IPv4, HTTPS/443, bounded timeout/response и existing in-memory session.
- **FR-013**: XLSX credentials MUST перебираться сверху вниз и очищаться штатным runtime; новые постоянные credential stores запрещены.
- **FR-014**: Пользовательская справка, каталог, tests, ADR, architecture/context map и implementation log MUST быть синхронизированы.
- **FR-015**: Реальные credentials, IP/MAC/serial, runtime JSON и bundle MUST NOT попадать в repository.

### Key Entities

- **Bar 310 management contract**: exact aliases, HTTPS transport, pre/post model gates, stable identity, markers, endpoints and safe target values.
- **Management action result**: `id`, `status`, `changed`, `writeAttempted`, safe before/after service state and optional `safeError`.
- **Telnet management absence**: administrator-confirmed lack of a web control; `not_exposed` is a model-level report, not a TCP/23 measurement.

## Success Criteria *(mandatory)*

- **SC-001**: 100% negative model/identity/marker/schema scenarios perform zero PUT requests.
- **SC-002**: Compliant HTTP performs zero PUT; enabled HTTP performs exactly one minimal PUT and one post-read.
- **SC-003**: HTTP-only action performs zero Telnet reads and writes; unknown HTTP response performs zero PUT.
- **SC-004**: Box 310/610 never receive the management capability in Python or JavaScript catalogs.
- **SC-005**: Full Python, JavaScript, reference, syntax, compile and secret/IP scans pass.
- **SC-006**: Controlled real Bar 310 validation confirms HTTP disabled; the action returns `already_compliant` without a write, while Telnet remains unavailable without a guessed write.

## Assumptions

- На проверенном Bar 310 HTTP использует `0 = disable`, `1 = enable`; SystemSettingsService uses `POST/PUT /v1/om/config`. Display constants `2` не являются допустимым backend-значением текущей firmware.
- Реальное устройство подтверждает `Bar 310`, stable identity, `enable_http=0` до изменения и firmware error `100666097` for standalone `enabletelnet` read; TCP/23 is already unavailable. Реальные identifiers не сохраняются.
- Scope — только exact Bar 310. Box 310/610 и варианты с suffix остаются read-only.
