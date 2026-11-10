# Data Model

- `DeviceSettings`: существующая версия схемы, exact модель, поля `telnet`, `http`, `snmpV2`, `autoUpdate`, `autoAnswer`, `ntp`, `wifi`, `ssh`, `powerManagement`.
- Каждое поле: `status` (`read`, `not_exposed`, `protocol_required`, `unavailable`), `value` и при чтении — `source`. `null` нельзя интерпретировать как выключенное состояние.
- Составные поля NTP, Wi‑Fi и питания получают только подтверждённые подполя; неизвестное подполе не подменяется значением другого.
- `SiteName`: отдельное поле со статусом и подтверждённым значением либо `null`.
- `autoUpdate` exact Bar 310 — согласованный с администратором аудиторский признак по типу сервера, не измерение механизма обновления прошивки. При `read` обязательны `basis=server_type_audit_rule`, `ruleVersion=bar310-server-type-audit-v1` и точный источник server-type read; неизвестные варианты не подменяются «Включено».
- Секретные значения из ответа (пароли, Wi‑Fi ключи, токены) исключаются до итогового JSON.
