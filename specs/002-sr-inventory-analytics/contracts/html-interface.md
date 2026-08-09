# Contract: HTML interface for inventory and analytics

## Navigation

- `Дашборд` — default route.
- `Терминалы ВКС` — category `vcs`.
- `Контроллеры` — category `controller`.
- `Панели управления` — category `panel`.
- Existing upload/snapshot/event/matching/storage capabilities remain reachable.
- Legacy project audit remains reachable under an explicit legacy label.

## Dashboard

Shows only computed metrics:

- total and category counts;
- polled/unpolled;
- latest success/error;
- ping failures;
- devices with changes / change count;
- polling support.

Authorization, reboot and GCPlus cards show `Недоступно: требуется правило/пример` when unknown.

Metric/drill-down actions navigate to the relevant category with filters when possible.

## Category table

Rows are Devices, not PollingResults. Required visible/searchable context includes location, address, VIP, equipment type/name, model type, manufacturer, model, IP, MAC, SIP URI, inventory, serial, VIP equipment, optional domain, latest polling status/time, changes, ping and polling support.

Filters use a shared filter model and support reset. Empty values use explicit `—`; unknown analytical values use `Неизвестно`.

## Device detail

Displays:

- SR context and current-SR membership;
- polling capability;
- latest normalized statuses;
- chronological PollingResult history;
- DeviceChanges with old/new/path and source run times;
- issues/conflicts.

## Import area

The existing upload route adds:

- local SR XLSX selector;
- local polling folder selector (`multiple` + directory relative paths when supported);
- optional manual run datetime fallback;
- per-file import outcomes;
- polling plan preview with support state and no credential persistence.

## Security text

UI states that data remains local but browser storage/demo login are not a security boundary. It never displays or requests persistent device credentials in this slice.
