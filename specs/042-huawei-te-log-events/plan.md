# Implementation Plan: Huawei TE log event analytics

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

## Summary

Расширить существующий импорт папки логов потоковым разбором отдельных строк exact Huawei TE20/30/40/50/60 и добавить в модуль перезагрузок самостоятельные области подтверждённых перезагрузок, зафиксированных отключений и низкодостоверных предположений по паузам перед неизвестным запуском. Существующая Extron-аналитика не смешивается с логами Huawei.

## Technical Context

**Language/Version**: Vanilla JavaScript; Node.js только для тестов.
**Primary Dependencies**: Browser File API и существующий локальный каталог/Справочник.
**Storage**: Только память вкладки; исходные файлы остаются в явно выбранной папке.
**Testing**: `node tests.js`, `node scripts/validate-reference.js`; Python регрессия без изменений runtime.
**Target Platform**: Windows browser, direct HTML manual import и Python loopback mode.
**Project Type**: Локальное приложение.
**Performance Goals**: Чтение файла частями с ограниченной памятью на одну строку, без накопления полного XML.
**Constraints**: exact IP/SR identity, не исполнять XML и не распаковывать архивы, никуда не передавать содержимое.
**Scale/Scope**: Неограниченное число файлов, обработка последовательно с отображением прогресса; поддержка точных TE20/30/40/50/60. Для оценки пауз в памяти остаются только числовые timestamp, не строки журналов.

## Constitution Check

До исследования: I–VI PASS при сохранении исходного файла неизменным и отделении доказанных событий от неизвестного. После проектирования: I–VI PASS — события содержат локальное время, источник и правило, неоднозначные IP исключаются, raw содержимое/секреты не сохраняются, Extron правило не изменяется. Отклонений нет.

## Project Structure

```text
specs/042-huawei-te-log-events/   требования, evidence и проверка
app.js                            импорт, потоковый парсер, аналитика и UI
tests.js                          синтетические события и регрессия
product-catalog.js                пользовательская справка
docs/                             решение и журнал
```

**Structure Decision**: Сеансовый индекс событий отдельно от исходного state и от Extron JSON-перезагрузок.

## Complexity Tracking

Нет отклонений от Constitution.
