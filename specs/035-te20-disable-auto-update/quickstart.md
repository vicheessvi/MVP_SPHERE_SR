# Validation guide

1. Запустить Python unit tests, `node tests.js`, `node scripts/validate-reference.js`, `node --check app.js`, Python compileall и `git diff --check`.
2. Создать план с «Не менять»: в `managementTasks` нет задачи автообновления.
3. Создать план с «Отключить» для одного exact TE20 по IP из SR: требуется отдельное подтверждение; массовый режим, другая модель и сочетание с другими write-задачами отклоняются до сети.
4. Synthetic contract tests: `0` → no write; `1` → одна одноэлементная запись и post-read `0`; marker/schema/write/post-read failure → неуспех без автоматического повтора.
5. Отдельно после согласования выполнить контролируемую эксплуатационную проверку на реальном TE20 с ручной сверкой меню. Не сохранять реальный IP, credentials или payload в fixtures/Git.
