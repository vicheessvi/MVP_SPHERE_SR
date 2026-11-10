# Huawei 310 log export v1

После точного pre-auth `licenseEquipName`, bundle markers, авторизации и post-auth `terminalType` плюс SN/ESN либо валидный MAC выполняется максимум один экспорт: `POST /v1/om/log/export` на HTTPS/443. Используются только cookie и `X-Access-Token` текущего сеанса. Принимается HTTP 200 с `application/x-octet-stream` или `application/octet-stream` и XML-префиксом `<?xml…<LogModule`. Остальные ответы блокируются `log_contract_unconfirmed`.

Поток передаётся в `on_log(stream, {ip, filename: "<IP>.xml"})`; только ACK `saved`/`failed` допустим. Содержимое не попадает в результат. Результат Box помечается `provisional_user_validation`.
