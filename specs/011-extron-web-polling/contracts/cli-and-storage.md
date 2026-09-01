# Contract: CLI и локальное хранение

## Command

```powershell
.\poll-extron.ps1 -Plan .\polling-plan.json [-Credentials C:\private\credentials.xlsx] [-Output C:\local\results] [-AllowInsecureTls]
```

Эквивалентный Node CLI:

```text
node scripts/poll-devices.js --plan <plan.json> [--credentials <xlsx|xls|json|csv>] [--out <directory>] [--timeout <ms>] [--allow-insecure-tls]
```

## Default output

Если `--out` не указан:

```text
%LOCALAPPDATA%\MVP_SPHERE_SR\poll-results\YYYY-MM-DD_HH-mm-ss\<IP>.json
```

Явный `--out` обозначает root, внутри которого CLI также создаёт capture folder, если не задан `--exact-output-directory` для обратной совместимости.

## Stdout

Одна JSON summary: output directory, total/completed/failed counts и безопасные категории ошибок. Secrets, cookies, headers и device payloads отсутствуют.

## Exit behavior

- Невалидный plan/vault/output root: non-zero, до сетевого опроса.
- Ошибка отдельного устройства: итоговый JSON сохраняется, batch продолжается.
- Partial device failures дают summary с failed count; процесс завершает batch предсказуемо.

## Import compatibility

Пользователь вручную выбирает capture folder или общий `poll-results` в существующем folder input `index.html`. Ручная загрузка любых ранее подготовленных JSON/папок остаётся доступна.

## Excel credentials

Читается первая таблица. Основные заголовки: `Тип устройства`, `Производитель`, `Логин`, `Пароль`; необязательные уточнения — `Модель` и `IP`. Также принимаются английские aliases. Формулы не вычисляются. После проверки записи импортируются в DPAPI vault; workbook не копируется в проект или output. Выбор: `IP` → `тип+производитель+модель` → `тип+производитель`.
