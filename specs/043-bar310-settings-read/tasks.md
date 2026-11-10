# Tasks: Фактические настройки Huawei CloudLink Bar 310

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/read-only-settings.md](contracts/read-only-settings.md)

## Phase 1: Setup

- [x] T001 Зафиксировать только подтверждённые bundle/read-form и модельные коды в specs/043-bar310-settings-read/research.md

## Phase 2: Foundation

- [x] T002 Добавить точные Bar 310 read markers и строгую проверку схемы в mvp_runtime/adapters/huawei_bar310.py

## Phase 3: User Story 1 — фактический снимок

**Independent Test**: Синтетические ответы дают правильные значения всех подтверждённых полей; реальный Bar 310 возвращает те же коды без сырых секретов.

- [x] T003 [US1] Добавить ограниченное чтение Site name через config fallback в mvp_runtime/adapters/huawei_bar310.py
- [x] T004 [US1] Добавить read-only чтение автоответа, NTP, Wi‑Fi, SSH и подтверждённых полей питания в mvp_runtime/adapters/huawei_bar310.py
- [x] T005 [US1] Разрешить только exact Bar 310 источники новых полей при импорте JSON в app.js
- [x] T006 [US1] Покрыть значения, частичные ответы и безопасную сериализацию тестами в python_tests/test_huawei_bar310.py и tests.js

## Phase 4: User Story 2 — безопасная модельная граница

**Independent Test**: Неверная модель/другая схема не отправляет новые запросы, а обычный опрос не делает write.

- [x] T007 [US2] Проверить exact model/identity gates, отсутствие переноса на Box и отсутствие write в python_tests/test_huawei_bar310.py
- [x] T008 [US2] Проверить исключение секретов и сохранение `protocol_required`/`unavailable` при drift в python_tests/test_huawei_bar310.py и tests.js

## Phase 5: Polish

- [x] T009 Обновить contract, README, product-catalog.js, docs/context-map.md, docs/decisions и docs/implementation-log.md
- [x] T010 Выполнить Python/JavaScript тесты, проверку Справочника и локальный read-only acceptance на Bar 310
- [x] T011 По скриншоту администратора уточнить отсутствие отдельных расписания включения/выключения и очистки после перезагрузки на текущем экране в specs/043-bar310-settings-read/research.md; не подменять их autoReboot

## Dependencies & Execution Order

T001 → T002 → T003/T004 → T005/T006 → T007/T008 → T009/T010. T011 независима от чтения подтверждённых полей, но обязательна для заявления о полноте параметров питания.

## Implementation Strategy

Сначала точное чтение и отрицательные тесты для Bar 310; затем сквозная проверка JSON и справки. Box-модели остаются вне нового контракта.
