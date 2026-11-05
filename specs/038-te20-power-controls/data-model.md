# Data model

`powerChanges`: `{shutdownRestart: null|boolean, sleepMinutes: null|0|1|5|10|15|30|60, scheduledRestart: null|boolean, restartHour: null|0..23, restartMinute: null|0..59}`. Null — «Без изменений». Пара времени либо целиком null, либо оба целых числа. Включение расписания требует явного времени; отключение запрещает новую пару времени. При изменении времени без смены флага адаптер требует активного текущего расписания.

Фиксированный action `set_te20_power_settings` не сочетается с другими write-задачами. Результат содержит безопасный статус, попытку записи, значения до/после и safe error без credentials/raw responses.
