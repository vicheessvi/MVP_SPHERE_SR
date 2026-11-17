# Data Model: Answer mode Polycom Group

## Plan option

`polycomAnswerChanges`: объект с ровно двумя ключами `pointToPoint` и `multipoint`, каждый `null | "automatic" | "manual"`. При обоих `null` action не создаётся и объект в экспорт не включается. При одном или двух заданных значениях план содержит один `set_polycom_group_auto_answer` и `targetSource=sr`; другие write-задачи не допускаются. Оба значения обязаны быть явно валидными до сети.

## Device action result

`managementActions[]`: `id`, `status`, `changed`, `before` (оба поля), `target` (заданное поле/поля), `after` (оба поля), `validationStatus`, `safeError` при отказе. Секреты, raw HTTP, cookie и неизвестные поля не включаются. Возможные статусы соответствуют существующему формату действий: `applied`, `already_compliant`, `failed`; отсутствие подтверждённого контракта задаёт безопасный `safeError` без записи.

## State transitions

`validated_plan → exact_device_and_bundle → pre_read_pair → (already_compliant | one_POST) → bounded_post_read → verified_success | uncertain_failure`.

Только `Yes` и `No` допустимы как исходные значения для записи. `Do_Not_Disturb`, неизвестный код, нестабильная идентичность/модель, изменённая SR или двойной IP блокируют запись. Для каждого поля `automatic → Yes`, `manual → No`; незаданное поле обязано остаться равным pre-read. Два последовательных совпадающих post-read необходимы для успеха.
