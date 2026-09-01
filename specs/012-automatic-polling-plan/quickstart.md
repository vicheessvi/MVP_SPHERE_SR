# Quickstart validation

1. Открыть `index.html`, загрузить синтетическую SR и убедиться, что четыре секции «Загрузки» отображаются без длинных пояснений.
2. Проверить каскад «Тип оборудования → Производитель → Модель» для одного, нескольких и всех значений; счётчик равен итоговому массиву.
3. Загрузить синтетический XLSX `Логин | Пароль`; UI показывает только безопасные счётчики.
4. Задать дату и интервал, скачать plan v2 и убедиться, что secret-like полей нет.
5. Выполнить локально: `./poll-extron.ps1 -Plan <plan.json> -Credentials <credentials.xlsx> -Output <local-folder> -AllowInsecureTls`.
6. Проверить папку `YYYY-MM-DD_HH-mm-ss`: один JSON на обработанное устройство, unsupported не вызвал сеть, интервал был только после записи и перед следующим поддерживаемым устройством.
7. Запустить `node tests.js`, `node runtime-tests.js`, `node server-tests.js`, `node scripts/validate-reference.js` и syntax/secret scans.
