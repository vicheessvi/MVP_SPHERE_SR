# DB-first API

Все операции используют существующий workspace/admin/session/Origin/CSRF gate.

- prepare: обработать ограниченную партию прежних порций; вернуть прогресс.
- bootstrap: read revision, counts, latest SR, безопасные настройки.
- view: whitelisted route/filter/page <=100, total/hasNext, агрегаты без массива всех событий.
- context: порции SR-контекста для импортов и плана; не события/история опросов.
- import begin/batch/finish: ожидаемая revision, private staging, атомарная публикация.
- progress: тот же POST/session/admin/Origin/CSRF gate; workspace + import token из текущего сеанса. Возвращает только stage/status/percent/processed/total/elapsedSeconds из памяти, без SQLite-запроса, payload, имён файлов или исходных строк. Неверный формат ID отклоняется; чужое/ещё не начатое состояние — pending, без раскрытия его прогресса. Завершение 100% публикуется только после commit; ошибка оставляет failed. Прогресс advisory, не разрешение повторить finish/write.

Старые ответы не подменяют новый маршрут. Ошибка SQL не раскрывает текст запросов или пользовательских payload.
