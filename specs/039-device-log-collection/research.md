# Research

- **Decision**: exact TE20 first. **Rationale**: read-only live bundle показал кнопку `exportLogFile`, открывающую относительный `/log?actkn=<session-token>?rmd=<nonce>`. Контрольный GET вернул HTTP 200, `application/x-octet-stream`, XML root `LogModule`, более 4 МиБ и без Content-Length. **Alternative**: угадывать endpoint для других моделей — запрещено.
- **Decision**: потоковое сохранение через loopback и File System Access API. **Rationale**: размер неизвестен, JSON/base64 раздует память, временная серверная копия нарушит локальную политику данных. **Alternative**: ограничить файл произвольным лимитом или записывать spool в проект — отклонено.
- **Decision**: импортировать оригиналы как метаданные с проверкой сигнатуры XML/ZIP/текста. **Rationale**: события логов разных моделей ещё не подтверждены, а архивы могут быть большими или опасными при распаковке.
