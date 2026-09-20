# Feature Specification: Отдельные контракты Huawei Box 310 и Box 610

**Feature Branch**: `codex/secure-local-runtime`

**Created**: 2026-09-20

**Status**: Complete — implementation ready; Box 310/610 evidence remains provisional until user validation

**Input**: User description: "Сделать отдельные контракты на Bar 310, Box 310 и Box 610, чтобы затем проверить Box-модели на рабочем компьютере."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Проверить Box 310 отдельным контрактом (Priority: P1)

Администратор выбирает точный Huawei CloudLink Box 310 в плане автоматического опроса и запускает безопасную проверку совместимости. Контракт не должен выдавать себя за подтверждённый Bar 310 и не должен отправлять пароль, пока устройство само не объявит точную модель Box 310 и ожидаемый web-контракт.

**Why this priority**: Пользователю необходимо проверить гипотезу совместимости на рабочем устройстве без риска передать пароль другому оборудованию.

**Independent Test**: Синтетический exact Box 310 проходит отдельный контракт и формирует совместимый JSON; любая другая pre-auth модель блокирует credential loop.

**Acceptance Scenarios**:

1. **Given** план содержит Huawei Box 310 и устройство до входа объявляет exact Box 310 с полным набором признаков web-контракта, **When** одна пара credentials принимается и обязательные read-only ресурсы имеют ожидаемую схему, **Then** формируется результат с контрактом Box 310 и пометкой предварительной эксплуатационной проверки.
2. **Given** IP фактически принадлежит Bar 310, Box 610 или неизвестному устройству, **When** запускается контракт Box 310, **Then** он останавливается до отправки credentials.

---

### User Story 2 - Проверить Box 610 отдельным контрактом (Priority: P1)

Администратор выбирает точный Huawei CloudLink Box 610 и получает те же безопасные границы, но отдельный contract ID и exact-model gate.

**Why this priority**: Box 610 должен тестироваться независимо; успешный Box 310 не является доказательством Box 610.

**Independent Test**: Синтетический exact Box 610 проходит только свой контракт, а Box 310/Bar 310 блокируются до credentials.

**Acceptance Scenarios**:

1. **Given** план содержит Huawei Box 610 и устройство подтверждает exact Box 610 до и после входа, **When** разрешённые ресурсы прочитаны, **Then** результат связан с отдельным контрактом Box 610.
2. **Given** обязательный marker, identity или схема ответа отсутствует, **When** выполняется опрос, **Then** результат безопасно завершается без ложного успеха и без секретов.

---

### User Story 3 - Сохранить подтверждённый Bar 310 без регрессии (Priority: P2)

Существующий Huawei Bar 310 продолжает использовать собственный подтверждённый контракт. Общий код транспорта не должен смешивать модели, contract ID или статус подтверждения.

**Why this priority**: Новая тестовая поддержка Box не должна снижать надёжность уже проверенного Bar 310.

**Independent Test**: Полная существующая матрица Bar 310 проходит без изменения внешнего результата и contract ID.

**Acceptance Scenarios**:

1. **Given** exact Bar 310, **When** выполняется опрос после добавления Box-контрактов, **Then** результат по-прежнему содержит `huawei-bar310-rest-v1` и подтверждённый статус.
2. **Given** пользователь выбирает Box 310 или Box 610, **When** строится план, **Then** каталог назначает отдельный transport и не назначает задачу закрытия HTTP/Telnet.

### Edge Cases

- Box возвращает другое точное написание модели или другую firmware-схему: контракт блокирует credentials либо результат и сообщает безопасный код.
- План ошибочно помечен как Box 310, но IP ведёт на Box 610/Bar 310: credentials не отправляются.
- Устройство использует документированный `action.cgi` API, но не проверенный `/v1` web-flow: результат `unsupported_web_contract`, без fallback и без попытки угадать API.
- Все пары credentials отклонены: порядок сверху вниз сохраняется, значения не выводятся.
- Один обязательный read-only ресурс изменил схему: ложный успешный результат не создаётся.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Система MUST сохранять независимый подтверждённый контракт Bar 310.
- **FR-002**: Система MUST иметь отдельный contract ID и exact-model gate для Box 310.
- **FR-003**: Система MUST иметь отдельный contract ID и exact-model gate для Box 610.
- **FR-004**: Каждый Box-контракт MUST проверять модель и полный marker set до первой передачи credentials.
- **FR-005**: Каждый Box-контракт MUST повторно проверять точную модель и устойчивую identity после входа.
- **FR-006**: Box-контракты MUST выполнять только подтверждаемые GET-only операции чтения; write-задачи, перезагрузка и закрытие портов исключены.
- **FR-007**: Box-контракты MUST перебирать credentials сверху вниз, хранить cookie/token только в памяти задания и очищать их во всех terminal paths.
- **FR-008**: Результат Box MUST быть совместим с существующими блоками `Device Info`, `Firmware`, `Device Status`, `LAN Settings`, `Capabilities` и явно содержать provisional evidence status до пользовательской проверки.
- **FR-009**: Каталог и интерфейс MUST выбирать Box 310 и Box 610 раньше общего Huawei fallback и не смешивать transports моделей.
- **FR-010**: Несовпадение bundle/model/schema MUST завершаться безопасным кодом без credentials, токена, cookie, raw headers или raw body в результате.
- **FR-011**: Реальные IP, credentials, MAC, serial и runtime JSON MUST NOT попадать в repository, тесты или документацию.
- **FR-012**: После пользовательской проверки provisional-статус каждой Box-модели MUST изменяться только отдельным документированным решением.

### Key Entities

- **Model contract**: contract ID, exact pre/post model, plan aliases, evidence status и разрешённые ресурсы.
- **Polling result**: совместимые блоки данных, safe diagnostics и статус подтверждения контракта.
- **Catalog manifest**: точная категория, производитель, модель, transport и memory-only credential mode.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% синтетических cross-model сценариев блокируют credentials до входа.
- **SC-002**: Box 310 и Box 610 получают разные contract IDs и разные manifest keys во всех Python/JavaScript resolvers.
- **SC-003**: 100% результатов и ошибок не содержат synthetic secrets, cookie или access token.
- **SC-004**: Существующая полная матрица Bar 310 и проекта проходит без регрессии.
- **SC-005**: Пользователь может запустить каждый Box-контракт на рабочем компьютере и получить либо совместимый provisional JSON, либо безопасный объяснимый отказ.

## Assumptions

- Официальное руководство Huawei подтверждает общую API-семью Box 310, Box 610 и Bar 310, но не доказывает, что установленная firmware Box использует тот же внутренний `/v1` web-flow.
- Первый выпуск Box-контрактов является guarded/provisional и не считается эксплуатационно подтверждённым до пользовательского запуска.
- Поддерживаются только exact `Box 310` и `Box 610`; варианты `-S`, `-C`, `-K` остаются вне scope.
- Прямой `index.html` не выполняет сетевой опрос; проверка запускается через Python runtime.
