# Implementation Plan: Аналитика журналов CloudLink 300

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-15 | **Spec**: [spec.md](spec.md)

## Summary

Отдельный потоковый разбор XML-журналов exact Bar 300/Box 300/Box 600 и подключение безопасных событий к существующим подмодулям. Проверенный на живом Bar 300 `LOG_MOD_MC/System boot` означает запуск; общие `reboot` и `restart` не доказывают перезагрузку. Отдельный контролируемый цикл подтвердил `LOG_MOD_WEB` web-команду штатного выключения и следующий запуск. Пауза от 60 минут перед неизвестным запуском — только низкодостоверное предположение. Администратор отдельно подтвердил анализ Box 300/600, поэтому новые события обеих моделей включены в сводные диаграммы с собственными model gates и rule versions.

## Technical Context

- **Language/Version**: Vanilla JavaScript; Python 3.11+ stdlib только для существующего экспорта.
- **Dependencies**: Нет новых внешних библиотек.
- **Storage**: Только память вкладки; исходные файлы в выбранной папке.
- **Testing**: `node tests.js`, `python -m unittest discover -s python_tests`.
- **Target Platform**: Windows browser, direct HTML или loopback Python runtime.
- **Performance**: Потоковый разбор по 64 КиБ, строки до 8192 символов; живой журнал около 41 МБ.
- **Constraints**: Нет сырых строк/секретов в state; exact SR IP/model и XML gates; никакого write.
- **Scope**: Три exact модели, два существующих подмодуля, импорт, тесты и справочник.

## Constitution Check

До исследования и после проектирования: PASS. Файлы не меняются; события ссылаются на путь/номер строки; сопоставление использует уникальный IP в актуальной SR плюс exact модель; неоднозначное исключается; неизвестное не считается подтверждённой перезагрузкой; правило версионируется; секреты не сохраняются. Администратор отдельно подтвердил Box 300 и Box 600; новые события входят в диаграммы, исторические результаты не переписываются.

## Project Structure

```text
runtime/huawei-300-log-events.js  # отдельный потоковый парсер
app.js                            # импорт, индекс, selectors, визуальные разделы
index.html                        # загрузка парсера
mvp_runtime/server.py             # локальная статическая выдача
tests.js                          # синтетические сценарии
product-catalog.js                # Справочник
docs/context-map.md              # маршрут feature
docs/decisions/ADR-0057-cloudlink-300-log-analytics.md
specs/054-cloudlink-300-log-analytics/
```

## Complexity Tracking

Нарушений constitution нет. Отдельный парсер необходим, потому что доказанные маркеры TE и CloudLink 310 не применимы к серии 300.
