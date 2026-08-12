# Contract: Equipment and analysis

## Category classification

`classifySrDevice(row) -> categoryId | "other"`

- один взаимоисключающий result;
- normalized exact comparisons;
- утверждённое значение «Тип модели» имеет приоритет над fallback по «Тип оборудования»;
- raw row не изменяется.

## SR import pipeline

`processSrImportRows(state, input) -> Promise<Result>`

Input включает rows, headers, metadata, optional `onProgress` и batch size. Callback получает immutable snapshot не чаще batch boundary. Success возвращает согласованный state и metrics; одна rejected row не отменяет остальные.

Строка без inventory/serial/MAC/IP принимается с `missing_identity` warning и получает deterministic fallback key; одинаковые экземпляры различаются ordinal.

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

При импорте exact `error = No credentials were accepted` сохраняется как `authorization_error` только если IP файла однозначно связан со всем inventory SR и найденное устройство является устройством Extron любой категории.

## Current-IP polling matching

`createPollingImportContext(state)` строит `currentInventoryByIp` только из актуального `ipNormalized`. `ipHistory` хранится в отдельном diagnostic index и не участвует в выборе устройства.

`resolvePollingInventoryMatch(input)` использует нормализованный IP basename JSON, проверяет подтверждённые внутренние paths `$.ip` и `$.webBlocks['LAN Settings']['IP Address']`, блокирует internal-IP mismatch (`ip_conflict`) и надёжный category mismatch (`category_conflict`). `deviceId` возвращается только для единственного current-кандидата после проверок; historical candidates сохраняются только в diagnostic details.

Результат без `deviceId` не добавляется в device history, latest device state или DeviceChange.
