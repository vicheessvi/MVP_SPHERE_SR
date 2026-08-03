# Contract: Change Event

## Purpose

Каждое обнаруженное отличие представляется объяснимым событием с достаточными данными для HTML-интерфейса, фильтрации, review и воспроизведения результата.

## Required fields

| Field | Allowed value / meaning |
|---|---|
| `event_id` | Opaque UUID |
| `change_set_id` | Comparison calculation UUID |
| `project_id` | Logical Project UUID |
| `entity_type` | `project`, `controller`, `device`, `gui`, `snapshot` |
| `entity_id` | Canonical Asset/Project ID; nullable for unresolved match |
| `event_type` | Stable rule-defined event type |
| `category` | `configuration`, `runtime`, `data_quality`, `security` |
| `severity` | `critical`, `high`, `medium`, `informational` |
| `from_snapshot_id` | Source state |
| `to_snapshot_id` | Target state |
| `field` | Canonical field or `null` for entity-level event |
| `old_value` | Typed value or `null` |
| `new_value` | Typed value or `null` |
| `match_confidence` | `exact`, `high`, `probable`, `ambiguous`, `unmatched` |
| `rule_id` | Stable rule identifier |
| `ruleset_version` | Version used for calculation |
| `evidence` | One or more source references |
| `review_status` | `unreviewed`, `expected`, `needs_attention`, `false_match` |
| `created_at` | UTC timestamp |

## Evidence item

Each evidence item contains:

- Snapshot ID;
- JSON source path;
- safe raw value or redaction marker;
- normalized value;
- quality status.

## Event types required for MVP

### Entity lifecycle

- `device_added`
- `confirmed_removal`
- `possible_removal`
- `probable_replacement`
- `match_review_required`

### Field changes

- `project_name_changed`
- `project_version_changed`
- `firmware_changed`
- `name_changed`
- `ip_changed`
- `mac_changed`
- `hostname_changed`
- `network_setting_changed`
- `model_or_part_changed`
- `gui_identity_changed`

### Runtime

- `device_unreachable`
- `device_recovered`
- `panel_disconnected`
- `panel_reconnected`
- `authentication_failed`
- `web_interface_unavailable`

### Data quality and security

- `field_missing`
- `field_read_error`
- `source_conflict`
- `unsupported_schema`
- `secret_detected`
- `timestamp_ambiguous`

## Invariants

- `confirmed_removal` requires `devices=complete` or explicit authorized confirmation.
- `possible_removal` does not retire Asset automatically.
- An ambiguous match cannot produce a definitive field-change event.
- Formatting-only differences do not create events.
- Runtime events cannot be shown as configuration drift.
- Superseded ChangeSets remain auditable but are excluded from current views by default.
- Retention expiration does not create a ChangeEvent.

## Example

```json
{
  "event_id": "b204d4a4-f6dc-4555-b95b-7eb2af7782c2",
  "change_set_id": "62b6e026-55ec-42da-8888-a7e3d7f465e0",
  "project_id": "b254fd79-60a6-4099-a4e9-ab5b369b1df2",
  "entity_type": "device",
  "entity_id": "47699131-53cb-4755-a560-2e9667d25417",
  "event_type": "ip_changed",
  "category": "configuration",
  "severity": "medium",
  "from_snapshot_id": "a2813fb5-4bce-418b-8bfc-c8e9e161ac6c",
  "to_snapshot_id": "ae23a7e8-285a-4684-9158-a63552219222",
  "field": "ip_address",
  "old_value": "10.22.187.5",
  "new_value": "10.22.187.8",
  "match_confidence": "exact",
  "rule_id": "device.network.ip.changed",
  "ruleset_version": "1.0.0",
  "evidence": [
    {
      "snapshot_id": "ae23a7e8-285a-4684-9158-a63552219222",
      "source_path": "$.webBlocks['Project Info']['Connected Devices'][0].addr",
      "raw_value": "10.22.187.8",
      "normalized_value": "10.22.187.8",
      "quality": "valid"
    }
  ],
  "review_status": "unreviewed",
  "created_at": "2026-08-03T12:00:00Z"
}
```
