# Data Model: Management task plan v3

## Polling plan

- `schemaVersion`: integer `3`.
- `managementTasks`: уникальный массив известных task ID; пустой массив сохраняет прежнее read-only поведение.
- `targetSource`: `sr` для обычного опроса либо `port_closure_list` для write-задачи.
- `targetSourceSha256`: SHA-256 отдельного XLSX только для `port_closure_list`.
- `devices`: прежний exact-IP список без credentials.

## Port-closure target list session

- `devices`: нормализованная безопасная проекция строк первого непустого листа структуры SR;
- каждый IP обязателен, должен быть корректным и уникальным;
- raw rows, файл и содержимое ячеек не попадают в inventory/analytics/history;
- сессия заменяется только после атомарно успешной проверки нового файла.

## Task capability

- `id`: `disable_insecure_management_services`.
- `category`: `vcs`.
- `manufacturer`: `huawei`.
- `models`: только `TE40`.
- `transport`: `huawei_te_web_cgi_v1`.

## Result projection

`managementActions[]` содержит:

- `id`;
- `status`: `applied`, `already_compliant`, `skipped_unsupported` или `failed`;
- `transport`: `https/443` для выполненной попытки;
- `writeAttempted`, `changed`;
- `before` / `after`: подтверждённые логические состояния HTTP/Telnet из меню кодека;
- `safeError`: только стабильный безопасный код ошибки.

Credentials, cookie, CSRF, headers и raw response запрещены.
