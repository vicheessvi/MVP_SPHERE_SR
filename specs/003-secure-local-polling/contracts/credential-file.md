# Credential file contract

## JSON

Root may be an array or `{ "credentials": [...] }`. Each record requires `ip`, `username` or `login`, and `password`. Russian aliases `IP`, `Логин`, `Пароль` are accepted case-insensitively.

## CSV

UTF-8 with a header row and comma/semicolon delimiter. Required logical columns are IP, login/username and password. Quoted fields and escaped double quotes are supported.

Duplicate normalized IP, invalid/unicast-forbidden IP, empty login or empty password rejects the entire replacement. Errors identify row and field but never echo secret values.
