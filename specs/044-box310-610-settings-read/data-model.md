# Data Model

- `BoxSettingsContract`: точная модель (`Box 310` или `Box 610`), отдельный contract ID и provisional validation status.
- `DeviceSettings`: те же поля, что у Bar 310, с точным источником и проверкой схемы. Для Box результат `read` сопровождается `validationStatus=provisional_user_validation`; `protocol_required` и `unavailable` не получают значения.
- `SiteName`: отдельное поле со статусом и, если прочитано на Box, provisional validation status.
- `autoUpdate`: предварительное значение возможности обновления прошивки с источником типа сервера; `basis` и `meaning` сохраняются, но эксплуатационная семантика ещё не подтверждена для каждой Box.
- При импорте JSON предварительные значения не подменяют подтверждённые факты XLSX; исходный JSON не изменяется.
- После отдельного подтверждения администратором обеих моделей новые поля и Site name имеют `validationStatus=confirmed_user_validation`. Исторический `provisional_user_validation` не повышается автоматически; статус HTTP write независим и остаётся предварительным.
