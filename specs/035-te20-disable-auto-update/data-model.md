# Data model

## Выбор в плане

`te20AutoUpdateMode` ∈ `"" | "disable"`. Пустое значение означает «Не менять» и установлено по умолчанию; в пользовательском state не сохраняются credentials или сырые ответы устройства.

## Plan schema v3

При `disable` в `managementTasks` входит ровно `disable_te20_auto_update`; при пустом значении задачи нет. Для записи требуется `targetSource=sr`, digest актуального источника, `selection.mode=single_ip`, ровно один exact TE20. Сочетание с любыми другими write-задачами запрещено.

## Результат действия

`id`, `status`, `changed`, `writeAttempted`, опционально `before`, `after`, `safeError`; состояния только `enabled`/`disabled`, без raw данных и секретов.
