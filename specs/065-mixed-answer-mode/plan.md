# Plan

## Design и constitution check

Новая форма добавляет answerModeRouting=per_device в operational selection.
При выбранном Answer mode создаётся plan v5, managementRouting=per_device_answer.
Root managementTasks — явный выбор до одного направления в каждой из пяти групп.
devices[].managementTasks — frozen binding [] либо [один точный action ID].
Polycom nullable цели остаются в root, передаются только Polycom устройствам.
Схемы 3/4 сохраняют прежний одноконтрактный guard, прочие writes остаются v4.

Python проверяет root/selectedActions/source membership и каталог каждого binding
до credential handoff/ping. Допустимый binding обязан точно совпадать с выбранной
задачей его exact группы, а не просто быть одним из root IDs. Противоположные
направления одной группы/смешивание NTP/HTTP/etc запрещены. Read-only NOOP результат
не вызывает probe; job считает notRequested отдельно, не successful/failed.
Интервальный счётчик исключает NOOP. Root выбор сохраняется при resume даже если
часть контрактных групп уже выполнена; это не разрешает добавить новые bindings.

Frontend использует тот же каталог action support, показывает per-device задачи
и семейства/числа в общем подтверждении. «Не менять» и сборы независимы. Recovery
понимает v5 и проверяет outcome action по binding устройства, не по всему root;
неясные writes пропускает для проверки только там, где write реально был выбран.

PASS до/после design: пользователь явно разрешил mixed routing. Нет расширения
vendor API/прав на реальные записи во время разработки. Source/model/identity,
TLS/admin/Origin/CSRF, только память credentials, минимальные запросы и максимум
одна запись на устройство сохраняются. БД/аналитическая история не меняются.

## Порядок

Негативные/позитивные tests → Python validator/dispatch/noop → UI v5 snapshot
и preview → recovery → реальный job/browser с fake adapters → полная регрессия,
ADR/справочник/документы. Production Python stdlib, JS Vanilla, vendored XLSX.
