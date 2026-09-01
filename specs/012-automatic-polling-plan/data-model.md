# Data Model: Загрузка и план автоматического опроса

## PollingFilterSelection

- `categories: string[]` — `[]`, `['*']` или канонические category IDs.
- `manufacturers: string[]` — `[]`, `['*']` или нормализованные производители.
- `models: string[]` — `[]`, `['*']` или нормализованные модели.
- Инвариант: `*` не сосуществует с частным значением.

## PollingPlanProjection

- `availableCategories`, `availableManufacturers`, `availableModels`.
- `selection` после очистки устаревших значений.
- `selectedDevices`, `supportedDevices`, `unsupportedDevices`.
- Все массивы имеют детерминированный порядок.

## CredentialPoolSummary

- `acceptedCount`, `rejectedCount`, `duplicateCount`, `emptyRowCount`.
- `credentials` существует только в памяти вызывающего кода и никогда не сериализуется вместе со summary.

## AutomaticPollingPlan

- `schemaVersion: 2`.
- `scheduledAt`, `intervalSeconds`.
- `authenticationInputSha256` — только отпечаток XLSX для сверки CLI, без содержимого файла.
- `selection` и `selectionSummary`.
- `devices[]`: `ip`, `category`, `manufacturer`, `model`, `pollingSupported`, `adapterKey`.
- Запрещены поля login/password/token/cookie/authorization/secret.

## PollingRunProgress

- `total`, `processed`, `successful`, `failed`, `unsupported`.
- `current`: безопасные IP/category/manufacturer/model.
- `stage`: waiting/start/polling/saving/completed/cancelled.
- `waitRemainingSeconds` без credential values.

## State transitions

`prepared → waiting_for_start → running → saving → waiting_between_devices → running → completed`

Из любого выполняемого состояния возможен `cancelled`; ошибка записи переводит запуск в `failed_save` и блокирует следующий device poll.
