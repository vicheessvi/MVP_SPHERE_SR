# Feature Specification: Автоматический опрос Huawei TE20

**Feature Branch**: `codex/secure-local-runtime`
**Created**: 2026-09-08
**Status**: Implemented and live-validated

## User Scenarios & Testing

### User Story 1 — Выбор TE20 в плане (Priority: P1)

Администратор выбирает exact Huawei TE20 по фильтрам или точному IP и получает поддерживаемую цель отдельного transport.

**Independent Test**: TE20 получает `huawei_te20_web_cgi_v1`; TX50 и неизвестные Huawei остаются `protocol_required`.

### User Story 2 — Безопасный read-only опрос (Priority: P1)

Инструмент применяет к TE20 только exact TLS 1.1, проверяет legacy login-схему, выполняет browser-compatible вход, затем требует exact TE20 и устойчивую identity перед чтением шести разрешённых ресурсов.

**Independent Test**: Подтверждённая схема формирует совместимый JSON; schema/model drift останавливается без успешного результата, credentials отсутствуют в JSON.

### User Story 3 — Сохранение результата (Priority: P2)

Результат TE20 проходит существующий plan/job/ACK workflow и сохраняется в выбранную папку запуска как один JSON устройства.

**Independent Test**: Production routing выбирает новый adapter key и возвращает стандартные `Device Info`, `Firmware`, `Device Status`, `LAN Settings`, `Capabilities`.

## Requirements

- **FR-001**: TE20 MUST иметь отдельный exact-model manifest и transport.
- **FR-002**: Transport MUST использовать только HTTPS/443 без HTTP fallback.
- **FR-003**: Exact TLS 1.1 min/max и legacy ciphers MUST применяться только к TE20.
- **FR-004**: Unverified certificate MUST требовать явного разрешения текущего задания.
- **FR-005**: До credentials MUST проверяться exact planned TE20, login bundle и подтверждённая legacy pre-auth схема `ucTerType=0`, `ucCustomType=0`.
- **FR-006**: Сразу после входа version resource MUST содержать отдельный токен TE20 и MUST присутствовать serial либо валидный MAC.
- **FR-007**: Чтение MUST ограничиваться существующими шестью Huawei resource actions.
- **FR-008**: TE20 MUST NOT получать capability закрытия HTTP/Telnet или другие write-команды.
- **FR-009**: Credentials, cookie, CSRF и raw secret-bearing responses MUST NOT попадать в plan, JSON, state или Git.
- **FR-010**: Ручной импорт и алгоритмы Extron/TE30–TE60 MUST остаться без изменения.

## Edge Cases

- TE20 недоступен по TLS 1.1: безопасная ошибка handshake.
- Legacy pre-auth поля отсутствуют или изменены: пароль не отправляется.
- После входа устройство объявляет другую модель: результат отклоняется.
- Устройство не возвращает serial и MAC: identity не подтверждена.
- Запрошена write-задача: TE20 получает `skipped_unsupported`, запись не выполняется.

## Success Criteria

- **SC-001**: Controlled live poll проходит production routing и получает все шесть ресурсов без ошибок.
- **SC-002**: Synthetic tests подтверждают exact TLS profile, pre/post auth gates и отсутствие write.
- **SC-003**: Полные Python, JavaScript, reference, syntax и security проверки проходят.
