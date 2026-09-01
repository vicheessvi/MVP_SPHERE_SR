# Contract: loopback polling API

Все маршруты доступны только с валидной HttpOnly session cookie. Все POST требуют точный loopback Host, same-origin `Origin` и `X-MVP-CSRF`.

## `POST /api/polling/credentials`

- Body: binary `.xlsx`, max 10 MiB.
- Request header: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.
- Response 200: `{ ok, summary: { acceptedCount, rejectedCount, duplicateCount, emptyRowCount }, sourceSha256 }`.
- Секретные значения никогда не возвращаются.

## `DELETE /api/polling/credentials`

- Идемпотентно очищает ещё не используемый credential pool после ошибки подготовки job.
- Отклоняется, если job уже активен; active job очищает pool своим terminal path.

## `POST /api/polling/jobs`

- Body: `{ plan, allowInsecureTls }`.
- Проверяет отсутствие secret fields, schema plan, SHA-256 XLSX, отсутствие active job.
- Response 202: `{ ok, jobId, status }`.

## `GET /api/polling/jobs/:jobId`

- Response: безопасные поля `status`, timestamps, counters, currentDevice, `pendingResult` boolean, `safeError`.
- Payload результата и secrets отсутствуют.

## `GET /api/polling/jobs/:jobId/result`

- Response 200 при pending result: `{ resultId, filename, payload, index, total }`.
- Response 204 если результата ещё нет.

## `POST /api/polling/jobs/:jobId/result/:resultId/ack`

- Body: `{ saved: true }` либо `{ saved: false }`.
- `saved: true` разрешает переход к интервалу; `false` завершает job с `result_save_failed`.

## `POST /api/polling/jobs/:jobId/cancel`

- Идемпотентно прерывает schedule/interval/future devices.
- Response: `{ ok, status }`.

## Safe errors

`runtime_required`, `credentials_required`, `credential_file_invalid`, `credential_sha_mismatch`, `plan_invalid`, `job_already_active`, `result_save_failed`, `polling_cancelled`, `local_runtime_error`.
