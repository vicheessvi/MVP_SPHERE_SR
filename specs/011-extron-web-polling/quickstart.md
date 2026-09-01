# Quickstart: Опрос Extron и загрузка результатов

1. Подготовить plan JSON только с разрешёнными IP Extron controller/panel.
2. Подготовить и хранить вне репозитория Excel-файл с первой таблицей и колонками `Тип устройства`, `Производитель`, `Логин`, `Пароль`. `Модель` или `IP` добавляются только для исключений из общего правила.
3. Запустить PowerShell entry point:

```powershell
.\poll-extron.ps1 -Plan "C:\local\polling-plan.json" -Credentials "C:\private\credentials.xlsx" -AllowInsecureTls
```

4. Найти созданную папку, путь которой напечатан в summary. По умолчанию:

```text
%LOCALAPPDATA%\MVP_SPHERE_SR\poll-results\YYYY-MM-DD_HH-mm-ss
```

5. Открыть `index.html`, перейти в «Загрузка» и выбрать созданную папку либо общий каталог `poll-results`.
6. При необходимости вместо автоматического опроса продолжать загружать готовые файлы и папки вручную — этот способ не меняется.

## Проверка безопасности

- Не помещать plan с реальными IP и credential-файл в Git.
- После запуска убедиться, что JSON не содержит password, Authorization или cookie.
- Не переносить DPAPI vault между пользователями/ПК; на другом ПК credentials импортируются заново из безопасного источника.
- `-AllowInsecureTls` использовать только для явно перечисленного локального оборудования с self-signed certificate.
