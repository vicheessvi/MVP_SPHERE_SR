# Plan

## Design

Переиспользовать vendored SheetJS и parseManagementTargetRows. Wrapper для XLSX
сначала возвращает sheetNames/needsSheetSelection, затем принимает явные
selectedSheets, валидирует каждый и объединяет совместимые заголовки/строки.
Дубли IP блокируют весь выбранный список. Эфемерный workbook/список в текущей
вкладке, без сохранения raw XLSX/credentials. Основной inventory не меняется.

derive/create/export плана получают явный targetSource=device_list и snapshot
выбранных targets/листов/действий. Текущий UI использует explicitActions/v4,
legacy API v3 остаётся совместимым. Python validate_plan_actions проверяет
строгую матрицу, source membership и каталог до любого ping/adapter вызова.
Обычный run/recovery job использует deep-copy неизменяемый план.

Передать collect_json во все guarded adapters. При false читаются только
существующие identity ресурсы, при необходимости выбранные management поля
и/или экспорт логов; Site name/обычные настройки/полный resource poll пропускаются.
Ответ без JSON — безопасный служебный результат для ACK/journal, не файл опроса.
Для write-only используется папка журнала, для logs-only — папка логов.

## Constitution Check до/после design

PASS: пользователь явно разрешил загрузку отдельного списка и выбранных операций,
не расширяя vendor-контракты. Пароли только память, admin/Origin/CSRF/allowlist
сохраняются; per-device model/pre-read/one-write/post-read не ослабляется.
Single-IP TE20 параметры остаются single-target, Answer Mode только совместимая
группа одного action ID. Сырые таблицы в БД/план/журнал не копируются, данные
вне scope не выбираются. DB-first история и аналитика не изменяются.

## Validation sequence

Tests first: sheets/selection/plan → shared Python validator → минимальные
adapter collection branches → job/recovery/output folder → UI/preview →
request-spy matrix/headless import → regressions/documentation.
