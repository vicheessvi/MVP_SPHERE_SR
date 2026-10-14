# Implementation Plan: Аналитические таблицы опросов

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

## Summary

Развить существующие производные индексы в `app.js`, добавить раскрываемые таблицы и подключить три существующих маршрута к проверенным данным истории опросов. Никаких новых сетевых запросов или постоянного хранилища.

## Technical Context

**Language/Version**: Vanilla JavaScript в браузере; Node.js только для тестов.
**Primary Dependencies**: Только существующие `app.js`, `product-catalog.js`, `styles.css`.
**Storage**: Память текущей вкладки.
**Testing**: `node tests.js`, `node scripts/validate-reference.js`, синтаксис JS.
**Target Platform**: Windows, прямой `index.html` и Python loopback режим.
**Project Type**: Локальное браузерное приложение.
**Performance Goals**: Сохранить бюджет 2 секунды на 5 000 устройств и 25 000 опросов.
**Constraints**: Не менять raw JSON/SR и не выводить секреты; исключать неоднозначное сопоставление.
**Scale/Scope**: Один экран перезагрузок и три ранее созданных аналитических модуля.

## Constitution Check

**До исследования**: I–V соблюдаются при производных, объяснимых строках с исходным результатом; VI — локальная память без новых передач. Неполные данные исключаются, а идентичность устройства проверяется до группировки.
**После проектирования**: События, версии и ошибки отделены; ссылки на исходные результаты сохранены; новые источники или протоколы не добавлены. Временное исключение: действующая constitution описывает старую XLSX-схему credentials, ранее заменённую по запросу пользователя; эта feature секреты не обрабатывает.

## Project Structure

```text
app.js                 # selectors, grouped rows, table renderers and click state
product-catalog.js     # module help entries
styles.css             # clickable cards and responsive detail tables
tests.js               # synthetic history and grouping checks
specs/027-analytics-drilldowns/  # current design
docs/implementation-log.md
```

**Structure Decision**: Расширить существующий модуль, не создавать отдельное хранилище и не менять Python adapters.

## Complexity Tracking

Новых нарушений constitution нет.
