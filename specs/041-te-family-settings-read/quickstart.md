# Quickstart / acceptance

1. Запустить стандартный автоматический опрос одного exact TE40.
2. Сверить семь групп `deviceSettings.fields` с web-меню; не сохранять пароли, community или raw SNMP/Wi-Fi ответы.
3. Проверить плановое включение и отключение отдельно: статус и время активного расписания, `null` вместо времени выключенного; убедиться, что `scheduledRestartCode` отсутствует.
4. По отдельности проверить TE30, TE50, TE60; до подтверждения не объявлять их эксплуатационно проверенными.
5. Выполнить `python -m unittest discover -s python_tests -v`, `node tests.js`, `node scripts/validate-reference.js`.
