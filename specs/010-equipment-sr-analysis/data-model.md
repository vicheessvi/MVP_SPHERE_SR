# Data Model: Equipment analysis

## EquipmentCategoryDescriptor

- `id`: `vcs | controller | panel | switch | matrix_switch | scaler | audio_processor`
- `route`, `title`, `order`
- `srRule`: точный normalized source field/value
- `pollingProtocol`: `protocol_required` для неподтверждённых categories

## PollingRun

- `capturedAt`: timestamp из имени run folder
- `capturedAtSource`: `folder_name | planned | manual`
- Не является временем отдельного JSON результата.

## PollingResult

- `capturedAt`: ISO timestamp либо `null`
- `capturedAtSource`: `file_last_modified | unavailable`
- `sourceLastModified`: исходное число ms либо `null`
- `pollStatus`: `success | authorization_error | network_unreachable | processing_error | unknown`
- `matchStatus`: `matched | unmatched | ambiguous | ip_conflict | category_conflict`
- `internalIp`: единственный согласованный внутренний IPv4 либо `null`
- `internalIpEvidence`: подтверждённые paths и нормализованные значения без догадок по неизвестным схемам
- `historicalCandidateDeviceIds`: optional diagnostic IDs; не являются match candidates
- `normalizedData`: raw-preserving technical projection

Known timestamps сортируются по времени, затем стабильному file/result ID. Unknown timestamps размещаются детерминированно по import sequence и не участвуют в chronological diff.

## Polling IP indexes (ephemeral)

- `currentInventoryByIp`: только текущий `ipNormalized` устройства с `inCurrentSr !== false`; единственный источник automatic matching.
- `historicalInventoryByIp`: значения `ipHistory`, используемые только для диагностической подсказки при отсутствии current match.
- IP из historical index никогда не создаёт `deviceId` у нового результата.

## AnalyzedParameterRule

- `id`: стабильный системный ID
- `category`
- `manufacturerNormalized`: optional exact scope
- `modelNormalized`: optional exact scope
- `path`: JSON path от `normalizedData`
- `label`: русское пользовательское название
- `rationale`: доказанная цель анализа
- `version`

Rule matches when category equals and all supplied specializations equal. Более специфичное правило дополняет общие rules без fallback к raw diff.

## DeviceChange

- `ruleId`, `path`, `parameterLabel`, `rationale`
- `oldValue`, `newValue`
- `detectedAt`, `deviceId`, `fromResultId`, `toResultId`
- Unknown-time results не создают соседние temporal pairs.

## SrImportProgress (ephemeral)

- `stage`: `reading | parsing | processing | inventory | analytics | complete | failed`
- `stageLabel`: русская подпись
- `processed`, `total`, `accepted`, `rejected`
- `startedAt`, `elapsedMs`, `yields`

Не входит в persistent state и очищается после reload вместе со всей вкладкой.

## InventoryDevice fallback identity

- `sourceFallbackKey`: локальный составной ключ только для строки без inventory/serial/MAC/IP.
- Основа: normalized локация, категория, тип оборудования, тип модели, производитель, модель и наименование.
- Ordinal различает несколько одинаково описанных экземпляров одной выгрузки.
- Отсутствие strong/network identity создаёт warning `missing_identity`, но не исключает устройство из inventory.
- Эфемерный `srRecordFingerprint` включает нормализованную локацию, категорию, техническое описание и доступные identifiers; в persisted state не записывается.
- `identity_collision`: совпавший precedence-key уже занят несовпадающей строкой текущего импорта; обе строки остаются отдельными устройствами.
- `duplicate_sr_row`: fingerprint и identifiers совпадают; повтор использует существующее устройство.
