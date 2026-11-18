# Tasks: ВКС «Учёт» и события

**Input**: [spec.md](spec.md), [plan.md](plan.md), [contracts/accounted-vcs.md](contracts/accounted-vcs.md)

## Phase 1 — Setup

- [x] T001 Зафиксировать семантику «Учёт», события и XLSX в `specs/059-accounted-vcs-reliability/`.

## Phase 2 — Foundational tests

- [x] T002 Добавить синтетические SR/event тесты знаменателя, пересечения и достоверности в `tests.js` до селектора.
- [x] T003 Добавить XLSX тесты строк, фильтров и формульной защиты в `tests.js` до экспортера.

## Phase 3 — US1: сравнение «Учёт» и событий (P1)

- [x] T004 [US1] Реализовать чистый селектор текущих VCS «Учёт» и три отдельных вида событий в `app.js`.
- [x] T005 [US1] Добавить домен и VIP к общим фильтрам и всем логовым срезам в `app.js`.

## Phase 4 — US2: кликабельная аналитика (P2)

- [x] T006 [US2] Добавить два кольца, топы, кликабельные сегменты и таблицу в `app.js`, `styles.css`.
- [x] T007 [US2] Добавить 7×24 тепловую карту с переключением reboot/power confirmed/suspected и детализацией в `app.js`, `styles.css`.
- [x] T008 [US2] Проверить фильтры/клик/период на 5 000 устройств и 100 000 событий в `tests.js`.

## Phase 5 — US3: два локальных XLSX (P2)

- [x] T009 [US3] Реализовать два экспортера по текущей выборке в `app.js` через vendored SheetJS CE.
- [x] T010 [US3] Подключить кнопки скачивания в `app.js`, проверить типы ячеек, фильтр и отсутствие формул в `tests.js`.

## Phase 6 — Polish

- [x] T011 Обновить `AGENTS.md`, `docs/context-map.md`, `docs/implementation-log.md`, `docs/decisions/ADR-0062-accounted-vcs-events.md`, `product-catalog.js`.
- [x] T012 Выполнить полный Python/JS/reference/syntax/secret suite и синтетический стресс, не делать commit/push без отдельного запроса.

## Dependencies

T001–T003 → T004–T005 → T006–T008 → T009–T010 → T011–T012. Событийные parser rules и импорт логов не меняются.

## MVP

US1 показывает достоверный SR-срез и числа; US2 и US3 добавляют исследование и выгрузку.
