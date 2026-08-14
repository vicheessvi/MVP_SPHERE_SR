# Quickstart: проверка feature 010

1. Открыть `index.html` напрямую с диска.
2. Загрузить synthetic/безопасную XLSX с семью утверждёнными типами.
3. Проверить раскрытие «Оборудование», семь дочерних пунктов, active state и counts Dashboard.
4. Выбрать общую папку с run folders и JSON; проверить «Дата и время опроса» и пояснение `lastModified`.
5. Проверить success, ping failure, explicit auth failure, malformed/unmatched и отсутствие подмены auth status.
6. Импортировать две/три версии результата Extron: firmware/controller type создают changes; timestamps/Diagnostics — нет.
7. Импортировать synthetic 10 ВКС, 10 Контроллеров и 10 Скалеров; сверить rule/classification/inventory/table counts и статус «Не опрашивалось» без JSON.
8. Проверить пять Скалеров с неполными/конфликтующими identifiers: все пять остаются в таблице, конфликт отмечен отдельно, точный duplicate не создаёт второе устройство.
9. Перезагрузить страницу: импортированные данные должны исчезнуть.
10. Проверить current-IP matching: historical IP не принимает новый JSON; конфликт внутреннего IP или типа оборудования остаётся отдельной ошибкой данных.
11. Выполнить проверки:

```powershell
node tests.js
node runtime-tests.js
node server-tests.js
node scripts/validate-reference.js
node benchmarks/sr-import-performance.js 1000 optimized
node benchmarks/sr-import-performance.js 5000 optimized
node benchmarks/sr-import-performance.js 10000 optimized
node benchmarks/sr-import-performance.js 25000 optimized
```

При отсутствии `node` в PATH использовать bundled Node из Codex runtime.
