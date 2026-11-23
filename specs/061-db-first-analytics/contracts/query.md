# DB-first API

Все операции используют существующий workspace/admin/session/Origin/CSRF gate.

- prepare: обработать ограниченную партию прежних порций; вернуть прогресс.
- bootstrap: read revision, counts, latest SR, безопасные настройки.
- view: whitelisted route/filter/page <=100, total/hasNext, агрегаты без массива всех событий.
- export-devices: только текущие ВКС «Учёт» и журнальные события; kind=confirmed_reboot возвращает reboots/firstReboot/lastReboot, kind=power_off возвращает confirmed/suspected и соответствующие first/last. Чужие показатели отсутствуют, unknown_start не экспортируется как подтверждённый reboot/power_off. Общие SR-поля и прежние фильтры/drilldown сохранены.
- offhours: только текущие ВКС «Учёт» и проверенные журнальные события. period=2m
  по умолчанию либо today/7d/30d/custom; offhoursTime=all/night/weekend/holiday,
  offhoursGroup=all/none/once/repeated/suspected/unknown,
  offhoursMetric=all либо существующий kind для карты/часовой детализации.
  Возвращает denominator, пять групп, matchedDevices, <=168 cells, TOP-5,
  rows<=100/hasNext, точные period.from/toExclusive и версию/источник календаря.
  day/hour ограничивают устройства детализации, но не пересчитывают исходные
  группы и счётчики за период. offhoursUntil фиксирует верхнюю границу для всех
  страниц XLSX, не может быть из будущего. Calendar years вне 2024–2027 дают
  calendar_year_unsupported. Ноль наблюдений — unknown, не доказанное отсутствие
  выключений. Предположения не входят в confirmed. Запись БД/сеть не выполняются.
- context: порции SR-контекста для импортов и плана; не события/история опросов.
- import begin/batch/finish: ожидаемая revision, private staging, атомарная публикация.
- progress: тот же POST/session/admin/Origin/CSRF gate; workspace + import token из текущего сеанса. Возвращает только stage/status/percent/processed/total/elapsedSeconds из памяти, без SQLite-запроса, payload, имён файлов или исходных строк. Неверный формат ID отклоняется; чужое/ещё не начатое состояние — pending, без раскрытия его прогресса. Завершение 100% публикуется только после commit; ошибка оставляет failed. Прогресс advisory, не разрешение повторить finish/write.

Старые ответы не подменяют новый маршрут. Ошибка SQL не раскрывает текст запросов или пользовательских payload.
