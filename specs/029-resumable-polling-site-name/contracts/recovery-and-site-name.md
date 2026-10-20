# Contracts

## Runtime status/ACK

`POST /api/polling/jobs/{id}/result/{resultId}/ack` accepts `{saved:boolean}`. `saved:false` records a safe index/code event, increments `saveFailed`, clears the pending result and proceeds. Status adds `saved`, `saveFailed`, `saveFailureEvents`. A missing ACK reaches a bounded timeout and terminates the job; credentials are cleared.

## Selected-folder artifact

`YYYY-MM-DD_HH-mm-ss/polling-recovery.json` follows data-model.md. It is visible and non-secret. Browser recovery verifies each existing device JSON using the exact target IP. Manual import ignores the manifest.

## Huawei result

`siteName: {status, value, source?}`. When status is `read`, `webBlocks["Device Info"]["Site Name"]` carries the same string. No Site Name is derived from SR.
