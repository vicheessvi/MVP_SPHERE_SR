# Матрица подтверждённости чтения настроек

Пути меню, сообщённые администратором, подтверждают, где человек видит параметр. Они не задают URL, action, ID конфигурации, тип ответа и безопасный способ чтения из программы. До получения такой схемы значение остаётся `protocol_required`; в отчёте оно не может стать «отключено» по умолчанию.

| Модель | Telnet | HTTP | SNMP v2, автообновление, автоответ, NTP, Wi-Fi, SSH, питание |
| --- | --- | --- | --- |
| Huawei TE20 | Подтверждённое чтение `WEB_GetCfgParamAPI`, `enabletelnet`, после exact post-auth identity | Подтверждённое чтение `WEB_GetCfgParamAPI`, `enable_http`, модельная семантика TE20 | На контролируемом TE20 подтверждено read-only чтение `enable_ssh`, `isenableautoupgrade`, `synSerTime`, `ntpGetMode`, `timeServer`, `sleepTime`, `enableTimeReboot` и `autoreply` из текущего bundle после exact identity. Текущий web-bundle связывает `ntpGetMode=0` с автоматическим получением сервера, `1` с ручным вводом. Дополнительное guarded чтение `suppotReboot`, `rebootHour`, `rebootMinute` отделяет «Shut Down/Restart» от планового перезапуска. `autoreply=1` сверено с «Вручную» и означает отключённый автоответ. SNMP v2 у TE20 не поддерживается (`not_exposed`). Wi-Fi получает `not_exposed` только при `termSpecs.EnableWifi=0`; на другой прошивке состояние остаётся `protocol_required` до подтверждения переключателя |
| Huawei TE30/TE40/TE50/TE60 | То же чтение и отдельный exact model gate | То же чтение, но семантика `enable_http` в действующем контракте отличается от TE20 | `protocol_required` для каждого нового поля |
| Huawei CloudLink Bar 310/Box 310/Box 610 | Web-управление Telnet не предоставлено по проверке администратора; состояние TCP/23 не доказано | Подтверждённое чтение `POST /v1/om/config` с `CfgIDString=["enable_http"]` после exact identity | `protocol_required`; `specification.supportWifi` — способность устройства, не состояние интерфейса. Руководство Huawei 22.2.2 описывает кандидатный read-only NTP-запрос с `synSerTime`, `ntpGetMode`, `ntpServerAddr`, но текущие bundle/ответ на точных устройствах ещё не проверены |
| Huawei CloudLink Bar 300/Box 300/Box 600 | `protocol_required` | `protocol_required` | `protocol_required` |
| Polycom RealPresence Group 300/310/500/700 | `protocol_required` | `protocol_required` | `protocol_required`; ранее подтверждённый `/rest/config` MAC-параметр не разрешает произвольные имена настроек |

## Семантические ограничения

- «SNMP v3 по умолчанию» не доказывает, что SNMP v2 отключён на конкретном устройстве.
- «Cloud platform type» не доказан как переключатель автоматического обновления ПО.
- «Answer mode» относится к автоматическому **ответу**, а не к исходящему автодозвону; эту интерпретацию надо явно показывать в интерфейсе.
- Polycom «Hang-up Button Long Press» не доказан как выключение спящего режима.
- Отсутствие пункта Wi-Fi, Telnet или Auto-update в меню не доказывает выключенный сервис или интерфейс.
- Для отчёта по старым JSON допускается только явно присутствующий и однозначно привязанный факт; если поле не было опрошено, указывается «Нет данных».

## Следующие доказательства

1. Обезличенный пример новой XLSX-таблицы с точными заголовками и кодированием желаемых значений.
2. Для каждого модельного семейства: обезличенные ответы read-only API на целевые параметры, маркеры текущего bundle, точная схема значений и проверка их соответствия web-меню.
3. Отдельный контроль того, что запрос к устройству не меняет настройки; только затем поле может получить статус `read`.

Источник кандидатного NTP-контракта: [*Huawei Box 310, Box 610, and Bar 310 HTTP API Reference Guide*](https://us.v-cdn.net/6031006/uploads/editor/9a/ee7mcw7tnddt.pdf), выпуск 22.2.2, 2023-11-13, раздел 3.1.8.1.4. До проверки текущего bundle и ответа реального устройства это не повышает статус поля до `read`.
