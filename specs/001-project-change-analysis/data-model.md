# Data Model: Browser-only анализ изменений

## Общие правила

- Все записи находятся в одном versioned JavaScript state и сериализуются в JSON.
- ID — opaque strings, создаваемые локально.
- `capturedAt` определяет timeline; `uploadedAt` хранится отдельно.
- Raw snapshot text и hash не меняются через UI после создания Snapshot.
- Отсутствующее/errored значение отличается от `null` и confirmed removal.
- Versioned rules обеспечивают повторяемость normalization/matching/diff.
- State не является tamper-resistant: пользователь browser profile может изменить `localStorage` через DevTools.

## State Container

Storage key: `mvpSphereSrState.v1`.

```json
{
  "version": 1,
  "users": [],
  "projects": [],
  "snapshots": [],
  "assets": [],
  "matchDecisions": [],
  "changeSets": [],
  "baselineAssignments": [],
  "reviewDecisions": [],
  "retentionAudits": [],
  "history": [],
  "settings": {},
  "currentUserId": null
}
```

State заменяется только целиком после успешной validation/migration/quota preflight.

## Settings

| Field | Type | Rules |
|---|---|---|
| `retentionDays` | number | Default 1095, positive |
| `sourceSystem` | string | Local collector label |
| `legacyTimezone` | string | Required for legacy timestamp derivation when used |
| `normalizerVersion` | string | Current ruleset |
| `severityPolicyVersion` | string | Current severity defaults |
| `demoWarningAcceptedAt` | ISO datetime/null | Acknowledgement only, not security consent |

## User

Локальная demo-учётная запись.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique |
| `name` | string | Required |
| `login` | string | Unique locally |
| `password` | string | Demo-only clear text, never real credential |
| `role` | enum | `administrator`, `av_engineer` |
| `active` | boolean | Controls ordinary UI login |

Роль фильтрует UI, но не является границей информационной безопасности.

## Project

| Field | Type | Rules |
|---|---|---|
| `id` | string | Stable local identity |
| `displayName` | string | Required, mutable |
| `status` | enum | `active`, `archived` |
| `references` | ProjectReference[] | Stable/manual external links |
| `createdAt` | ISO datetime | Immutable in UI |

### ProjectReference

- `sourceSystem`;
- `kind`: `project_id`, `room_id`, `source_path`, `manual`;
- `valueNormalized`;
- `verified`;
- `createdById`, `createdAt`.

Одна active reference не может указывать на разные Projects.

## Snapshot

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique |
| `projectId` | string/null | Null до manual mapping |
| `filename` | string | Safe display name |
| `rawText` | string | Original text; no edit action |
| `rawSha256` | string | Duplicate key |
| `rawSizeBytes` | number | Quota/preflight input |
| `schemaProfile` | enum | `extron-v1`, `extron-legacy-v1`, `unsupported` |
| `schemaVersion` | string/null | Input/internal version |
| `collectorVersion` | string/null | Legacy may be null |
| `sourceSystem` | string | Required |
| `capturedAt` | ISO datetime/null | Required before comparison |
| `capturedAtSource` | enum | `payload`, `legacy_output_path`, `manual` |
| `uploadedAt` | ISO datetime | Local intake time |
| `uploadedById` | string | Demo user |
| `status` | enum | Processing lifecycle |
| `completeness` | object | Section statuses |
| `projectObservation` | object/null | Normalized project state |
| `assetObservations` | array | Normalized source records |
| `qualityIssues` | array | Validation/data/security findings |
| `normalizerVersion` | string/null | Rules used |
| `expiredAt` | ISO datetime/null | Local retention result |

### Snapshot states

```text
received → validated → needs_project_mapping | unsupported | failed
needs_project_mapping → ready | failed
ready → processed | partial | failed
processed | partial | unsupported → expired
```

Duplicate bytes return an outcome referencing the existing Snapshot and do not add a new object.

## SectionCompleteness

Keys: `project`, `controller`, `devices`, `network`, `firmware`, `gui`, `runtime`, `diagnostics`.

Each value contains:

- `status`: `complete`, `partial`, `failed`, `unknown`;
- `source`: `collector`, `legacy_inference`, `system`, `manual`;
- `details` safe string/null.

Только `complete` или explicit authorized local decision допускает `confirmed_removal`.

## ProjectObservation

Snapshot-specific canonical object:

- project filename/version/revision/author;
- controller model/type/firmware;
- controller network values;
- `fields`, где каждое значение имеет `normalizedValue`, `rawValue`, `sourcePath`, `quality`.

## Asset

| Field | Type | Rules |
|---|---|---|
| `id` | string | Stable local identity |
| `projectId` | string | Required |
| `kind` | enum | `controller`, `touch_panel`, `mobile_gui`, `other` |
| `displayName` | string | Mutable derived/local value |
| `status` | enum | `active`, `retired`, `replaced` |
| `identifiers` | array | Stable/strong/weak identifier history |
| `createdAt` | ISO datetime | First match |
| `retiredAt` | ISO datetime/null | Confirmed only |
| `replacementAssetId` | string/null | Same project |

IP/name не являются stable identifiers; MAC является strong but mutable.

## AssetObservation

- `id`, `snapshotId`, `assetId` nullable until match;
- `sourceLocalKey`, `kind`;
- model, part number, name, IP, MAC, hostname, subnet, gateway, DNS, DHCP;
- firmware and GUI fields;
- runtime status;
- `quality`: `valid`, `partial`, `conflicting`, `errored`;
- `fieldEvidence`: canonical field → raw/normalized/path/quality.

## DataQualityIssue

- `id`, `snapshotId`, optional observation/asset IDs;
- `code`, `category`, `severity`;
- source paths and safe details;
- `status`: `open`, `acknowledged`, `resolved`;
- timestamps.

Secret values never appear in `safeDetails` or rendered evidence.

## MatchCandidate

Хранится внутри соответствующего AssetObservation до решения:

- `candidateAssetId`;
- `confidence`: `exact`, `high`, `probable`, `ambiguous`;
- bounded score;
- matched/conflicting signals;
- ruleset version;
- `status`: `proposed`, `selected`, `rejected`.

## MatchDecision

Append-only state record:

- observation ID;
- selected Asset или action `create_new`, `replace`, `unmatched`;
- confidence, actor ID, reason/evidence;
- `createdAt`, `supersedesId`.

## ChangeSet

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique |
| `projectId` | string | Same project for both states |
| `fromSnapshotId` | string | Earlier/baseline |
| `toSnapshotId` | string | Target |
| `mode` | enum | `previous`, `selected`, `baseline` |
| `rulesetVersion` | string | Required |
| `status` | enum | `active`, `superseded`, `failed` |
| `events` | ChangeEvent[] | Contract-compliant |
| `computedAt` | ISO datetime | Required |
| `supersedesId` | string/null | Audit link |

Late snapshot creates new adjacent ChangeSets; previous result is retained as superseded.

## ChangeEvent

Shape and enums follow `contracts/change-event.md`. Evidence values are safe/redacted for display. Formatting-only differences do not create events; ambiguous match does not create definitive field events.

## BaselineAssignment

- `id`, `projectId`, `snapshotId`;
- `assignedById`, `assignedAt`;
- `status`: `active`, `replaced`, `expiration_pending`, `ended`;
- `endedAt`, `reason`, `supersedesId`.

Один active baseline на Project.

## ReviewDecision

Append-only decision for ChangeEvent:

- `id`, `changeEventId`;
- `decision`: `expected`, `needs_attention`, `false_match`;
- comment, user ID, createdAt, supersedesId.

## RetentionAudit

Minimal non-sensitive record:

- former Snapshot ID and SHA-256;
- uploaded/captured/expired timestamps;
- policy days, reason and actor ID;
- counts of removed derived records.

Retention never creates ChangeEvent.

## HistoryEntry

Human-readable local audit for ordinary UI actions:

- `id`, `timestamp`, `actorId`, `actorName`;
- `action`, `entityType`, `entityId`, `projectId`;
- safe `details`.

History is useful for demonstration but can be changed together with `localStorage` and is not a production audit log.

## Backup envelope

```json
{
  "schema": "mvp-sphere-sr-backup",
  "version": 1,
  "exportedAt": "2026-08-03T00:00:00Z",
  "state": {}
}
```

Import validates envelope, all top-level arrays, referential integrity, enums, raw hashes when possible and quota before replacing current state.
