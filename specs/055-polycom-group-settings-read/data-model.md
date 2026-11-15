# Data model

- `PolycomSettingEvidence`: `status`, `value`, `source`, optional `validationStatus`, `unconfirmedFields`. Статусы `read`, `unavailable`, `not_exposed`, `protocol_required` не взаимозаменяемы.
- `deviceSettings.fields`: девять существующих ключей — `telnet`, `http`, `snmpV2`, `autoUpdate`, `autoAnswer`, `ntp`, `wifi`, `ssh`, `powerManagement`.
- `snmpV2.value`: `enabled/disabled`, `configuredEnabled` и `serviceEnabled` как независимые boolean; только их конъюнкция означает действующий v2.
- `http.value`: `enabled/disabled` только по паре `webAccessEnabled` и `httpsOnly`; `configuredPort` сохраняется отдельно. Не равен измерению TCP listener.
- `autoAnswer.value`: независимые point-to-point и multipoint состояния; отсутствие одного не подменяется вторым.
- `ntp.value`: режим синхронизации, адреса primary/secondary (только в выбранном JSON), неизвестные составные значения отдельно отмечаются. Диагностика не содержит адресов.
- `powerManagement.value`: только действие длительного нажатия кнопки отбоя; `sleepMode` не выводится.
- Идентичность/источник: exact model, IP текущей SR, serial либо MAC, версия правила и точное имя прочитанного параметра. Новые результаты проверенных точных моделей имеют `confirmed_user_validation`; исторические `provisional_user_validation` сохраняются без повышения.

Исторические JSON не меняются. Нормализация новых результатов выполняется только при совпадении exact adapter/model и источника поля.
