# Quickstart: Проверка терминологии и Справочника

## Automated

```powershell
node --check app.js
node --check tests.js
node tests.js
node runtime-tests.js
node server-tests.js
```

Expected: category/status dictionaries, reference search, required sections, Russian current-route strings and SR/JSON compatibility tests pass; all prior suites remain green.

## Manual local acceptance

1. Запустить `powershell -ExecutionPolicy Bypass -File .\start.ps1`.
2. Проверить русские подписи навигации, Дашборда, фильтров, списков, карточек, импорта и локального хранилища.
3. Убедиться, что нигде в доступных экранах не показаны `SUCCESS`, `UNSUPPORTED`, `polling`, `snapshot`, `runtime`, `state`, `vault`, `credentials`, `scope` как пользовательские подписи.
4. Открыть «Справочник» и проверить десять разделов.
5. Найти `ping`, `ВКС`, `SR`, `изменения`, `GCPlus`; проверить пустой запрос и запрос без результата.
6. Использовать «О модуле» на Дашборде и в трёх категориях.
7. Проверить подсказки «Нет ответа по сети», «Не опрашивалось», «Устройства с изменениями».
8. Импортировать synthetic XLSX и JSON; убедиться, что классификация и внутренние значения не изменились.

Не использовать реальные инфраструктурные данные или учётные данные. Не выполнять commit, push или deploy.

## Результат проверки 2026-08-10

- `node --check` для `app.js`, `tests.js` и `runtime-tests.js`: PASS.
- Regression/contract/performance: 99/99 PASS.
- Windows DPAPI, защищённое хранилище, каталог и опрос: 9/9 PASS.
- Loopback session, CSRF и зашифрованное хранение: 1/1 PASS.
- Browser acceptance: семь целевых маршрутов, 68 материалов в десяти разделах, пять контрольных запросов, состояние без результатов, контекстная помощь, synthetic XLSX/JSON import, заполненный Главный экран, три подсказки и отсутствие горизонтального переполнения — PASS.
- На доступных маршрутах не обнаружены необработанные `SUCCESS`, `FAILED`, `UNSUPPORTED`, `UNKNOWN`, `NOT_POLLED` и прежние смешанные подписи.
- Raw compatibility: исходные `Video Conference` из SR и `Controller Type: TLP` из JSON не изменяются — PASS.
- `git diff --check` и сигнатурный поиск секретов: PASS. Временные synthetic-файлы и локальное тестовое хранилище удалены.
- Изменения оставлены незакоммиченными; commit, push и deploy не выполнялись.
