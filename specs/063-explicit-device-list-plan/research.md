# Research

Существующий managementTargetListSession используется только при checkbox закрытия
портов. Выбор листа неявный через rowsFromWorkbook. JSON flag управляет сохранением,
но не передаётся adapter: Huawei/Polycom читают обычные ресурсы/настройки даже в
logs-only/write workflow. collectJson=false + collectLogs=false запрещён, поэтому
невозможен отдельный write-only. Новые branches нужны внутри подтверждённых
adapters после identity gates, не HTTP fallback/новый endpoint.

PollingJob уже глубоко копирует plan; recovery сохраняет секрет-free snapshot и
блокирует неизвестные повторные writes. Это используется как основа новой
матрицы. V4 обязан проверять выбранные действия независимо от UI. Legacy v3
остаётся только совместимостью старых планов, новый источник требует v4.
