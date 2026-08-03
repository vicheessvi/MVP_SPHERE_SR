# Contract: Legacy Extron Snapshot

## Purpose

Определить детерминированное распознавание и преобразование предоставленного Extron JSON без `schemaVersion` в канонический input profile `extron-legacy-v1`.

## Recognition

Файл распознаётся как `extron-legacy-v1`, если:

- корень является JSON object;
- присутствуют `ip`, `ok`, `webInterface` и `webBlocks`;
- `webBlocks` содержит objects `Firmware`, `Project Info` и `LAN Settings`;
- `Project Info` содержит `Connected Devices` array;
- значение `webInterface.evidence` или markers подтверждает Extron либо структура `TLP Project` соответствует примеру.

Если обязательная комбинация признаков отсутствует, файл получает статус `unsupported`, а не частично распознанный Extron.

## Metadata derivation

| Canonical field | Legacy source | Rule |
|---|---|---|
| `schema_profile` | Detection | Constant `extron-legacy-v1` |
| `schema_version` | Detection | Internal constant `legacy-1` |
| `source_system` | Upload context | Required default configured for collector |
| `external_snapshot_id` | None | `null` |
| `captured_at` | `outputFile` directory | Parse `YYYY-MM-DD_HH-mm-ss`; timezone comes from upload context |
| `captured_at_source` | Detection | `legacy_output_path` |
| `collector_version` | None | `null` + data-quality issue |
| `projectId` / `roomId` | None | Manual project mapping required |

If `outputFile` cannot provide an unambiguous timestamp, upload cannot proceed to comparison until an AV Engineer supplies `capturedAt` and timezone.

Filesystem modification time and `Device Status.Date` MUST NOT silently replace `capturedAt`.

## Canonical mapping

| Canonical data | JSON path |
|---|---|
| Controller IP | `$.webBlocks['LAN Settings']['IP Address']`, fallback `$.ip` with provenance |
| Controller hostname | `$.webBlocks['LAN Settings']['Host Name']` |
| Controller MAC | `$.webBlocks['LAN Settings']['MAC Address']`, fallback `$.webBlocks['Project Info']['TLP Project'].ipdata[*].macaddress` |
| Controller model | `$.webBlocks['Project Info']['TLP Project'].modelname` |
| Controller part number | `$.webBlocks['Project Info']['TLP Project'].partnumber` |
| Firmware version | `$.webBlocks.Firmware.Version` |
| Project filename | `$.webBlocks['Project Info'].Project` |
| Project version | `$.webBlocks['Project Info'].Version` |
| Project revision | `$.webBlocks['Project Info']['Revision Date']` |
| Devices | Merge candidates from `Connected Devices` and `TLP Project.systemdevs` |
| GUI UUID | Extract UUID from each `vtlpweb[*].url` when valid |
| Runtime GUI status | `$.webBlocks.GUI[*]` |
| Diagnostic issues | `$.diagnostics.missingOrErroredFields` |

## Duplicate handling

`Connected Devices` and `TLP Project.systemdevs` are not independent inventories. Records may be merged only when their normalized model, part number, address and GUI UUID agree. Any conflicting duplicate creates a `duplicate_source_conflict` issue.

## Completeness defaults

Legacy format has no authoritative completeness declaration.

| Section | Default | Upgrade/downgrade rule |
|---|---|---|
| project | `partial` | `failed` on unreadable Project Info |
| controller | `partial` | Remains partial without serial number |
| devices | `unknown` | Never inferred complete solely from array presence |
| network | `partial` | Field errors remain quality issues |
| firmware | `partial` | Version may be valid but collector completeness unknown |
| gui | `unknown` | Asset availability and runtime connection are separate |
| runtime | `partial` | `ok=true` does not mean healthy |
| diagnostics | `partial` | Collector version is unknown |

Consequently, absence of a device in a legacy snapshot produces `possible_removal`, never `confirmed_removal`, unless an authorized user explicitly confirms completeness.

## Security handling

- `successfulCredential.username` may be retained as restricted diagnostic metadata; passwords or tokens are secret findings and are not normalized.
- `bodyPreview`, ping raw output and resource URIs are evidence-only and excluded from configuration diff.
- Internal IP, MAC, hostname and project author remain protected infrastructure data.
