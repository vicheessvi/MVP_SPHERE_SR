# Data model

- `LogExportEvidence`: exact model, текущий bundle marker, IP, archive extension, bounded length, gzip prefix, safe status. Никакого имени внутреннего файла или строки архива.
- `LogCollection`: `status` (`saved`, `failed`, `protocol_required`), `validationStatus`, optional `safeError`; новые успешные exact Group 300/310/500/700 после пользовательской проверки получают `confirmed_user_validation`, старые файлы не переписываются. Не содержит содержимого архива.
- `PendingLog`: `logId`, exact IP, filename `<IP>.tgz` либо прежнее `<IP>.xml`, статический формат/MIME, одноразовый поток и ACK. Исходные bytes не входят в status/result JSON.
- `ImportedLogRow`: относительный путь выбранной папки, IP из точного имени, формат, размер, время файла, статус сопоставления с единственной актуальной SR-строкой. Для Polycom нет событийного индекса в этой feature.

Переход состояния: authenticated exact model/identity → bundle-confirmed export → bounded streaming → browser ACK saved/failed → закрытие сеанса и stream. Исторические логи/JSON не переписываются.
