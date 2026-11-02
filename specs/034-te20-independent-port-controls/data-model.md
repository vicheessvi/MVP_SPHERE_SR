# Data model

## Выбор порта в форме

`httpMode`, `telnetMode` ∈ `unchanged | open | close`. Начальное значение `unchanged`. Значения хранятся только в памяти вкладки.

## План schema v3

`managementTasks` содержит ноль, одно или два точных action ID: `set_te20_http_open`, `set_te20_http_closed`, `set_te20_telnet_open`, `set_te20_telnet_closed`. Для каждого порта одновременно может присутствовать не более одного ID. Старый `disable_insecure_management_services` не сочетается с ними. Источник — SR, единственная цель — exact TE20 по IP.

## Результат действия

`id`, `status`, `changed`, `writeAttempted`, `before`, `after`, опционально `safeError`. Не содержит credentials, cookie, CSRF, raw body, serial/MAC или адресов.
