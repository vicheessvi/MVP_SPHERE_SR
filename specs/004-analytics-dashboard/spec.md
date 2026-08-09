# Feature Specification: Операционный Dashboard

**Feature Branch**: `codex/secure-local-runtime`
**Created**: 2026-08-10
**Status**: Ready for planning
**Input**: Главный экран как основная точка входа Администратора МЦТП с агрегатами по фактическим данным SR и polling history.

## User Scenarios & Testing

### User Story 1 — Оценить текущее состояние инфраструктуры (Priority: P1)

Администратор МЦТП открывает Главный экран и за несколько секунд видит актуальный inventory, покрытие опросом, текущие ошибки, отсутствие ping, изменения, последний запуск и неподдерживаемые устройства.

**Why this priority**: Это основной оперативный сценарий и обязательный P0-состав первого Dashboard.

**Independent Test**: На наборе SR с тремя категориями и несколькими результатами последнего опроса Dashboard однозначно показывает inventory, latest-state coverage, проблемы и последний run без двойного счёта устройств.

**Acceptance Scenarios**:

1. **Given** актуальная SR без polling history, **When** открыт Dashboard, **Then** inventory показан, устройства не считаются ошибочными и отображается состояние «Данные опросов пока отсутствуют».
2. **Given** несколько результатов одного устройства, **When** вычисляются текущие KPI, **Then** используется только последний результат устройства.
3. **Given** устройство с неподдерживаемым adapter, **When** нет результата опроса, **Then** оно учитывается в `UNSUPPORTED`, а не в `FAILED` или `NOT_POLLED`.
4. **Given** последний результат содержит `failedStage=ping` и `ping.ok=false`, **When** вычисляется «Нет ping сейчас», **Then** устройство учитывается один раз.
5. **Given** отсутствует SR, **When** открыт Dashboard, **Then** показан понятный empty state и действие загрузки SR.

---

### User Story 2 — Отфильтровать данные и перейти к первопричине (Priority: P1)

Администратор применяет глобальные фильтры, видит пересчитанные показатели и открывает специализированный модуль с сохранённым фильтром по выбранной KPI.

**Why this priority**: Dashboard должен вести от агрегата к конкретному устройству, а не быть статическим отчётом.

**Independent Test**: Фильтры категории, производителя, модели, локации, VIP, polling status и периода сужают summary; переход из KPI открывает правильный модуль и применяет поддерживаемый фильтр таблицы.

**Acceptance Scenarios**:

1. **Given** inventory разных категорий и производителей, **When** выбран manufacturer/model/location/VIP, **Then** все snapshot KPI считаются только по соответствующим текущим устройствам.
2. **Given** период 7 дней, **When** показаны period metrics, **Then** они используют результаты/изменения периода и визуально отделены от latest-state metrics.
3. **Given** KPI «Нет ping», **When** пользователь нажимает карточку, **Then** открывается соответствующий модуль с фильтром последнего ping failure.
4. **Given** KPI охватывает несколько категорий, **When** drill-down не может открыть одну таблицу, **Then** Dashboard предлагает переходы по категориям без новой дублирующей страницы.

---

### User Story 3 — Найти приоритетные локации и события (Priority: P2)

Администратор видит компактные списки последних проблем, последних изменений, VIP-состояние, проблемные локации и распределение оборудования.

**Why this priority**: Эти блоки ускоряют приоритизацию после оценки основных KPI, используя уже доступные факты.

**Independent Test**: На данных с VIP, unmatched/malformed результатами и изменениями Dashboard корректно разделяет эксплуатационные проблемы и ошибки данных, сортирует локации и ограничивает списки.

**Acceptance Scenarios**:

1. **Given** VIP-устройство с текущей ошибкой, **When** открыт Dashboard, **Then** оно входит в VIP problems и проблемную локацию.
2. **Given** malformed и unmatched результаты, **When** строятся проблемы, **Then** они показаны как ошибки данных и не смешаны с equipment failures.
3. **Given** изменения нескольких snapshots, **When** строится список изменений, **Then** выводится ограниченный набор последних записей со старым/новым значением и переходом к устройству.
4. **Given** отсутствуют надёжные authorization/reboot/GCPlus признаки, **When** открыт Dashboard, **Then** соответствующие KPI не показывают фиктивный ноль и явно обозначены как недоступные.

### Edge Cases

- Polling results загружены не по порядку; latest state определяется по `capturedAt` и стабильному tie-breaker.
- Результат не сопоставлен с device или device больше не входит в актуальную SR.
- Несколько open issues ссылаются на один result/device.
- Устройство является VIP одновременно по оборудованию и локации; оно считается один раз.
- Фильтр не возвращает устройств; Dashboard показывает нулевой scoped result, не общий empty state «Нет SR».
- Произвольный период имеет только одну границу или `from > to`; фильтр отклоняется понятным сообщением.
- Метрика известна и равна нулю — показывается `0`; метрика не поддерживается — показывается «Недостаточно данных».
- Длинные имена локаций/устройств и тысячи devices не приводят к выводу тысяч строк на Dashboard.

## Requirements

### Functional Requirements

- **FR-001**: Dashboard MUST использовать только актуальные устройства контролируемых категорий из последней SR для inventory/latest-state scope.
- **FR-002**: Dashboard MUST предоставлять единый агрегированный summary с разделами inventory, polling coverage, current health, problems, changes, VIP, locations, latest run, freshness metadata и distributions.
- **FR-003**: Current-state KPI MUST использовать не более одного последнего релевантного polling result на устройство.
- **FR-004**: Состояния MUST различать `SUCCESS`, `FAILED`, `NOT_POLLED`, `UNSUPPORTED` и при необходимости `UNKNOWN` без отнесения unsupported устройств к ошибкам.
- **FR-005**: Dashboard MUST показывать inventory total и отдельные количества ВКС, контроллеров и панелей.
- **FR-006**: Dashboard MUST показывать когда-либо опрошенные, никогда не опрошенные поддерживаемые, successful, failed, unsupported и unknown устройства.
- **FR-007**: «Нет ping сейчас» MUST основываться только на последнем результате устройства с доказанным ping failure.
- **FR-008**: Dashboard MUST показывать контекст последней SR и последнего polling run из фактических метаданных.
- **FR-009**: Dashboard MUST разделять equipment failures, unmatched/malformed/classification data issues и неподдерживаемый polling.
- **FR-010**: Dashboard MUST показывать уникальные устройства с изменениями и количество change records как разные показатели.
- **FR-011**: Dashboard MUST предоставлять ограниченные списки последних проблем и изменений без raw JSON и секретов.
- **FR-012**: Dashboard MUST предоставлять фильтры period, category, manufacturer, model, location, VIP и polling status.
- **FR-013**: Period metrics MUST быть визуально и семантически отделены от latest-state metrics.
- **FR-014**: Периоды MUST включать последний запуск, сегодня, 7 дней, 30 дней и корректный произвольный диапазон.
- **FR-015**: Dashboard MUST предоставлять drill-down в существующие inventory modules с поддерживаемыми фильтрами category/status/ping/VIP/change.
- **FR-016**: Dashboard MUST показывать VIP locations, VIP devices, VIP problems и VIP no-data/unsupported отдельно.
- **FR-017**: Dashboard MUST агрегировать проблемные локации и сортировать их по числу текущих проблем, не удваивая устройства.
- **FR-018**: Dashboard MUST показывать распределение по категориям, производителям и наиболее распространённым моделям без подключения новой chart library.
- **FR-019**: Freshness MUST показывать timestamp/возраст последнего результата; outdated count MUST оставаться неопределённым до настройки threshold.
- **FR-020**: Authorization, reboot и GCPlus MUST отображаться только при надёжном источнике данных; иначе статус MUST быть «Недостаточно данных», а не `0`.
- **FR-021**: Dashboard MUST иметь empty states «Нет SR» и «SR есть, polling отсутствует», а ошибка одного блока MUST NOT раскрывать stack trace.
- **FR-022**: Основные действия MUST переиспользовать существующие flows загрузки и планирования polling, не дублируя их реализацию.
- **FR-023**: Dashboard MUST пересчитываться после успешного локального импорта без ручной перезагрузки страницы.
- **FR-024**: Summary MUST вычисляться детерминированным selector/service вызовом один раз на render, а не отдельными полными обходами history для каждой карточки.
- **FR-025**: Dashboard MUST ограничивать UI-списки настраиваемым presentation limit и оставаться пригодным для тысяч устройств.
- **FR-026**: Dashboard и его тесты MUST использовать только synthetic данные без credentials и внешней передачи.

### Key Entities

- **DashboardFilter**: период и inventory-фильтры, определяющие current и period scope.
- **DashboardSummary**: единый неизменяемый результат агрегации для одного filter scope.
- **CurrentDeviceState**: актуальное SR-устройство, capability и последний polling result.
- **PeriodActivity**: polling results, changes и issues внутри выбранного временного интервала.
- **AttentionLocation**: location и агрегаты проблем связанных текущих устройств.
- **DashboardEvent**: безопасное краткое представление equipment/data/change события.

## Assumptions

- Freshness threshold пока не задан; показываются timestamp и age/no-data, но не произвольный `outdated` статус.
- Authorization, reboot и GCPlus остаются blocked analytics до появления документированных полей.
- «Последний запуск» определяется по `capturedAt`, затем по стабильному идентификатору.
- Native date inputs достаточно для произвольного диапазона.
- Drill-down использует текущие маршруты и расширяет существующий inventory filter, без нового router.
- Презентационный limit списков по умолчанию равен 8 и может быть изменён одной константой.
- P2 из исходного требования (виджеты, BI/trends, GCPlus) не реализуется.

## Success Criteria

- **SC-001**: На synthetic наборе из трёх категорий все 13 обязательных dashboard-сценариев проходят автоматически.
- **SC-002**: Одно устройство с несколькими snapshots учитывается ровно один раз в каждой latest-state KPI.
- **SC-003**: Unsupported устройство никогда не увеличивает failed или supported-not-polled.
- **SC-004**: Администратор может перейти от KPI ping/failed/not-polled/unsupported/VIP/change к отфильтрованному inventory максимум за один клик после выбора категории.
- **SC-005**: Dashboard показывает результат для 5 000 устройств и 25 000 polling results менее чем за 2 секунды в автоматической performance-проверке.
- **SC-006**: Empty-state пользователь может начать импорт SR одним действием.
- **SC-007**: Ни один неподдерживаемый показатель не представлен как известное нулевое значение.
- **SC-008**: Dashboard не выводит raw polling JSON, credentials или stack trace.
