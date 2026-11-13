# План реализации: настройки Huawei CloudLink 300

**Branch**: `codex/secure-local-runtime`
**Date**: 2026-11-13
**Spec**: [spec.md](spec.md)

## Summary

Использовать общий guarded read-only CGI reader для exact Bar 300, Box 300 и Box 600, сохраняя отдельные pre/post-auth model/identity gates, индивидуальные contract ID и безопасный импорт. После подтверждения администратором совпадения с меню новые поля обеих Box имеют `confirmed_user_validation`; исторические provisional-файлы не переписываются.

## Technical Context

- Python 3.11+ stdlib runtime: `mvp_runtime/adapters/huawei_300.py`.
- HTML/Vanilla JS projection: `app.js`; тесты: `python_tests/test_huawei_300.py`, `tests.js`.
- Runtime, credentials, Site name и модели вне exact Bar 300/Box 300/Box 600 не менять.

## Constitution Check

- Исходный JSON/ресурсы не изменяются, источник факта фиксируется.
- Нет внешней передачи, новых зависимостей и write-запросов.
- Точная модель и идентичность предшествуют каждому новому чтению.
- Неизвестное значение не становится «выключено».
- Bar 300 проверен на подключённом устройстве; администратор отдельно подтвердил совпадение новых значений Box 300/600 с меню. Строгие модельные и bundle-проверки сохраняются, новые подтверждения не переносятся на другие варианты моделей.
