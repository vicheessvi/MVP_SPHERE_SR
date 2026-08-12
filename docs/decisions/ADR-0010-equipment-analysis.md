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
- Утверждённая категория из «Тип модели» имеет приоритет над общим `Тип оборудования = controller`.
- Parent navigation начинается в свёрнутом состоянии и управляется пользователем независимо от active child.
- `error = No credentials were accepted` считается auth evidence только после однозначной связи файла с устройством Extron любой категории из полной базы SR.
