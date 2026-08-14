# ADR-0010: Каталог оборудования, доказуемое время и выборочные изменения

**Статус**: принято 2026-08-12

## Контекст

Три плоских inventory-модуля не покрывали новые SR-категории. Время результата наследовалось от папки запуска, а полный diff `webBlocks` создавал шум. Импорт SR выполнял линейный поиск по растущим массивам на каждой строке и блокировал 25k synthetic rows почти 129 секунд.

## Решение

1. Семь категорий описываются в `EQUIPMENT_CATEGORY_CATALOG`; UI показывает родитель «Оборудование» и семь дочерних routes на одном renderer.
2. Новые categories не получают transports: `protocol_required` до подтверждённой vendor specification.
3. PollingRun сохраняет folder timestamp; PollingResult получает только `File.lastModified` как `file_last_modified` либо `unavailable`.
4. Operational status выводится только из доказательств: success, auth, network, processing, unmatched, unknown.
5. DeviceChange создаётся только по `ANALYZED_PARAMETER_RULES`; отсутствие rules означает отсутствие diff, raw JSON сохраняется.
6. SR импорт использует Map indexes, batches по 256 строк и cooperative yield; UI принимает итоговый state без лишних serialize/deep-clone.

## Последствия

- Хронология отдельного результата больше не подменяется именем папки.
- Новые категории доступны для inventory/matching/Dashboard, но не обещают неподтверждённый опрос.
- Первая версия analyzed rules ограничена Extron Controller Type и Firmware version для Контроллеров/Панелей; расширение требует согласования.
- 25k synthetic rows обрабатываются примерно за 1,87 s, максимальная measured event-loop задержка — около 27 ms.

## Уточнение после эксплуатационной проверки

- Пассивное устройство больше не исключается из inventory при отсутствии inventory/serial/MAC/IP. Оно получает предупреждение и детерминированный fallback key из помещения и описания с порядковым номером одинакового экземпляра.
- Контроллер определяется точным `Тип оборудования = controller` независимо от `Тип модели`; остальные шесть категорий используют точные утверждённые значения `Тип модели`.
- Parent navigation начинается в свёрнутом состоянии и управляется пользователем независимо от active child.
- `error = No credentials were accepted` считается auth evidence только после однозначной связи файла с устройством Extron любой категории из полной базы SR.

## Уточнение целостности matching

- Автоматическая привязка нового JSON использует только текущий `ipNormalized` устройства из актуальной SR. `ipHistory` остаётся исторической и диагностической информацией.
- Индекс разделён на current и historical semantics; historical candidates никогда не создают `deviceId`.
- Подтверждённые внутренние IP paths `$.ip` и `$.webBlocks['LAN Settings']['IP Address']` проверяются против IP имени файла.
- Надёжный конфликт внутреннего IP или категории изолирует результат без связи с SR-устройством, поэтому он не меняет историю, последний статус, Dashboard или DeviceChange.
- При duplicate current IP надёжная категория JSON может выбрать единственного кандидата; иначе matching остаётся неоднозначным.

## Уточнение lifecycle навигации

- Начальное и последующее состояние группы «Оборудование» управляется единым navigation reducer; render не вычисляет раскрытие из active route.
- `toggle_equipment` изменяет только раскрытие, а переход по дочернему route сохраняет выбранное пользователем состояние группы.
- Production click-handler использует тот же reducer/resolver, который покрыт полным `render → click → render` regression для всех семи дочерних routes.
- Collapsed render использует `aria-expanded="false"` и нативный `hidden`; родитель получает то же базовое начертание, что остальные `.nav-button`.

## Уточнение полноты SR inventory

- Внутри одного импорта уже занятый identity-кандидат не перезаписывается другой строкой: точный fingerprint подтверждает duplicate, несовпадение создаёт отдельное устройство и `identity_collision`.
- Fingerprint индексируется только в эфемерном import context; реальные значения не добавляются в диагностику или документацию.
- Пустые идентификаторы получают ordinal fallback и не создают общий duplicate key.
- Без пользовательских фильтров inventory selector использует `current = yes`, поэтому карточка, header count и строки таблицы относятся к одной актуальной SR.
