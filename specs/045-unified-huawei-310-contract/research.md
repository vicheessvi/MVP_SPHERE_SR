# Research: объединение Huawei 310

## Decision

Сейчас три model-key уже используют один guarded core, но разные transport и contract ID. Пользователь требует один контракт как у TE30/40/50/60. Исторические JSON несут прежние model-key и contract ID; менять их нельзя. Поэтому новые планы для трёх model-key направляются через `huawei_310_rest_v1`, а новые результаты имеют `huawei-310-rest-v1`. Legacy model-key и нормализаторы остаются; старые contract ID продолжают читаться только как история, без повторной записи.

Dispatcher выбирает один из трёх точных model descriptors по нормализованному planned model до любого сетевого запроса. Core сохраняет pre-auth exact model, post-auth exact model/identity, bounded resources, TLS gate и модельные статусы. Неизвестная/суффиксная модель не попадает в dispatcher. Box settings остаются provisional до отдельных эксплуатационных проверок пользователя.

## Rationale

Это даёт один алгоритм и одну версию контракта без потери точного сопоставления и без фиктивного подтверждения Box.

## Alternatives rejected

Объединить model-key в один — ломает историю и отдельное сопоставление. Оставить разные transport/contract ID — не выполняет требование пользователя. Принять любую модель из строки имени — ослабляет pre-auth gate.
