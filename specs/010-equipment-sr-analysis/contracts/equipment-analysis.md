# Contract: Equipment and analysis

## Category classification

`classifySrDevice(row) -> categoryId | "other"`

- один взаимоисключающий result;
- normalized exact comparisons;
- raw row не изменяется.

## SR import pipeline

`processSrImportRows(state, input) -> Promise<Result>`

Input включает rows, headers, metadata, optional `onProgress` и batch size. Callback получает immutable snapshot не чаще batch boundary. Success возвращает согласованный state и metrics; одна rejected row не отменяет остальные.

## Result timestamp

`resolvePollingResultTimestamp(fileDescriptor) -> { capturedAt, source, sourceLastModified }`

- finite positive `lastModified` → ISO + `file_last_modified`;
- иначе `null + unavailable`;
- folder timestamp не используется.

## Selective diff

`getAnalyzedParameterRules(device) -> rule[]`

`diffAnalyzedParameters(device, before, after) -> change[]`

- только configured paths;
- каждое изменение содержит Russian label/rationale;
- no rules → empty array;
- raw payload не модифицируется.

## Status evidence

`derivePollingStatus(payload)` не возвращает `authorization_error` без explicit confirmed authorization stage/failure. Ping failure возвращает `network_unreachable`; прочий explicit failure — `processing_error`; отсутствие evidence — `unknown`.
