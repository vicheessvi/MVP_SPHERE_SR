# ADR-0069 — несколько Answer mode контрактов в одном плане

Дата: 2026-11-24. Статус: принято по явному одобрению администратора.

## Контекст и граница изменения

Администратор запросил единый запуск смешанного списка. Существующий global
managementTasks применялся ко всем целям, поэтому ADR-0049/0056/0060 запрещали
несколько action IDs в одном плане. Подтверждённые vendor-контракты не мешают
последовательной обработке разных групп, но их параметры/кодировки нельзя смешивать.
Пользователь одобрил per-device routing только для Answer mode. HTTP/NTP/SSH/
питание и другие writes не объединяются с ним.

## Решение

Новая форма с Answer mode создаёт schemaVersion=5, managementRouting=per_device_answer.
Root managementTasks — явный выбор до одного направления каждой группы. В каждом
devices[].managementTasks обязательно [] либо [единственный выбранный ID его
exact семейства]. Polycom nullable поля остаются общими для его группы, передаются
только его целям. Root selectedActions соответствует collect flags и root IDs.
Source digest/sheets/membership, IP uniqueness и каталог проверяются до сети и
handoff credentials. Wrong/missing/extra binding, неизвестный контракт, два
направления одной группы и другие management actions блокируют весь план.

«Не менять» означает отсутствие write, не фактическое значение параметра. Если
JSON/logs тоже не выбраны, строка возвращает notRequested=true без ping/login/read/
write/интервала и не увеличивает successful. JSON/logs остаются отдельными явно
выбранными действиями всех целей. Интервалы считаются только между реальными
обращениями. Новый UI блокирует write-only план без назначенных изменений.

Перед запуском видны назначения <=100 строк и общий confirm: source/sheets,
семейства, целевые значения, число устройств и no-action count. Работающий job
глубоко копирует план. Recovery сохраняет исходный root выбор и bindings даже
после завершения части семейства; outcomes принимают только action данного
индекса. Неясный write не повторяется автоматически, No-change не попадает в
write-review. Service journal остаётся видимым, обычный JSON создаётся только по
выбору. Noop не доказывает исправность/настройку устройства.

## Совместимость и безопасность

Планы v3/v4 не обновляются до mixed автоматически и сохраняют single-action
guard; новый routing требует v5. Vendor adapters/кодировки не менялись, остаются
exact model/identity/bundle/TLS gates и максимум один pre-read/one-write/post-read
контракт на устройство. Неясный исход не повторяет запись. Credentials — только
память job; данных аналитики, схемы SQLite, raw файлов и исторических JSON эта
доработка не меняет. Общая mixed группа допускается только из известных Answer
моделей. Исходные колонки XLSX не становятся командами.

## Проверка

Матрица всех 15 моделей/обоих направлений, wrong bindings до ping, No-change без
credentials/network/интервалов, JSON/logs без лишних writes, job freeze и scoped
recovery. Real Python/SQLite/browser с fake adapters: root 5 контрактов/15 целей,
forged API binding reject, 1 write + 14 noops и отдельный сбор 15 JSON/15 логов.
Новых реальных vendor-запросов/записей в рамках разработки не выполнялось.
