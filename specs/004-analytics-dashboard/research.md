# Research: Операционный Dashboard

## Decision 1 — Один pure DashboardSummary selector

**Decision**: Создать один pure selector, который принимает state и фильтры и возвращает готовые секции Dashboard.

**Rationale**: Текущий проект не имеет component framework/backend query layer; pure selector соответствует существующим conventions, тестируется в Node и устраняет независимые полные обходы history в каждой карточке.

**Alternatives considered**: endpoint на каждую KPI отклонён как избыточный; вычисления внутри HTML template отклонены как повторяющиеся и плохо тестируемые.

## Decision 2 — Latest-state map и period activity раздельно

**Decision**: Один map выбирает последний result каждого device по `capturedAt`, затем `id`; period collection фильтрует results/changes/issues отдельно.

**Rationale**: Это предотвращает двойной счёт snapshots и смешение «нет ping сейчас» с «были ping failures за период».

**Alternatives considered**: единая time-window выборка для всех KPI отклонена, потому что при периоде 30 дней устройство без нового опроса исчезло бы из current state.

## Decision 3 — Capability прежде polling outcome

**Decision**: `UNSUPPORTED` определяется отсутствием implemented transport; `NOT_POLLED` применяется только к поддерживаемому устройству без history; unknown metadata выделяется отдельно.

**Rationale**: Неподдерживаемый производитель не является эксплуатационной ошибкой.

**Alternatives considered**: считать все no-history устройства «не опрошено» отклонено требованиями.

## Decision 4 — Drill-down через существующий inventory filter

**Decision**: Расширить текущий filter полями ping/change/support и передавать фильтры при смене route.

**Rationale**: Даёт KPI → table → device без новой страницы и router framework.

**Alternatives considered**: отдельная dashboard results page отклонена как дублирование таблиц.

## Decision 5 — Без chart library

**Decision**: Использовать горизонтальные CSS bars и компактные таблицы для category/manufacturer/model distributions.

**Rationale**: Нет внешней зависимости/CDN, доступна текстовая метка, большие наборы ограничиваются top-N.

## Decision 6 — Blocked analytics остаются unknown

**Decision**: Authorization, reboot, GCPlus и freshness outdated не агрегируются до появления надёжных полей/threshold.

**Rationale**: Constitution запрещает недоказанные выводы; `0` означал бы известное отсутствие событий.

## Decision 7 — Presentation limits

**Decision**: Последние проблемы/изменения и distributions ограничиваются константой 8; все агрегаты считаются по полному scope.

**Rationale**: Dashboard остаётся оперативным при тысячах устройств без потери точности KPI.
