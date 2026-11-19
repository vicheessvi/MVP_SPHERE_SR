# Data Model

- Read revision: source snapshot revision + номер новых DB-first импортов; курсоры и ответы привязаны к нему.
- Indexed record: label/key, id/device/time/kind и searchable SR/JSON/event поля + безопасный payload. Индексы покрывают тип, устройство и время.
- Preparation: номер следующей старой порции; подтверждение SHA-256; отдельный ready flag.
- Import: token/base revision/режим, staged записи; опубликованы только транзакционно.
- Browser: маленький кеш ответов, filters/page, временный SR operational context; полной истории опросов/логов нет.
- Import progress: только память browser/runtime session, числовые work counters, stage/status/время; <=64 серверных состояний на сеанс, не самостоятельная постоянная копия данных. Завершённая аналитика по-прежнему публикуется атомарно.
- `rm_idx_event_scope`: дополнительный covering index только нормализованных событий; без payload и оригинальных файлов. Его подготовка не меняет данные/их ревизию. Большой payload запрашивается отдельно по label/key только для ключей текущей страницы.
