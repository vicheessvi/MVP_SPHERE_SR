# Contract: Huawei 310 Answer mode write

Только exact Bar 310, Box 310 и Box 610 через `huawei_310_rest_v1` / `huawei-310-rest-v1`, один IP из подтверждённой SR, одна standalone write-задача и отдельное согласие. Для «Не менять» action отсутствует.

После pre-auth model, post-auth model/identity и текущих bundle markers `reqGetCfgUrl="/v1/om/config"`, `reqSaveCfgUrl="/v1/om/config"`, `CfgIDString:["autoreply"`, `CfgItemID:"autoreply"`: POST read-form только `autoreply` в `{0,1}`. `1=automatic`, `0=manual` по контролируемому Bar-циклу. При совпадении — `already_compliant` без PUT. Иначе ровно один PUT `/v1/om/config` с одним `CfgItemInt` и пустым `CfgItemString`, затем точный POST read-form. Только совпадение даёт `applied`; иначе `failed`. Никаких иных config ID или HTTP/Telnet fallback.

Bar write — `confirmed_local_validation` после отдельных контролируемых переходов в обоих направлениях с машинным post-read и подтверждением web-меню. Box 310/610 — `provisional_user_validation` до отдельных проверок. Никакая Bar-проверка не подтверждает Box write.
