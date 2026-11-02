# Contract: disable_te20_auto_update

Обычный опрос читает `isenableautoupgrade` и не пишет. Вариант «Не менять» не создаёт action. Единственная opt-in задача `disable_te20_auto_update` требует один exact TE20 по IP из текущей SR, явное подтверждение и прежние pre-auth/post-auth model plus stable identity gates.

После gate текущий bundle должен содержать `WEB_GetCfgParamAPI`, `WEB_SaveCfgParamAPI`, `isenableautoupgrade`. Запрос чтения содержит только `CfgIDString=["isenableautoupgrade"]`; допустим строго integer `0`/`1`. При `0` результат `already_compliant` без записи. При `1` отправляется максимум один `WEB_SaveCfgParamAPI` с единственным `CfgItemInt=[{"CfgItemID":"isenableautoupgrade","CfgItemInfo":0}]`, пустым `CfgItemString` и сеансовым CSRF. `applied` допустим только после точного post-read `0`. Неясный исход записи не повторяется автоматически.

Настройка menu «Автообновление» не отождествляется с общей доступностью Cloud Service или другой моделью. Реальная write-проверка действия остаётся ожидающей; synthetic tests не заменяют её.
