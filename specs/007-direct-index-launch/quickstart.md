# Quickstart: Проверка прямого index.html

## Automated

```powershell
node --check runtime-config.js
node --check app.js
node scripts\validate-reference.js
node tests.js
node runtime-tests.js
node server-tests.js
```

Ожидается: все наборы PASS; статические проверки подтверждают file marker, memory-only adapter, отсутствие трёх уведомлений, credential fail-closed и прежний secure server contract.

## Direct-open acceptance

1. Закрыть локальный server runtime.
2. Открыть корневой `index.html` через `file://`.
3. Убедиться, что главный экран отображается без установки Node.js и без трёх удалённых уведомлений.
4. Проверить семь пунктов навигации и открыть «Справочник».
5. Импортировать только синтетическую SR/JSON fixture без рабочих IP и секретов.
6. Убедиться, что данные видны в текущем сеансе.
7. Перезагрузить страницу и убедиться, что импортированные данные исчезли.
8. Убедиться, что импорт файла логинов/паролей в файловом режиме недоступен.

## Secure-mode regression

1. Запустить `powershell.exe -ExecutionPolicy Bypass -File .\start.ps1`.
2. Убедиться, что UI открывается без удалённых уведомлений.
3. Проверить persistent encrypted state и credential summary/import через существующий server test.
4. Подтвердить, что `/runtime-config.js` выдаёт secure marker и CSRF token.

## Safety

- Не использовать рабочие SR, IP или учётные данные при browser acceptance.
- Не проверять localStorage/cookies через browser automation.
- Commit и push выполнять только по отдельному явному запросу пользователя.

## Результат проверки 2026-08-10

- JavaScript syntax и catalog validation: PASS.
- Regression/contract/performance: 101/101 PASS.
- Runtime/bootstrap/direct-open contracts: 13/13 PASS.
- Secure loopback server integration: 1/1 PASS.
- Secret signature и runtime artifact scans: PASS.
- Автоматическая навигация на `file://` отклонена политикой browser-control; запрещённые обходы не применялись. Визуальный direct-open остаётся единственным ручным пунктом: двойной щелчок по `index.html`, проверка главного экрана и семи модулей.
