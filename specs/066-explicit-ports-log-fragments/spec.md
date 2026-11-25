# Feature 066 — только явные порты и совместимый переанализ логов

Дата: 2026-11-25. Статус: реализовано, регрессии пройдены. Администратор требует убрать прежнее комплексное закрытие
HTTP/Telnet: загрузка таблицы ничего не меняет, Answer mode не затрагивает порты,
порты меняются только отдельными явными controls. Подтверждённый TE20 independent
open/closed/Не менять контракт сохраняется; новых vendor write не добавлять.

Скриншот показывает полный обход 3189 файлов, 5 замечаний и один blocker
incomplete_log; прежний журнал был принят до введения строгого XML EOF gate.
Сырые логи на этом ПК недоступны, точная структура проблемного EOF не проверена.

## Требования

- Удалить bulk HTTP/Telnet checkbox и не относящиеся к действиям port counters.
- Запретить disable_insecure_management_services в новых launch/resume любого
  schema, не переписывая прежние отчёты. Не открывать/возвращать порты автоматически.
- Все write selectors по умолчанию Не менять; таблица/её значения не создают tasks.
  Только Answer mode → только Answer commands, без port configuration writes.
- Известный Huawei LogModule, полностью прочитанный построчно, но без штатного
  XML EOF, может быть разобран как sourceCompleteness=fragment, с явным warning.
  Распознавать только прежние строгие event lines, не дописывать теги/не чинить файл.
  Read failure/неизвестный формат остаются неизвестными, не успешным нулём событий.
- Сохранять положительные наблюдения с sourceFragment, не доказывать по одному
  фрагменту отсутствие выключений в offhours. Счётчики/negative cohort учитывают
  качество; зарегистрированная команда не доказывает аварийное снятие напряжения.
- Публикация завершённого безопасного результата атомарна, warnings не блокируют
  все исправные логи. Готовые current-rule checkpoints совместимы и не перечитываются
  целиком. Прежнюю БД/источники/исторические JSON не удалять и не переписывать.

## Проверки

UI defaults/network spy after XLSX, Answer-only all contracts no port tasks;
retired bulk via API/legacy recovery rejected before ping, independent TE20
unchanged. Fragment/complete marker parity, hashes/checkpoints, warnings/negative
coverage, malformed format/read failures, real Python/SQLite/browser full recheck
with unchanged unterminated source and restored ready files.
