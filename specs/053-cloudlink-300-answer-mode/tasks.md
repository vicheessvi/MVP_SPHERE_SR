# Tasks: Answer mode CloudLink 300

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [contracts/answer-mode.md](contracts/answer-mode.md)

## Phase 1: Setup

- [x] T001 Зафиксировать read-only кодировку Bar 300 и маркеры web-формы в `specs/053-cloudlink-300-answer-mode/research.md`.

## Phase 2: Foundational

- [x] T002 Проверить существующие Answer mode gates и точное текущее состояние Bar 300 в `app.js`, `mvp_runtime/polling.py`, `mvp_runtime/adapters/huawei_300.py` и `specs/053-cloudlink-300-answer-mode/research.md`.
- [x] T003 После отдельного согласия проверить одну минимальную запись Bar 300 «Авто → Вручную» и точный post-read, без автоматического повтора; evidence зафиксировать в `specs/053-cloudlink-300-answer-mode/research.md`.
- [x] T004 После отдельного согласия проверить возврат Bar 300 «Вручную → Авто» и восстановление исходного состояния; evidence зафиксировать в `specs/053-cloudlink-300-answer-mode/research.md`.

## Phase 3: User Story 1 — Один IP (P1)

**Independent Test**: Exact Bar 300 после model/identity/bundle gates выполняет pre-read, 0–1 write, post-read; чужая модель/неясный ответ не дают записи или ложного успеха.

- [x] T005 [US1] Добавить синтетические success/already-compliant/unknown-code/drift/timeout/redaction тесты в `python_tests/test_huawei_300.py` до production write.
- [x] T006 [US1] Добавить отдельный минимальный Answer mode action в `mvp_runtime/adapters/huawei_300.py`, не меняя обычный read-only опрос.
- [x] T007 [US1] Зарегистрировать два action ID для exact трёх моделей в `runtime/device-catalog.json` и проверить resolver/один IP в `python_tests/test_catalog.py`, `python_tests/test_polling.py`.

## Phase 4: User Story 2 — Совместимая группа (P2)

**Independent Test**: Фильтры SR выбирают только точные совместимые модели, UI показывает число целей и требует согласие; смешанная группа блокируется до сети.

- [x] T008 [US2] Добавить тесты группы, mixed target, digest, конфликтующих задач и одного action в `tests.js`, `python_tests/test_polling.py`.
- [x] T009 [US2] Встроить выбор серии 300 рядом с существующим Answer mode в `app.js`, включая состояние, план, форму, подтверждение и число целей.
- [x] T010 [US2] Подключить новые action IDs к runtime-проверке плана в `mvp_runtime/polling.py`; Box 300/600 оставить provisional до отдельного live write-теста.

## Phase 5: Polish

- [x] T011 Обновить `AGENTS.md`, `docs/context-map.md`, `docs/implementation-log.md`, `docs/decisions/ADR-0056-cloudlink-300-answer-mode.md` и `product-catalog.js`.
- [x] T012 Выполнить полные Python/JS/reference/syntax/security проверки для изменённых файлов и контроль launcher через `python_tests/test_launcher.py` без реальной записи.

## Dependencies

T001–T002 → T003–T004 → T005–T007 → T008–T010 → T011–T012. Box write остаётся предварительным до отдельных эксплуатационных тестов; их отсутствие не расширяет Bar-результат.

## Parallel opportunities

Исследование существующего UI/плана и read-only vendor bundle возможно параллельно; сетевые write-тесты и правки общего адаптера выполнять последовательно.

## MVP

US1 — безопасное изменение одного exact Bar 300 после контролируемого цикла; US2 дополняет существующим массовым выбором совместимых устройств.
