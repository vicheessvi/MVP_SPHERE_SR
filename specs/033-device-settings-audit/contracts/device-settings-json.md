# Контракт `deviceSettings` в JSON опроса

Успешный опрос точной модели терминала включает объект:

```json
{
  "deviceSettings": {
    "schemaVersion": 1,
    "model": "TE40",
    "fields": {
      "telnet": { "status": "read", "value": "disabled", "source": "WEB_GetCfgParamAPI:enabletelnet" },
      "http": { "status": "protocol_required", "value": null }
    }
  }
}
```

Все девять ключей обязательны: `telnet`, `http`, `snmpV2`, `autoUpdate`, `autoAnswer`, `ntp`, `wifi`, `ssh`, `powerManagement`. Для бинарного подтверждённого чтения `value` принимает только `enabled`/`disabled`; для неготового поля — `null` и один из статусов `protocol_required`, `unavailable`, `not_exposed`. `not_exposed` означает отсутствие подтверждённого web-переключателя, а не доказанно закрытый TCP-порт. Внешние логины, пароли, cookie, токены и непроверенные настройки в этом объекте запрещены.

На текущем этапе `read` разрешён только для `telnet`/`http` Huawei TE20–TE60 и `http` Huawei CloudLink 310. Расширение на SNMP v2, обновление, автоответ, NTP, Wi-Fi, SSH и питание требует отдельного модельного evidence review. Для NTP и управления питанием понадобится версия схемы с составным значением; нельзя без проверки сводить их к одному бинарному флагу.

Действие изменения настройки является отдельным контрактом. Обычный опрос не содержит параметров записи и не запускает изменение; существующая opt-in задача закрытия портов сохраняет свой контракт до отдельной безопасной миграции.
