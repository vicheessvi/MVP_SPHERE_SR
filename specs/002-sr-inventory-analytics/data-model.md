# Data Model: SR inventory, polling history and analytics

## State Container v2

The v2 persistent state retains all v1 fields and adds:

```text
version: 2
users, projects, snapshots, assets, matchDecisions, changeSets,
baselineAssignments, reviewDecisions, retentionAudits, history
srImports: SRImport[]
locations: Location[]
inventoryDevices: Device[]
pollingRuns: PollingRun[]
pollingResults: PollingResult[]
deviceChanges: DeviceChange[]
inventoryIssues: InventoryIssue[]
settings.ignoredPollingPaths: string[]
currentUserId: null
```

The active login stays in `sessionStorage` and never enters persistent state or backup.

## SRImport

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique local ID |
| `filename` | string | Safe display name |
| `fileSha256` | string | Duplicate/provenance hash |
| `sheetName` | string | Imported worksheet |
| `headers` | string[] | Raw headers |
| `rowCount` | number | Data rows seen |
| `acceptedCount` | number | Rows merged into inventory |
| `issueCount` | number | Row/header issues |
| `importedAt` | ISO datetime | Local import time |
| `importedById` | string | Demo administrator |
| `status` | enum | `processed`, `partial`, `failed`, `duplicate` |

Raw XLSX bytes are not persisted. Raw cell values required for inventory are stored in each Device revision.

## Location

| Field | Type | Rules |
|---|---|---|
| `id` | string | Stable local ID |
| `nameRaw` / `nameNormalized` | string | From «Название комнаты» |
| `addressRaw` / `addressNormalized` | string | From «Адрес комнаты» |
| `vip` | boolean/null | Unknown remains null |
| `domainRaw` / `domainNormalized` | string/null | Optional |
| `inCurrentSr` | boolean | Current SR membership |
| `createdAt`, `updatedAt` | ISO datetime | Audit fields |

Location matching uses normalized name + address. Ambiguity creates an issue.

## Device

| Field | Type | Rules |
|---|---|---|
| `id` | string | Stable local identity |
| `locationId` | string/null | Linked Location |
| `category` | enum | `vcs`, `controller`, `panel`, `other` |
| `categorySource` | string | SR rule/evidence |
| `nameRaw`, `nameNormalized` | string/null | Equipment name |
| `equipmentTypeRaw`, `equipmentTypeNormalized` | string/null | «Тип оборудования» |
| `modelTypeRaw`, `modelTypeNormalized` | string/null | «Тип модели» |
| `manufacturerRaw`, `manufacturerNormalized` | string/null | Alias only in normalized value |
| `modelRaw`, `modelNormalized` | string/null | SR model |
| `ipRaw`, `ipNormalized` | string/null | Invalid normalized IP is null |
| `macRaw`, `macNormalized` | string/null | Existing MAC normalizer |
| `sipUriRaw`, `sipUriNormalized` | string/null | Optional |
| `domainRaw`, `domainNormalized` | string/null | Optional |
| `inventoryNumberRaw`, `inventoryNumberNormalized` | string/null | Strong identity candidate |
| `serialNumberRaw`, `serialNumberNormalized` | string/null | Strong identity candidate |
| `vipEquipment` | boolean/null | Unknown remains null |
| `inCurrentSr` | boolean | False never deletes history |
| `firstSeenSrImportId`, `lastSeenSrImportId` | string | Provenance |
| `rawSrRow` | object | Raw mapped values, no workbook bytes |
| `pollingSupport` | enum | `supported`, `not_implemented`, `unknown` |
| `pollingAdapterKey` | string/null | Registry key only, no credentials |
| `createdAt`, `updatedAt` | ISO datetime | Audit fields |

Identity merge order: inventory number → serial + manufacturer → MAC → current IP. Multiple candidates at any level are ambiguous and do not auto-merge.

## PollingAdapterDescriptor

Static, non-secret registry entry:

- `key`;
- `category`;
- `manufacturerNormalized`;
- optional model matcher;
- `support`: `supported`, `not_implemented`;
- `transport`: nullable until real implementation;
- `normalizerKey`;
- `credentialMode`: `not_configured` until a secure mechanism exists.

The first slice has descriptor placeholders for `controller/extron` and `panel/extron`, both `not_implemented`. Other devices resolve to `not_implemented` or `unknown`; no adapter sends requests.

## PollingRun

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique |
| `source` | enum | `folder_import`, `planned` |
| `folderName` | string/null | Raw folder name |
| `capturedAt` | ISO datetime/null | Parsed/manual run time |
| `capturedAtSource` | enum | `folder_name`, `manual`, `unknown` |
| `createdAt` | ISO datetime | Import/plan time |
| `createdById` | string | Demo administrator |
| `category` | enum/null | Plan filter |
| `deviceIds` | string[] | Planned/import matched devices |
| `selectedCount` | number | Plan summary |
| `successCount`, `errorCount`, `unmatchedCount` | number | Derived import summary |
| `status` | enum | `planned`, `importing`, `completed`, `partial`, `failed`, `blocked_no_adapter` |
| `issues` | object[] | Run-level safe issues |

## PollingResult

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique |
| `runId` | string | Required |
| `deviceId` | string/null | Null when unmatched |
| `filename` | string | Safe display name |
| `filenameIp` | string/null | Normalized IPv4 from filename |
| `rawText` | string | Immutable at application level |
| `rawSha256` | string | Duplicate/provenance hash |
| `capturedAt` | ISO datetime/null | Run timestamp |
| `importedAt` | ISO datetime | Local time |
| `schemaProfile` | string | Existing Extron detection or `unknown` |
| `jsonDeviceType` | enum | `controller`, `panel`, `unknown` |
| `matchStatus` | enum | `matched`, `unmatched`, `ambiguous`, `classification_conflict` |
| `pollStatus` | enum | `success`, `error`, `partial`, `unknown` |
| `pingStatus` | enum | `ok`, `failed`, `unknown` |
| `authorizationStatus` | enum | `ok`, `failed`, `unknown` (first slice only `unknown`) |
| `rebootCount` | number/null | Null until rule exists |
| `gcPlus` | boolean/null | Null until rule exists |
| `normalizedData` | object/null | Deterministic diff input |
| `issues` | InventoryIssue[] | File-specific issues |

Duplicate key: `rawSha256 + capturedAt + filenameIp`. Same bytes from a distinct confirmed run time may represent a separate observation and are retained.

## DeviceChange

- `id`, `deviceId`;
- `fromPollingResultId`, `toPollingResultId`;
- `detectedAt` from target run;
- `fieldPath`;
- typed `oldValue`, `newValue`;
- `category`: `configuration`, `runtime`, `data_quality`;
- `ruleId`, `rulesetVersion`;
- `status`: `active`, `superseded`.

Changes are reconciled in chronological device order. Formatting/key-order differences do not create events. Configured ignored paths are excluded explicitly.

## InventoryIssue

- `id`;
- optional `srImportId`, `rowNumber`, `runId`, `pollingResultId`, `deviceId`;
- `code`;
- `severity`;
- `message` containing no secrets;
- `sourcePath` or column;
- `createdAt`.

Required codes include `missing_required_column`, `invalid_ip`, `duplicate_identity`, `invalid_run_timestamp`, `malformed_json`, `empty_json`, `unmatched_ip`, `unknown_structure`, `missing_controller_type`, and `classification_conflict`.

## AnalyticsProjection

Computed on demand from Device + latest PollingResult + active DeviceChange:

- total and per-category counts;
- polled/unpolled;
- latest success/error/unknown;
- ping failed;
- devices with changes and change count;
- support states;
- authorization/reboot/GCPlus availability flags.

The projection never invents values for unavailable analytics.

## State Transitions

```text
SRImport: received → processed | partial | failed | duplicate
Device: inCurrentSr true ↔ false (history retained)
PollingRun: planned → blocked_no_adapter
PollingRun: importing → completed | partial | failed
PollingResult: received → matched | unmatched | ambiguous | classification_conflict
DeviceChange: active → superseded when chronology is rebuilt
```

## Migration v1 → v2

- Preserve all v1 arrays and settings.
- Add empty new arrays.
- Add `ignoredPollingPaths: []`.
- Rename the active administrator display name to «Администратор МЦТП» while retaining ID/login.
- Keep legacy AV Engineer user inactive for referential integrity and historical actor references.
- Persist only after complete v2 validation succeeds.
