# План реализации: настройки Huawei CloudLink 300

**Branch**: `codex/secure-local-runtime`
**Date**: 2026-11-13
**Spec**: [spec.md](spec.md)

## Summary

Использовать общий guarded read-only CGI reader для exact Bar 300, Box 300 и Box 600, сохраняя отдельные pre/post-auth model/identity gates, индивидуальные contract ID и безопасный импорт. Новые поля Box маркировать предварительными до проверки каждого устройства.

## Technical Context

- Python 3.11+ stdlib runtime: `mvp_runtime/adapters/huawei_300.py`.
- HTML/Vanilla JS projection: `app.js`; тесты: `python_tests/test_huawei_300.py`, `tests.js`.
- Runtime, credentials, Site name и модели вне exact Bar 300/Box 300/Box 600 не менять.

## Constitution Check

- Исходный JSON/ресурсы не изменяются, источник факта фиксируется.
- Нет внешней передачи, новых зависимостей и write-запросов.
- Точная модель и идентичность предшествуют каждому новому чтению.
- Неизвестное значение не становится «выключено».
- Bar 300 проверен на подключённом устройстве; Box 300/600 опираются на подтверждение администратора об аналогичных меню и на строгие маркеры bundle каждого запуска. Это предварительный контракт без заявления об эксплуатационной проверке новых полей.
