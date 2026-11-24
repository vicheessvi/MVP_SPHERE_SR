# Validation

1. XLSX два валидных листа и один вспомогательный. До выбора targets=0; выбрать
   второй → только его IP; выбрать первый+второй → ровно объединение; дубли reject.
2. JSON/log/write матрица и capture requests подтверждают отсутствие лишних действий.
3. Поменять source/file/sheets → старый preview и действия не запускаются.
4. V4 mutation rejected before network; job copy не меняется после старта.
5. Write-only пишет только видимый recovery journal, штатный JSON не создаётся.
6. Resume использует исходные sheets/source/actions и не повторяет ambiguous write.

Проверено 2026-11-24: Python 267/267, JS 258/258, справочник/syntax; настоящий
loopback API + браузер + временная SQLite/fake adapter, desktop/mobile. Дополнительно
пройдены импорт 3192 синтетических логов/публикация SR/JSON и DB-first фильтры на
5000 устройствах без изменения БД. XLSX Artifact Tool roundtrip подтвердил выбор
только второго листа из трёх. Реальных сетевых действий с устройствами не было.

Команды разработчика: `python -m unittest discover -s python_tests -q`,
`node tests.js`, `node scripts/validate-reference.js`,
`python scripts/check-explicit-plan-ui.py` (bundled Playwright через
`SPHERE_PLAYWRIGHT_MODULE`; установленный Chrome, только временные данные).
