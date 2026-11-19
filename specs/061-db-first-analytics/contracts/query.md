# DB-first API

Все операции используют существующий workspace/admin/session/Origin/CSRF gate.

- prepare: обработать ограниченную партию прежних порций; вернуть прогресс.
- bootstrap: read revision, counts, latest SR, безопасные настройки.
- view: whitelisted route/filter/page <=100, total/hasNext, агрегаты без массива всех событий.
- context: порции SR-контекста для импортов и плана; не события/история опросов.
- import begin/batch/finish: ожидаемая revision, private staging, атомарная публикация.

Старые ответы не подменяют новый маршрут. Ошибка SQL не раскрывает текст запросов или пользовательских payload.
