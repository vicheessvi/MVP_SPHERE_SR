# Проверка

1. В разделе 4 выбрать актуальную SR либо отдельный XLSX (нужные листы явно).
2. Выбрать один или несколько существующих Answer mode переключателей разных
   контрактов. У остальных групп «Не менять». Для Polycom поля независимы.
3. При необходимости отдельно отметить JSON/логи и выбрать папки. Без них —
   только service journal, для No-change устройств нет подключения.
4. Проверить столбец «Действия плана» и confirm с количеством по каждому контракту.
   Один запуск последовательно обрабатывает mixed targets, только их actions.
5. При сбое продолжать исходный snapshot; неизвестные writes не повторяются.

Разработчик: `python -m unittest discover -s python_tests -q`, `node tests.js`,
`node scripts/validate-reference.js`, `python scripts/check-explicit-plan-ui.py --mixed`
(bundled Playwright, Chrome, temporary profiles/SQLite/fake adapters only).
