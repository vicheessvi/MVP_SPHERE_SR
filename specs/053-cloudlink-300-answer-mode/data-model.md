# Data model: Answer mode CloudLink 300

## AnswerModeSelection

- `mode`: пусто (не менять), `automatic` либо `manual`.
- Пустое значение не создаёт action ID. Для выбранного режима один план содержит ровно один action ID и только совместимые exact Bar 300/Box 300/Box 600 из актуальной SR.
- Подтверждение UI показывает число целей и целевой режим; digest SR, уникальность IP и модель проверяются повторно runtime.

## DeviceActionResult

- `id`: модельная задача направления.
- `status`: `applied`, `already_compliant` либо `failed`.
- `before` и `after`: `automatic`/`manual` только при точном чтении.
- `changed`, `writeAttempted`: boolean; `writeAttempted` становится true до единственной сетевой записи и остаётся true при неясном ответе.
- `safeError`: только безопасный код ошибки, без ответа, cookie, CSRF или учётных данных.
- `validationStatus`: `confirmed_user_validation` для новых write-результатов Bar 300/Box 300/Box 600 после отдельного подтверждения администратором 2026-11-24 обоих направлений, по IP и массово. Исторические JSON сохраняют прежний статус.

## State transitions

`planned → model_verified → identity_verified → pre_read → already_compliant | one_write → post_read → applied | failed`. При ошибке до `one_write` запись не отправляется; после неясного `one_write` автоматического повтора нет. Неизвестное не становится успехом.
