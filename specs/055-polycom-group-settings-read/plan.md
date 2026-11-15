# Implementation Plan: Новые настройки Polycom Group

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary

Расширить существующий read-only HTTPS core для четырёх exact Group моделей узкими запросами лишь к настройкам, чьи имена и схема доказаны на подключённом Group 310. Текущие pre-auth bundle gate, post-auth exact model + serial/MAC, session/logout и запрет HTTP fallback сохраняются. Каждая настройка обрабатывается независимо; неизвестный код или несовпадение текущего bundle не становится фактом. `app.js` принимает новые поля только от соответствующего exact adapter/model и подтверждённых источников; существующий XLSX-аудит получает безопасное представление сложных значений.

## Technical Context

- **Language/Version**: Python 3.11+ standard library для production; Vanilla JavaScript для локального интерфейса.
- **Primary Dependencies**: Только существующая stdlib, vendored SheetJS для уже существующего XLSX-экспорта.
- **Storage**: Память текущей сессии; готовый JSON только в папке, явно выбранной пользователем.
- **Testing**: `python -m unittest discover -s python_tests`, `node tests.js`, `node scripts/validate-reference.js`.
- **Target Platform**: Windows, HTTPS/443 к явно выбранному IP, loopback Python runtime или прямой HTML для ручного импорта.
- **Project Type**: Локальное browser-приложение с Python runtime.
- **Performance Goals**: Не выполнять широкое чтение конфигурации; не более одного узкого запроса на каждый доказанный ключ в успешном опросе.
- **Constraints**: Без write, HTTP/SSH/Telnet fallback, секретов в JSON/state/diagnostics или новых зависимостей; успешная проверка Group 300 не снимает ограничение старой несовместимой HTTPS-прошивки.
- **Scale/Scope**: Четыре exact модели, девять групп настроек, существующие JSON и XLSX-факты.

## Constitution Check

До исследования: PASS. Сохраняются исходные файлы и model/identity gate, неизвестное не трактуется как отключено, каждый факт имеет источник, секреты исключены. После проектирования: PASS при условии, что только whitelisted имена конфигурации отправляются после post-auth identity gate, каждый ответ проверяется отдельно и соседние поля не включаются в результат. Нарушений, требующих Complexity Tracking, нет.

## Project Structure

```text
mvp_runtime/adapters/polycom_group.py       # общий guarded read-only core и точные wrappers
python_tests/test_polycom_group.py          # contract, drift, partial error, no-secret tests
app.js                                     # строгая проекция и формат фактов
tests.js                                   # импорт, точная модель, отчёт, отрицательные тесты
product-catalog.js                         # Справочник
docs/context-map.md                        # маршрут feature
docs/decisions/ADR-0058-polycom-group-settings-read.md
specs/055-polycom-group-settings-read/
```

## Complexity Tracking

Нарушений constitution нет. Общий reader использует существующий guarded adapter; отдельные exact model wrappers и статусы остаются раздельными.
