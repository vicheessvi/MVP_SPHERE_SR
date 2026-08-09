# Feature Specification: Secure local polling runtime

**Feature Branch**: `003-secure-local-polling`

**Created**: 2026-08-10

**Status**: Approved for implementation

**Input**: Remove legacy audit modules, eliminate artificial storage quotas, keep only Administrator МЦТП, protect all files/analytics locally, accept a credentials file and prepare polling scripts for the supplied manufacturer/model catalog.

## User Scenarios & Testing

### User Story 1 - Защищённая локальная эксплуатация (Priority: P1)

Администратор запускает инструмент на своём Windows-компьютере и работает с SR, polling results и аналитикой без передачи данных за пределы компьютера и без browser-storage quota.

**Why this priority**: Без локальной защищённой границы нельзя безопасно принимать credentials и инфраструктурные данные.

**Independent Test**: Запустить инструмент, сохранить state больше прежнего лимита, перезапустить runtime и убедиться, что данные восстановлены, файлы на диске не читаются как открытый JSON, а runtime недоступен через non-loopback interface.

**Acceptance Scenarios**:

1. **Given** локальный runtime, **When** он запускается, **Then** он принимает UI/API только через loopback и не использует CDN/telemetry.
2. **Given** загруженные SR/JSON и analytics, **When** исследуется data directory без активного пользователя, **Then** содержимое находится в зашифрованном виде.
3. **Given** state больше 4 MiB, **When** он сохраняется, **Then** приложение не применяет искусственную quota и ограничивается доступным диском.

---

### User Story 2 - Единственная роль и целевой UI (Priority: P2)

Пользователь работает только как «Администратор МЦТП» и видит Dashboard, Терминалы ВКС, Контроллеры, Панели управления, Загрузку и защищённое локальное хранилище.

**Why this priority**: Legacy audit workflow и фиктивная role matrix больше не соответствуют назначению инструмента.

**Independent Test**: Открыть UI и убедиться, что legacy routes недоступны, а state после migration содержит только одну активную роль.

**Acceptance Scenarios**:

1. **Given** обновлённый UI, **When** отображается navigation, **Then** «Проекты аудита», «События», «Сопоставления» и «Снимки» отсутствуют.
2. **Given** legacy state, **When** выполняется migration, **Then** сохраняется только Administrator МЦТП и ссылки на удалённые роли не используются.

---

### User Story 3 - Защищённый credential vault (Priority: P3)

Администратор загружает JSON или CSV с IP, login и password для polling. Секреты становятся доступны только polling runtime и не отображаются/не экспортируются.

**Why this priority**: Provider polling требует authentication, но секреты должны быть отделены от аналитики.

**Independent Test**: Импортировать synthetic credential file, проверить summary, затем убедиться, что пароль отсутствует в state, API responses, logs и backup, а vault-файл не содержит plaintext.

**Acceptance Scenarios**:

1. **Given** валидный credential file, **When** он импортируется, **Then** UI показывает только количество и masked identifiers.
2. **Given** malformed/duplicate rows, **When** файл импортируется, **Then** ошибки не содержат passwords и прежний vault не повреждается.
3. **Given** запрос чтения vault через UI API, **When** он выполняется, **Then** секретные значения никогда не возвращаются.

---

### User Story 4 - Безопасные polling scripts (Priority: P4)

Администратор формирует запуск по SR. Система разрешает общий reachability/ping этап, выбирает adapter по category/manufacturer/model и выполняет vendor polling только при наличии проверенного protocol contract.

**Why this priority**: Модельный каталог известен, но список моделей сам по себе не определяет API, поэтому execution должен быть честным и расширяемым.

**Independent Test**: Передать synthetic inventory для Huawei/Polycom/Cisco/Yealink/Extron и других catalog devices; проверить routing, ping output, безопасное `protocol_required` для недокументированных adapters и отсутствие внешних адресов.

**Acceptance Scenarios**:

1. **Given** известная модель, **When** строится polling plan, **Then** category/manufacturer/model route определяется без изменения raw SR.
2. **Given** ping failure, **When** выполняется probe, **Then** результат содержит `failedStage=ping` и `ping.ok=false`.
3. **Given** отсутствующий protocol contract, **When** requested vendor polling, **Then** runtime не отправляет credentials и возвращает `protocol_required`.

### Edge Cases

- Data directory недоступен, диск заполнен или DPAPI key нельзя расшифровать.
- Runtime уже запущен, launch token повторно используется либо запрос имеет чужой Origin.
- Credential file пуст, имеет unknown columns, duplicate IP или spreadsheet formula injection text.
- Poll target не IPv4, loopback/multicast/broadcast либо отсутствует в актуальной SR.
- Polling process завершается по timeout; stdout/stderr потенциально содержит секрет.
- Legacy browser-only `localStorage` существует при первом secure-runtime запуске.

## Requirements

### Functional Requirements

- **FR-001**: Product MUST run through a local runtime and MUST refuse non-loopback binding.
- **FR-002**: Product MUST NOT make product-network requests except explicit polling of SR-selected device IPs.
- **FR-003**: Uploaded files, state and analytics MUST be encrypted at rest with a key bound to the current OS user.
- **FR-004**: Product MUST remove the 4 MiB state/raw limits and MUST report disk/storage errors without corrupting prior data.
- **FR-005**: Navigation MUST contain only Dashboard, VCS terminals, Controllers, Control panels, Upload and Local storage.
- **FR-006**: Product MUST expose only the role Administrator МЦТП.
- **FR-007**: Credential import MUST support JSON and CSV records with IP, username/login and password.
- **FR-008**: Credentials MUST be stored in a separate encrypted vault and MUST NOT appear in state, analytics, logs, diagnostics, backup, DOM or read API.
- **FR-009**: Credential replacement MUST be atomic and duplicate IP MUST be rejected or explicitly resolved.
- **FR-010**: Polling routing MUST use normalized category/manufacturer/model while preserving raw SR values.
- **FR-011**: A known-model catalog MUST cover all manufacturer/model lists supplied in requirements without treating it as proof of protocol support.
- **FR-012**: Polling scripts MUST implement bounded reachability/ping and MUST produce the established ping-failure shape.
- **FR-013**: Vendor polling MUST be blocked with `protocol_required` until a verified protocol/auth/response contract is registered.
- **FR-014**: Polling MUST allow only valid unicast IP targets selected from current SR inventory.
- **FR-015**: Every polling run MUST preserve immutable raw output, normalized status and per-device errors without secrets.
- **FR-016**: The application MUST preserve existing SR inventory, polling history and analytics behavior during migration.
- **FR-017**: Security headers, same-origin checks, anti-CSRF launch/session protection and no-store caching MUST protect local HTTP interaction.
- **FR-018**: No commit, push, deployment, telemetry or cloud storage is part of this feature.

### Key Entities

- **SecureRuntimeSession**: Ephemeral local launch/session authorization; never persisted as analytics.
- **EncryptedObject**: Versioned authenticated ciphertext for state, raw imports and analytics.
- **CredentialVault**: OS-bound encrypted map from normalized device IP to username/password and metadata.
- **PollingAdapterManifest**: Category, manufacturer aliases, known models, support state and required protocol contract.
- **PollingExecution**: Explicit run, selected devices, bounded status and references to raw encrypted results.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Automated inspection finds zero plaintext synthetic passwords in persisted state, backups, logs and API responses after credential import.
- **SC-002**: A state payload above 4 MiB round-trips successfully when disk space is available.
- **SC-003**: 100% of supplied manufacturer/model entries resolve to a catalog manifest or an explicit unsupported status.
- **SC-004**: 100% of non-loopback bind attempts and non-SR polling targets are rejected.
- **SC-005**: All legacy and new applicable automated tests pass; removed UI modules are unreachable.
- **SC-006**: A polling target without verified protocol performs no credential-bearing vendor request and reports `protocol_required`.

## Assumptions

- Target platform for the protected runtime is Windows under one OS user; Windows DPAPI is available.
- “No storage limit” means no artificial application quota; physical disk, filesystem and memory remain finite.
- Credential files are intentionally plaintext at input and are protected immediately after local import; the source file remains the administrator's responsibility.
- Model names identify dispatch candidates but do not prove an API. Only ping is enabled without additional vendor protocol documentation.
- Existing project data can be migrated into the encrypted store; browser-only direct opening is no longer the protected operating mode.
