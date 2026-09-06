# Tasks: Закрытие HTTP и Telnet на Huawei TE40

## Phase 1: Specify and evidence

- [x] T001 Создать feature 019 и зафиксировать ограничения opt-in write workflow
- [x] T002 Проверить real-device bundle, exact action IDs, поля и значения

## Phase 2: Contract and tests

- [x] T003 Добавить catalog/action capability tests exact TE40-only
- [x] T004 Добавить synthetic tests no-opt-in, applied, idempotent, verification failure и redaction
- [x] T005 Добавить plan v3/server rejection tests

## Phase 3: Implementation

- [x] T006 Добавить checkbox, счётчики, confirmation и Справочник
- [x] T007 Добавить plan v3 и runtime routing с explicit skipped outcome
- [x] T008 Добавить bounded TE40 read/write/re-read/TCP verification

## Phase 4: Controlled validation

- [x] T009 Подтвердить login, model, firmware settings, save envelope и TCP/23/443 на реальном TE40
- [ ] T010 Получить подтверждённый способ фактически закрыть TCP/80 на тестовом firmware; текущий `enable_http=1` оставляет listener доступным

## Phase 5: Final validation

- [x] T011 Выполнить полную regression/reference/syntax/secret scan и зафиксировать feature как fail-closed partial до решения T010
- [x] T012 Отделить источник целей write-задачи от основной SR: отдельный атомарно проверяемый XLSX только в памяти
