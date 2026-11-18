# Implementation Plan: ВКС «Учёт» и эксплуатационные события

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

## Summary

Построить отдельный срез текущих VCS-устройств со статусом оборудования «Учёт» поверх уже проверенных индексов логов Huawei TE/310/300. Сохранить три отдельных типа: подтверждённая перезагрузка, подтверждённое штатное выключение и предполагаемая пауза. Использовать общие фильтры модуля с добавлением домена и VIP, два кликабельных кольца, 7×24 карту с переключением типа события, топы и два локальных XLSX-списка. Polycom TGZ остаётся без событийного вывода.

## Technical Context

- **Language/Version**: Vanilla JavaScript; Node.js только regression; Python runtime не меняется.
- **Dependencies**: текущая SR normalization, `getHuaweiTeLogAnalytics`, cache модуля, vendored SheetJS CE.
- **Storage**: только существующая рабочая база/память; новый исходный файл или скрытое хранилище не создаётся.
- **Testing**: `node tests.js`, `node scripts/validate-reference.js`, Python regression для сохранения прежней функции.
- **Target Platform**: Windows Chromium и прямой `index.html` ручной режим.
- **Performance Goals**: фильтр 5 000 устройств/100 000 событий <2 с на синтетике, без нового чтения логов.
- **Constraints**: exact текущая SR, модельные правила событий не меняются, 100% кольца — уникальные VCS «Учёт» выбранной области; событие питания не равно текущему состоянию питания.
- **Scale/Scope**: один дополнительный аналитический срез внутри существующего модуля, два XLSX по текущим фильтрам.

## Constitution Check

- I–V PASS: только существующие подтверждённые события с ruleVersion/source; предполагаемые паузы имеют отдельную категорию и низкую достоверность; неоднозначные и stale результаты исключаются.
- VI PASS: XLSX строится локально, текст из SR принудительно остаётся текстом; никаких credentials/raw строк логов или внешней передачи.
- Post-design PASS: denominator по текущему SR, данные событий не переписываются, при смене фильтра cache инвалидируется.

## Project Structure

```text
specs/059-accounted-vcs-reliability/    spec, plan, contracts, tasks
app.js                                  SR-срез, агрегация, фильтры, UI и XLSX
styles.css                              доступные кликабельные кольца/карта
tests.js                                синтетические event/filter/XLSX tests
product-catalog.js, docs/              справка и решение
```

## Phase 0 — Research

См. [research.md](research.md): оба заголовка SR уже нормализуются в `equipmentOverallStatus`; четыре Huawei индекса уже фильтруются по периоду/модели/локации/адресу и исключают stale SR. Polycom TGZ только metadata. Existing SheetJS exporter Site name использует текстовые ячейки и фильтр Excel; его локальный паттерн можно переиспользовать.

## Phase 1 — Design & Contracts

[data-model.md](data-model.md), [contracts/accounted-vcs.md](contracts/accounted-vcs.md), [quickstart.md](quickstart.md). Новый срез не смешивается с общей оценкой Extron `Date−Uptime`; кликабельные элементы передают вид/тип/устройство в одну детальную таблицу. Экспорт получает ровно отображённую выборку, но без ограничения 100 строк экрана.

## Implementation

Тесты селектора/фильтров/формульной защиты до кода; затем чистый агрегатор, расширение фильтров, интерактивная визуализация, экспорт и документация. Полная регрессия и стресс-тест. Не менять имеющийся контракт импорта логов или модельные парсеры.
