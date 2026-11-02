# Contract: TE20 HTTP/Telnet open/close

| Action ID | Поле | Целевое значение | Смысл |
| --- | --- | --- | --- |
| `set_te20_http_open` | `enable_http` | `1` | Открыть HTTP в настройке меню |
| `set_te20_http_closed` | `enable_http` | `0` | Закрыть HTTP в настройке меню |
| `set_te20_telnet_open` | `enabletelnet` | `1` | Открыть Telnet в настройке меню |
| `set_te20_telnet_closed` | `enabletelnet` | `0` | Закрыть Telnet в настройке меню |

Обычный опрос и «Не менять» остаются read-only. Для каждого action после точных pre-auth и post-auth model/identity gates должны быть маркеры текущего bundle `WEB_GetCfgParamAPI`, `WEB_SaveCfgParamAPI` и выбранного поля. Чтение ровно одного `CfgIDString`; допустим только строгий integer `0`/`1`. Если текущее значение равно целевому, статус `already_compliant` без записи. Иначе максимум один `WEB_SaveCfgParamAPI` с одним `CfgItemInt` и пустым `CfgItemString`, затем повторное чтение того же поля. `applied` только при точном совпадении. Неясная запись не повторяется автоматически. Никакого HTTP transport fallback; значение в меню не доказывает состояние TCP listener.

Две выбранные задачи выполняются последовательно и отдельно; ошибка одной не даёт разрешения на повтор другой или на автоматический откат. Администратор сообщил об успешной проверке открытия TE20 на рабочем ПК.
