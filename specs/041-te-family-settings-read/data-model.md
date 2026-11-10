# Data Model

- `deviceSettings.fields`: девять независимых полей со статусом `read | protocol_required | unavailable | not_exposed`, значением и source только при чтении.
- `snmpV2`: нормализованный флаг версии 2 и признак общего SNMP service; поля community и паролей исключены.
- `wifi`: код режима 0–3, `clientEnabled`, `accessPointEnabled`; идентификаторы сетей не включаются.
- `ntp`: включение, код режима адреса, ограниченная строка сервера.
- `powerManagement`: режим сна и код времени, `shutDownEnabled`, независимые `scheduledPowerOn` и `scheduledPowerOff` с `{enabled, time}`; `time=null` при выключенном расписании. Legacy `scheduledRestartCode` для TE30/40/50/60 исключён.
- Неизвестный код или ответ меняет только соответствующее поле на `unavailable`; отсутствие метода — `protocol_required`.
