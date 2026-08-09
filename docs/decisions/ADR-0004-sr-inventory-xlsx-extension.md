# ADR-0004: SR inventory, локальный XLSX и polling history

## Статус

Частично заменено ADR-0005 в части runtime и хранения; модель SR/XLSX и polling history сохранена, 2026-08-10.

## Контекст

Продукту требуется импортировать обязательную XLSX-выгрузку SR, сохранять inventory ВКС/контроллеров/панелей и связывать с ним много результатов опроса. Текущий MVP открывается напрямую как `file://`, не имеет backend/build step и не должен обращаться к CDN или выдуманным device APIs.

## Решение

- Сохранить browser-only runtime и перейти с state v1 на v2 с миграцией и backup compatibility.
- Vendor SheetJS CE 0.20.3 вместе с лицензией и загружать его локально до `app.js`.
- Хранить raw SR rows и raw polling JSON рядом с нормализованными проекциями и file/row-scoped issues.
- Идентифицировать устройство консервативно: inventory number → serial + manufacturer → MAC → IP fallback. Исчезновение из новой SR меняет флаг актуальности, но не удаляет историю.
- Представлять один запуск как `PollingRun`, каждый файл как immutable `PollingResult`, а сравнение последовательных результатов как производный `DeviceChange`.
- Ввести registry polling adapters. Пока нет проверенной спецификации transport/credentials, адаптеры имеют `support: not_implemented`, `transport: null`, а UI не выполняет сетевой вызов.
- Не включать device credentials в state, backup или UI.

## Последствия

Пользователь получает законченный offline vertical slice для SR и уже собранных результатов. Все производители остаются видимыми, даже если polling adapter отсутствует. Malformed/unmatched/conflicting файлы сохраняются и объясняются.

Ограничения browser storage усиливаются: XLSX и raw JSON быстро приближают state к программному лимиту 4 МиБ, нет многопользовательской целостности и tamper-resistant history. Перед production или фактическим сетевым опросом нужен новый ADR с защищённым credential store, durable database и документированными vendor transports.

## Рассмотренные альтернативы

- CDN SheetJS: отклонено из-за offline/privacy режима.
- Самописный ZIP/OOXML parser: отклонено как крупная нерелевантная и рискованная подсистема.
- Fake REST/device adapter: отклонено, поскольку создаёт ложное ощущение рабочего опроса.
- Немедленный backend: отложено до согласования production-объёмов, безопасности и deployment boundary.
