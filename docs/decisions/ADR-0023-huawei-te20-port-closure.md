# ADR-0023: Закрытие HTTP/Telnet на Huawei TE20

**Статус**: Принято 2026-09-08

## Контекст

TE20 уже имел отдельный подтверждённый polling transport из-за точного TLS 1.1 и legacy pre-auth схемы, но write-capability была запрещена. Пользователь потребовал проверить и добавить существующую задачу закрытия HTTP/Telnet для TE20.

Контролируемый реальный сеанс подтвердил наличие `WEB_GetCfgParamAPI`, `WEB_SaveCfgParamAPI`, `enabletelnet` и `enable_http`, чтение обоих бинарных значений, приём минимальной безопасной записи и повторное чтение безопасного состояния. Устройство уже было безопасным, поэтому для доказательства write-контракта повторно отправлялись только безопасные значения; HTTP или Telnet не включались.

## Решение

- Добавить exact TE20 в единственную capability `disable_insecure_management_services`.
- Сохранить для TE20 отдельный `huawei_te20_web_cgi_v1` и exact TLS 1.1; не переносить его в общий transport TE30–TE60.
- Перед write сохранить legacy pre-auth gate, exact post-auth TE20 и serial-or-MAC identity, bundle markers и точную схему обоих параметров.
- Разрешить только `enabletelnet=0` и `enable_http=1` одним минимальным save.
- Если значения уже безопасны, не выполнять save.
- После save считать успехом только точный post-read обоих значений меню; TCP listener не входит в критерий.
- Определять transport capability из exact device manifest, чтобы TE20 не наследовал transport другой модели.

## Последствия

Задача доступна exact TE20/TE30/TE40/TE50/TE60 через прежний отдельный XLSX-список, plan schema v3 и явный opt-in. Реальная write-проверка подтверждена для TE20 и TE40. Другие Huawei-модели остаются неподдерживаемыми. Credentials, cookie, CSRF, адрес и raw device responses не сохраняются.
