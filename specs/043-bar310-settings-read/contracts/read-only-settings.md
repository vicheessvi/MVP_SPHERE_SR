# Contract: exact Bar 310 settings read

Новые чтения разрешены только в обычном read-only опросе `huawei-bar310-rest-v1` после существующих pre-auth model, bundle и post-auth identity gates. Точное имя ресурса, параметра и схема ответа для каждого нового поля должны быть занесены сюда после проверки текущего устройства. До этого для поля сохраняется `protocol_required`.

| Поле | Подтверждённый источник сейчас | Статус |
| --- | --- | --- |
| HTTP | management config `enable_http` в `{0,1}` | `read` при валидном ответе |
| Telnet, SNMP v2, автообновление | модельный статус отсутствия из текущего контракта | `not_exposed`, не измерение порта |
| Site name | `POST /v1/om/config`, `CfgIDString=["sitename"]`, строка до 256 символов | `read` при точной схеме |
| Автоответ | `CfgIDString=["autoreply"]`, 1=автоматически, 0=вручную по подтверждённому циклу на exact Bar 310 | `read` при точной схеме |
| NTP | `synSerTime`, `ntpGetMode`, `ntpServerAddr`; 0/1, 0=авто/1=вручную, строка | `read` при точной схеме всех трёх |
| Wi‑Fi | `enableWifi`, `apEnable`, `isWifiPriority`; три флага 0/1 | `read` при точной схеме всех трёх |
| SSH | `enable_ssh`; 1=включено, 2=выключено | `read` при точной схеме |
| Питание | `suppotReboot`, `sleepTime`, `autoReboot`, `sleepCloseAPP`, `autoRebootVal`, `savePowerMode`; только поля текущего web-bundle | `read` при точной схеме подтверждённых полей; расписание включения/выключения TBD |

Никакой отдельный write-action, fallback на HTTP/Telnet/SSH и перенос на Box 310/610 этим контрактом не разрешаются. При drift схемы поле остаётся неизвестным и обычный опрос не теряет уже проверенные значения.
