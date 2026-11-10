# Contract: provisional Box 310 / Box 610 settings read

Один алгоритм read-only чтения использует существующий общий Huawei 310 core, но два exact-model descriptor. До credentials требуются прежние bundle/pre-auth model gates; после входа — точная модель и SN/ESN либо MAC. Новые GET/POST read-form доступны только при маркерах текущего bundle, после identity gate; никаких PUT/DELETE настроек нет. Для полей применяются ограниченные ключи и схемы feature 043 как кандидаты, без чтения Wi‑Fi/серверных паролей. `siteName` fallback допускается только по маркеру `sitename`.

Каждое считанное Box-поле получает `validationStatus=provisional_user_validation`; ни один успешный Bar 310 тест не подтверждает Box 310/610. При отсутствии marker — `protocol_required`, при ошибке схемы — `unavailable`. Подтверждение одного Box не подтверждает другой.

Кандидатный `autoUpdate` — возможность обновления прошивки по типу сервера с `basis=server_type_audit_rule`, `meaning=firmware_update_capability`; значения кодов Box требуют отдельной пользовательской сверки. Пока provisional, XLSX не выдаёт эти значения за подтверждённый факт.

Администратор позднее подтвердил наименования и фактические значения на каждой Box отдельно. Новые результаты read-only полей и Site name получают `confirmed_user_validation`; прежние provisional JSON не меняются. Контракт HTTP write остаётся предварительным.
