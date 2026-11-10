# Data Model

- `DeviceSettings`: существующая версия схемы, exact модель, поля `telnet`, `http`, `snmpV2`, `autoUpdate`, `autoAnswer`, `ntp`, `wifi`, `ssh`, `powerManagement`.
- Каждое поле: `status` (`read`, `not_exposed`, `protocol_required`, `unavailable`), `value` и при чтении — `source`. `null` нельзя интерпретировать как выключенное состояние.
- Составные поля NTP, Wi‑Fi и питания получают только подтверждённые подполя; неизвестное подполе не подменяется значением другого.
- `SiteName`: отдельное поле со статусом и подтверждённым значением либо `null`.
- Секретные значения из ответа (пароли, Wi‑Fi ключи, токены) исключаются до итогового JSON.
