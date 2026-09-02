# Quickstart: модуль «Перезагрузки устройств»

1. Выполнить `node tests.js`.
2. Выполнить `node scripts/validate-reference.js` и `node --check app.js product-catalog.js`.
3. Открыть `index.html`, загрузить синтетическую SR и минимум один Extron JSON с `Device Status.Date` и `Device Status.Uptime`.
4. Проверить порядок: «Главный экран» → «Перезагрузки устройств» → «Оборудование».
5. Проверить состояния: нет SR, один опрос, непрерывный uptime, подтверждённый reboot, конфликт uptime, фильтр без результатов.
6. Сверить числа KPI, distributions и таблицы, включая равные максимумы.
7. Перезагрузить вкладку и подтвердить отсутствие сохранённой аналитики.
8. Выполнить `git diff --check` и secret/artifact/IP scan перед возможным commit.
