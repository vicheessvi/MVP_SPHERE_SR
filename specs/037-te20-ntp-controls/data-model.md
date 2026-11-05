# Data model

`ntpChanges`: `{enabled: null|boolean, mode: null|"automatic"|"manual", server: null|string}`. `null` — «Без изменений». Непустая строка сервера длиной максимум 41 символ, без пробелов и управляющих символов; не является URL. Хотя бы одно поле должно быть непустым. При `enabled=false` mode/server остаются null; при `mode=automatic` server остаётся null. Action ID `set_te20_ntp_settings` не сочетается с другими write-задачами и требует один exact TE20 по IP из SR.

Результат содержит safe status, `changed`, `writeAttempted`, сравнение выбранных значений и безопасный код ошибки. Подтверждённое фактическое состояние попадает в `deviceSettings.fields.ntp` локального JSON.
