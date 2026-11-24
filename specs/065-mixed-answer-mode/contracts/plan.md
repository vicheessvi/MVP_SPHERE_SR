# Plan v5

schemaVersion=5, managementRouting=per_device_answer. Collect flags explicit bool;
sourceTargetIps/sheets/digest/selection/selectedActions как v4. Root managementTasks
непустые unique IDs только существующих Answer groups, максимум один ID на группу.
Каждое devices[].managementTasks обязательно: [] либо [точный выбранный action
данного каталожного контракта]. Все известные модели проверяются, неизвестные
блокируются. Polycom root options только при соответствующем action, остальные
options запрещены. Root IDs могут остаться без устройств при continuation;
bindings и source freeze остаются авторитетными. Новый UI не создаёт Answer mode
план без хотя бы одного назначенного write (для одних сборов нужно «Не менять»).

Все проверки до сети. NOOP: ok=true, notRequested=true, networkAttempted=false,
managementActions=[]; не успешное изменение. Глобальные JSON/logs переводят строку
в реальное чтение, без write при пустом binding. Никаких скрытых JSON/log/write.
Legacy v3/v4 не получают per-device routing и сохраняют прежние ограничения.
