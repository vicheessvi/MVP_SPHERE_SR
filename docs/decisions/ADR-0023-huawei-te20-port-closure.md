# ADR-0023: Закрытие HTTP/Telnet на Huawei TE20

**Статус**: Принято 2026-09-08

## Контекст

TE20 уже имел отдельный подтверждённый polling transport из-за точного TLS 1.1 и legacy pre-auth схемы, но write-capability была запрещена. Пользователь потребовал проверить и добавить существующую задачу закрытия HTTP/Telnet для TE20.

Контролируемый реальный сеанс подтвердил наличие `WEB_GetCfgParamAPI`, `WEB_SaveCfgParamAPI`, `enabletelnet` и `enable_http`, чтение обоих бинарных значений и приём минимальной записи. Первоначально семантика `enable_http` была перенесена с TE30–TE60; последующее наблюдение меню реального TE20 показало, что это значение не отключает HTTP на данной модели.

## Решение

- Добавить exact TE20 в единственную capability `disable_insecure_management_services`.
- Сохранить для TE20 отдельный `huawei_te20_web_cgi_v1` и exact TLS 1.1; не переносить его в общий transport TE30–TE60.
- Перед write сохранить legacy pre-auth gate, exact post-auth TE20 и serial-or-MAC identity, bundle markers и точную схему обоих параметров.
- Разрешить для TE20 только `enabletelnet=0` и `enable_http=0` одним минимальным save; семейство TE30–TE60 сохраняет отдельную подтверждённую цель `enable_http=1`.
- Если значения уже безопасны, не выполнять save.
- После save считать успехом только точный post-read обоих значений меню; TCP listener не входит в критерий.
- Определять transport capability из exact device manifest, чтобы TE20 не наследовал transport другой модели.

## Последствия

Задача доступна exact TE20/TE30/TE40/TE50/TE60 через прежний отдельный XLSX-список, plan schema v3 и явный opt-in. Реальная write-проверка подтверждена для TE20 и TE40. Другие Huawei-модели остаются неподдерживаемыми. Credentials, cookie, CSRF, адрес и raw device responses не сохраняются.

## Корректировка по результату эксплуатации

Повторная проверка реального TE20 показала, что унаследованное от TE30–TE60 значение `enable_http=1` оставляет HTTP включённым, хотя `enabletelnet=0` корректно отключает Telnet. Контракт TE20 исправлен на `enable_http=0`; отчёт теперь трактует состояние только относительно exact-модели и объявляет успех после повторного чтения `enabletelnet=0`, `enable_http=0`. Значения и поведение TE30/TE40/TE50/TE60 не изменены.
