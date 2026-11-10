# Quickstart / acceptance

1. Для каждой exact модели сформировать обычный план по текущей SR; все три должны получить один transport при сохранении собственного model-key.
2. Синтетически проверить pre-auth wrong-model: credential endpoint не вызывается; post-auth wrong-model/identity: настройки не читаются.
3. Проверить новые JSON: один contract ID, точная модель, Bar confirmed и Box provisional для новых настроек.
4. Импортировать старые Bar/Box JSON с прежними model-key/contract ID: сопоставление SR и история не теряются.
5. Проверить неизвестный/суффиксный вариант, отсутствие внешней передачи, неизменность HTTP opt-in write и отсутствие Telnet fallback.
6. Выполнить Python/JavaScript тесты, syntax и Справочник. Реальные Box пользователь проверит отдельно позже.
