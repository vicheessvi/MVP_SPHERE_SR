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

Все девять ключей обязательны: `telnet`, `http`, `snmpV2`, `autoUpdate`, `autoAnswer`, `ntp`, `wifi`, `ssh`, `powerManagement`. Для бинарного подтверждённого чтения `value` принимает только `enabled`/`disabled`; для неготового поля — `null` и один из статусов `protocol_required`, `unavailable`, `not_exposed`. Подтверждённый TE20 NTP сохраняет `{enabled, modeCode, mode, server}`, где `server` — точная строка устройства; `modeCode=0` соответствует `automatic`, `1` — `manual` по текущему web-bundle. Управление питанием TE20 сохраняет `{sleepMode, sleepTimeCode, scheduledRestartCode}`; при наличии подтверждённых дополнительных полей — также `{shutdownRestartEnabled, restartHour, restartMinute}`. `sleepTimeCode=0` подтверждён как `never`, `scheduledRestartCode=0` — выключенный плановый перезапуск, `shutdownRestartEnabled=false` — выключенный пункт «Shut Down/Restart». Время расписания не считается активным при выключенном плановом перезапуске. `not_exposed` означает отсутствие подтверждённого web-переключателя, а не доказанно закрытый TCP-порт. Логины, пароли, cookie и токены в этом объекте запрещены.

На текущем этапе `read` разрешён для `telnet`/`http` Huawei TE20–TE60, `http` Huawei CloudLink 310, а также для `ssh`, `autoUpdate`, `autoAnswer`, `ntp`, `powerManagement` только exact Huawei TE20 после подтверждённого модельного чтения. `autoAnswer` использует `autoreply`: код `1` подтверждён как ручной ответ (`disabled`), код `0` соответствует автоматическому ответу (`enabled`); иные коды недоступны для интерпретации. SNMP v2 у exact TE20 помечается `not_exposed` с причиной `version_not_supported` по подтверждению администратора; это не утверждение о состоянии SNMP v3 или порта UDP/161. Wi-Fi получает `not_exposed` с причиной `capability_absent` только при `termSpecs.EnableWifi=0` в текущем опросе. Если возможность Wi-Fi присутствует, а точный переключатель ещё не подтверждён, остаётся `protocol_required`. Расширение на другие модели требует отдельного evidence review.

Действие изменения настройки является отдельным контрактом. Обычный опрос не содержит параметров записи и не запускает изменение; существующая opt-in задача закрытия портов сохраняет свой контракт до отдельной безопасной миграции.
