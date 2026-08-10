# Data Model: Прямой запуск index.html

## LaunchMode

- `kind`: `file` | `secure`
- `persistent`: boolean
- `credentialsAvailable`: boolean
- `storageLabel`: пользовательское описание фактического адаптера

### Validation

- `file` допустим только при `location.protocol === "file:"` и статическом marker.
- `secure` допустим только при server-issued `__MVP_SECURE_RUNTIME__` и CSRF token.
- Неподтверждённый HTTP-контекст не получает адаптер хранения.

## VolatileStorage

Синхронное key/value состояние текущего документа.

- `Map<string,string>` внутри closure
- `getItem(key): string|null`
- `setItem(key,value): void`
- `removeItem(key): void`

### Lifecycle

1. Создаётся при загрузке `app.js` в file mode.
2. Получает demo state через существующий `loadState`.
3. Содержит импортированные данные до reload/close.
4. Уничтожается вместе с документом; миграции из browser storage нет.

## SecureRuntimeStorage

Существующий синхронный API-adapter к encrypted server store.

- Активен только для `secure`.
- CSRF применяется к изменяющим запросам.
- Credential vault остаётся отдельным и write-only.

## UI Capability

- `canPersist`: true только для secure mode.
- `canImportCredentials`: true только для secure mode.
- `canAnalyzeSession`: true для обоих режимов.
- `canPollNetwork`: false в текущей реализации обоих режимов до подтверждённых vendor adapters; file mode всегда false.
