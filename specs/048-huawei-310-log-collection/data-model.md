# Модель данных

`LogCollectionResult` — безопасный объект `{status, validationStatus?, safeError?}`. `status`: `saved`, `failed`, `protocol_required`. Сырого содержимого и заголовков авторизации нет.

`LogArtifact` — оригинальные XML-байты, сохранённые браузером в выбранной timestamp-папке как `<IP>.xml`; промежуточного файла runtime нет. Метаданные импорта обрабатываются существующим механизмом.

`collectJson` и `collectLogs` — независимые булевы значения плана; оба `false` недопустимы.
