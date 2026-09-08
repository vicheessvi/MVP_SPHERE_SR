# Research: актуальная схема выгрузки SR

## Decision: canonical-first alias registry

Каждое смысловое поле получает упорядоченный набор заголовков: первым идёт новое каноническое имя, затем прежнее имя, если оно существовало. Один resolver используется импортом, классификацией, фильтрами и отдельным списком целей.

## Rationale

Немедленное удаление старых заголовков сломало бы сохранённые выгрузки и regression fixtures. Параллельные независимые обработчики дали бы разные результаты. Канонический приоритет обеспечивает предсказуемый переход, а централизованный registry не смешивает location `Описание локации` с equipment `Описание`.

## Decision: SmartRoom IDs precede mutable attributes

`SmartRoom ID локации` и `SmartRoom ID оборудования` считаются устойчивыми идентификаторами соответствующих сущностей. `ID устройства` также сильнее IP/MAC и других изменяемых реквизитов.

## Alternatives considered

- Hard cutover only: rejected because legacy exports would fail without operational benefit.
- Continue identifying only by names, inventory and network fields: rejected because renamed locations and changed addresses would create duplicates.
- Store a transformed replacement of the SR row: rejected; raw evidence must remain unchanged.

## Security and privacy

Изменение касается только локального XLSX parsing и volatile state. Новых dependencies, network calls, persistent storage или credential paths нет.
