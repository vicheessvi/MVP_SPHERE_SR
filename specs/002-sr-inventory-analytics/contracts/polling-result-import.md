# Contract: polling run folder import

## Folder timestamp

The top-level folder name MUST match `YYYY-MM-DD_HH-MM-SS` and represent local calendar time. `2026-06-01_09-41-28` means 1 June 2026 09:41:28. Invalid dates return an explicit issue; no special month interpretation exists.

The UI may accept an explicit manual run datetime when the selected files do not expose a valid folder name.

## Filename IP

The basename without `.json` is trimmed and parsed as IPv4. Invalid or missing IP creates a file-scoped issue; raw JSON is retained when parseable.

## JSON processing

For each file independently:

1. read text;
2. reject empty/malformed JSON for that file only;
3. hash raw bytes/text;
4. detect existing Extron v1/legacy profile or unknown structure;
5. read `webBlocks['Project Info']['Controller Type']` when available;
6. normalize `Primary Controller` → controller and `TLP` → panel;
7. match filename IP to inventory;
8. preserve classification conflict/unmatched state;
9. derive poll/ping status;
10. persist result and reconcile device changes.

## Ping failure

`pingStatus = failed` only when:

- normalized `failedStage == ping`; and
- a case-insensitive top-level `ping` block exists with `ok === false`.

Any missing or conflicting condition produces `unknown`, not failure.

## Idempotency

Duplicate key is `rawSha256 + capturedAt + filenameIp`. A duplicate returns the existing result ID and does not create a second PollingResult or DeviceChange.

## Batch result

```text
{
  runId,
  status,
  totalCount,
  successCount,
  errorCount,
  unmatchedCount,
  fileResults[]
}
```

One file failure never rolls back already successful files in the same user-selected batch.
