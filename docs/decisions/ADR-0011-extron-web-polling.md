# ADR-0011: Contract-based локальный web-опрос Extron

**Статус**: принято

**Дата**: 2026-08-31

## Контекст

На контроллере Extron подтверждён рабочий HTTPS flow: Basic login создаёт `NortxeSession`, текущий `/www/main.js` содержит session-bound URI, а данные читаются точным `/api/swis/resource<uri>`. Добавление query к project resource вызывает ошибку устройства. Пользователь требует распространить алгоритм на контроллеры и панели Extron, сохранить ручной импорт и принимать стандартные credentials из отдельного Excel.

Direct-file UI не может безопасно выполнять Node/system networking или хранить secrets. Жёсткий список моделей также не доказывает одинаковый web contract прошивки.

## Решение

1. Поддержка определяется contract discovery, а не model allowlist.
2. Отдельный Node adapter выполняет login, хранит cookie только в памяти, читает bundle и использует только динамически найденные allowlisted semantic resources.
3. Неизвестный bundle/schema завершается `unsupported_web_contract`/`protocol_required` без guessed endpoints.
4. Network target всегда принадлежит explicit plan allowlist; redirect на другой host не выполняется.
5. Excel credentials импортируются polling-скриптом напрямую в Windows DPAPI vault. Scope: IP или тип+производитель с необязательной моделью; приоритет IP → модель → общий type/vendor.
6. Browser не читает credentials. Он только формирует plan JSON без secrets и вручную импортирует готовую папку результатов.
7. Default output находится вне Git в `%LOCALAPPDATA%\MVP_SPHERE_SR\poll-results\<capture-time>`; per-IP JSON записывается атомарно и redacted.

## Последствия

- Новая модель с тем же контрактом работает без изменения каталога моделей.
- Модель с другим поколением UI честно не опрашивается до подтверждения нового контракта.
- На другом ПК DPAPI vault не переносится через Git; Excel credentials импортируются заново из защищённого источника.
- Ручная загрузка общей папки остаётся доступной и не зависит от CLI.
- Self-signed TLS остаётся явным локальным исключением и не отключает проверку глобально.

## Отклонённые варианты

- Browser credential input/network polling: нарушает direct-file memory-only boundary.
- Хранение output рядом с репозиторием: повышает риск commit/archive runtime data.
- Hardcoded resource hashes: значения session-bound и не переносимы между устройствами/сессиями.
- Автоматический fallback на SIS/SSH/SNMP: подтверждённых контрактов нет.
