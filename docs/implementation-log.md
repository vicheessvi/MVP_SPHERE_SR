# Implementation Log

Этот журнал фиксирует только значимые изменения проекта.

## 2026-09-01 — Запуск двойным щелчком в Windows

- В корень проекта добавлен переносимый `START_MVP_SPHERE_SR.cmd`, поэтому пользователю больше не требуется вводить команду PowerShell.
- Launcher сам использует свой каталог, вызывает `start.ps1` с `-NoProfile -ExecutionPolicy Bypass` и сохраняет окно с сообщением открытым при ошибке.
- Защищённый loopback runtime, автоматическое открытие браузера и прямой ручной режим `index.html` не изменены.
- README и runtime regression обновлены под основной способ запуска.

## 2026-08-12 — Feature 010: Оборудование, время опроса и SR performance

- Добавлены родитель «Оборудование» и семь category routes на общем renderer.
- Добавлены SR types: Коммутатор, Матричный коммутатор, Скалер, Аудио процессор.
- Разделены folder run time и per-file `lastModified/unavailable` result time.
- Добавлены evidence-based statuses и selective Extron parameter rules.
- SR import переведён на indexes/batches/progress; 25k benchmark: 128,86 s → 1,87 s.
- Обновлены Dashboard, Справочник, tests, benchmark и ADR-0010.

## 2026-08-12 — Эксплуатационные исправления feature 010

- Убрано отдельное жирное начертание родителя «Оборудование»; initial state изменён на collapsed, toggle больше не блокируется активной дочерней категорией.
- SR-строки без inventory/serial/MAC/IP сохраняются как устройства с fallback identity и предупреждением, что возвращает пассивное AV-оборудование в counts и таблицы.
- Более конкретный «Тип модели» получил приоритет над `Тип оборудования = controller`.
- Подтверждено category-neutral IP matching по полной базе SR и связь результата с `deviceId`.
- Добавлено exact auth rule для устройств Extron любой категории: `error = No credentials were accepted`; прочие производители и generic errors остаются processing errors.

## 2026-08-12 — Исправлена изоляция current и historical IP

- Устранён дефект, при котором новый JSON мог привязываться к чужому устройству по адресу из `ipHistory`.
- Automatic matching переведён на current IP index актуальной SR; historical index используется только в диагностике.
- Добавлены fail-closed проверки подтверждённого внутреннего IP и категории JSON до назначения `deviceId`.
- Конфликтные результаты сохраняют raw provenance, но не входят в историю, latest status, Dashboard equipment metrics или changes устройства.
- Добавлены regression `.100/.102`, history-only, reused/duplicate current IP, category conflict и internal-IP conflict.

Мелкие правки текста, стилей и локальные багфиксы не нужно логировать, если они не влияют на архитектуру, workflow, продуктовое поведение или важные соглашения.

## 2026-08-01 — Инициализирован project workflow

### Итог

Инициализирован workflow репозитория для ИИ-агент + GitHub SpecKit.

### Изменённые файлы

- `AGENTS.md`
- `README.md`
- `docs/...`
- `specs/README.md`
- `.agents/skills/...`
- `.specify/...`

### Проверки

- Установлен `uv`/`uvx` 0.12.1.
- GitHub SpecKit инициализирован с интеграцией `codex` и skills.
- Подтверждено наличие `.agents/skills`, `.specify` и `specs`.
- Существующая проектная документация не была перезаписана установщиком.

### Дальнейшие шаги

- Определить видение продукта.
- Выбрать технологический стек через ADR.
- Создать спецификацию MVP.

## 2026-08-03 — Сформирован черновик видения продукта

### Итог

На основе задачи периодического анализа снимков и примера данных сформирован черновик product vision. Зафиксировано разделение конфигурационных изменений, эксплуатационных событий и проблем качества данных.

### Изменённые файлы

- `AGENTS.md`
- `docs/project-vision.md`
- `docs/implementation-log.md`

### Проверки

- Неизвестные продуктовые решения оставлены как `TBD` или открытые вопросы.
- Технологический стек и архитектура не выбирались.
- Продуктовый код не создавался.

### Дальнейшие шаги

- Согласовать идентичность проекта и устройств.
- Уточнить пользователей, границы и критерии успеха MVP.
- Создать Full SpecKit-спецификацию после уточнений.

## 2026-08-03 — Создана спецификация аналитики изменений

### Итог

Приняты рекомендованные продуктовые решения и создана Full SpecKit-спецификация MVP для анализа изменений проектов и оборудования между снимками.

### Изменённые файлы

- `AGENTS.md`
- `docs/project-vision.md`
- `docs/implementation-log.md`
- `.specify/feature.json`
- `specs/001-project-change-analysis/spec.md`
- `specs/001-project-change-analysis/checklists/requirements.md`

### Проверки

- Спецификация проверена по обязательному checklist SpecKit.
- `[NEEDS CLARIFICATION]` markers отсутствуют.
- Требования и критерии успеха не зависят от технологического стека.
- Extension hooks не настроены и не запускались.
- Продуктовый код не создавался.

### Дальнейшие шаги

- Сформировать и утвердить project constitution.
- Выполнить `$speckit-clarify` для проверки допущений.
- После уточнений перейти к выбору стека через ADR и `$speckit-plan`.

## 2026-08-03 — Ратифицирована constitution и уточнена спецификация MVP

### Итог

Принята constitution версии 1.0.0 и завершён сеанс `$speckit-clarify`. Уточнены правила работы без стабильных идентификаторов, подтверждения удаления, границы входного формата, роли доступа и срок хранения.

### Изменённые файлы

- `AGENTS.md`
- `docs/project-vision.md`
- `docs/implementation-log.md`
- `.specify/memory/constitution.md`
- `specs/001-project-change-analysis/spec.md`

### Проверки

- Принято и интегрировано 5 уточнений.
- Спецификация содержит 35 уникальных функциональных требований и 12 критериев успеха.
- Spec Quality Checklist: 16/16.
- Constitution версии 1.0.0 не содержит placeholders и использует ISO-даты.
- Extension hooks не настроены и не запускались.
- Продуктовый код не создавался.

### Дальнейшие шаги

- Выбрать технологический стек и зафиксировать решение через ADR.
- Выполнить `$speckit-plan` после принятия стека.

## 2026-08-03 — Выбран технологический стек

### Итог

Через ADR-0002 принят стек Python 3.14, Django 5.2 LTS и PostgreSQL 18. Интерфейс MVP реализуется серверным HTML в рамках модульного монолита без отдельного SPA.

### Изменённые файлы

- `AGENTS.md`
- `docs/architecture.md`
- `docs/decisions/README.md`
- `docs/decisions/ADR-0002-application-technology-stack.md`
- `docs/implementation-log.md`

### Проверки

- Выбранные версии проверены по официальным источникам.
- Решение соответствует контрольному масштабу и границам MVP.
- Продуктовый код и зависимости не создавались.

### Дальнейшие шаги

- Создать технический план через `$speckit-plan`.

## 2026-08-03 — Создан технический план MVP

### Итог

Через `$speckit-plan` подготовлены research, data model, input/UI/change-event contracts и quickstart validation guide для модульного Django-монолита.

### Изменённые файлы

- `AGENTS.md`
- `docs/architecture.md`
- `docs/context-map.md`
- `docs/implementation-log.md`
- `specs/001-project-change-analysis/plan.md`
- `specs/001-project-change-analysis/research.md`
- `specs/001-project-change-analysis/data-model.md`
- `specs/001-project-change-analysis/quickstart.md`
- `specs/001-project-change-analysis/contracts/...`

### Проверки

- Pre-design и post-design Constitution Check: PASS.
- JSON Schema корректно парсится.
- Локальные ссылки plan artifacts разрешаются.
- `NEEDS CLARIFICATION`, placeholders и trailing whitespace отсутствуют.
- Product code, runtime-зависимости и planned source directories не создавались.

### Дальнейшие шаги

- Выполнить `$speckit-tasks` для декомпозиции реализации.

## 2026-08-03 — Создан план задач реализации

### Итог

Через `$speckit-tasks` технический план декомпозирован в последовательные test-first задачи по четырём пользовательским историям и cross-cutting требованиям.

### Изменённые файлы

- `AGENTS.md`
- `docs/implementation-log.md`
- `specs/001-project-change-analysis/tasks.md`

### Проверки

- Создано 104 задачи с последовательными ID `T001`–`T104`.
- Все задачи соответствуют checklist-формату SpecKit и содержат точные пути файлов.
- Зафиксированы 61 возможность параллельного выполнения и независимый критерий проверки каждой пользовательской истории.
- Requirements traceability покрывает FR-001–FR-035 и SC-001–SC-012.
- Extension hooks не настроены и не запускались.
- Продуктовый код и runtime-зависимости не создавались.

### Дальнейшие шаги

- Начать `$speckit-implement` с Phase 1 и Phase 2.
- Реализовать и независимо проверить US1 как первый демонстрируемый MVP slice.

## 2026-08-03 — Стек заменён на browser-only по эталону MVP_DEMO

### Итог

Пользователь указал `drthalas/MVP_DEMO` как архитектурный и runtime-эталон. Репозиторий-эталон проанализирован локально: приложение запускается прямым открытием `index.html`, использует HTML/CSS/Vanilla JavaScript, `localStorage`, JSON backup и не имеет backend, database, package manager или runtime-зависимостей.

Предыдущее решение Django/PostgreSQL заменено ADR-0003. Specification, research, data model, interface contract, plan, tasks, quickstart и постоянный контекст актуализированы до начала реализации.

### Изменённые файлы

- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/context-map.md`
- `docs/project-vision.md`
- `docs/decisions/README.md`
- `docs/decisions/ADR-0002-application-technology-stack.md`
- `docs/decisions/ADR-0003-browser-only-demo-stack.md`
- `docs/implementation-log.md`
- `specs/001-project-change-analysis/spec.md`
- `specs/001-project-change-analysis/checklists/requirements.md`
- `specs/001-project-change-analysis/plan.md`
- `specs/001-project-change-analysis/research.md`
- `specs/001-project-change-analysis/data-model.md`
- `specs/001-project-change-analysis/contracts/html-interface.md`
- `specs/001-project-change-analysis/quickstart.md`
- `specs/001-project-change-analysis/tasks.md`

### Проверки

- Reference commit: `a18df2e3725f75078cc4ccd8aa82c94f46197f2a`.
- Reference runtime files: `index.html`, `styles.css`, `app.js`; внешние URL/network dependencies не обнаружены.
- Reference `app.js` использует localStorage key, whole-state persistence, FileReader, Blob download и JSON/CSV import/export.
- Новый task plan содержит 60 последовательных browser-only задач.
- Временные исключения constitution I/VI имеют владельца, компенсации и exit condition в ADR-0003.
- Product code и runtime-зависимости в MVP_SPHERE_SR не создавались.

### Ограничения проверки

- Встроенный browser-control не запустился из-за ограничения доступа среды к локальному browser profile.
- `node` отсутствует в PATH; он не требуется для работы direct-open приложения и нужен только как optional syntax check.

### Дальнейшие шаги

- Начать реализацию Phase 1–2 из актуального `tasks.md`.
- Затем реализовать US1 как первый демонстрируемый browser-only MVP slice.

## 2026-08-03 — Реализованы browser-only Setup и Foundation

### Итог

Выполнены задачи `T001`–`T015`: создан direct-open UI shell, versioned local state, demo login/roles, atomic localStorage persistence, quota/corrupt-state recovery и полный JSON backup/restore.

### Изменённые файлы

- `.gitignore`
- `index.html`
- `styles.css`
- `app.js`
- `tests.html`
- `tests.js`
- `tests/fixtures/expectations.js`
- `specs/001-project-change-analysis/tasks.md`
- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/context-map.md`
- `docs/implementation-log.md`

### Проверки

- `app.js`: syntax check PASS.
- `tests.js`: syntax check PASS.
- Foundation regression tests: 16/16 PASS.
- Проверены initialization, state schema, roles, reload, corrupt-state preservation, referential integrity, quota preflight/rollback, backup validation/round-trip и HTML escaping.
- Remote network APIs/dependencies в product files не обнаружены; единственный URL в `index.html` находится внутри inline SVG favicon.
- SpecKit checklist: 16/16 PASS; extension hooks отсутствуют.

### Ограничения проверки

- Автоматический in-app browser preview недоступен из-за ограничения среды на local browser profile.
- Фактическое открытие `index.html` двойным кликом должно быть подтверждено в acceptance browser; dependency-free logic tests дополнительно выполнены через bundled Node.js.

### Дальнейшие шаги

- Реализовать US1 (`T016`–`T034`): synthetic snapshots, import, validation, normalization, matching и previous diff.

## 2026-08-03 — Реализован первый MVP-срез импорта и сравнения

### Итог

Выполнены задачи `T016`–`T034`: добавлены полностью синтетические Extron v1/legacy fixtures, безопасный multiple-file intake, contract validation, SHA-256 duplicate guard, нормализация, Project/Asset identity, completeness-aware diff и экраны snapshot/mapping/previous comparison.

### Изменённые файлы

- `app.js`
- `styles.css`
- `tests.html`
- `tests.js`
- `tests/fixtures/expectations.js`
- `tests/fixtures/extron-v1/*.json`
- `tests/fixtures/legacy/*.json`
- `specs/001-project-change-analysis/tasks.md`
- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/context-map.md`
- `docs/implementation-log.md`

### Проверки

- `app.js` и `tests.js`: syntax check PASS через bundled Node.js.
- Dependency-free Foundation + US1 tests: 38/38 PASS.
- Все 12 JSON fixtures корректно парсятся.
- Проверены Extron v1/legacy/unsupported contracts, secret marker без вывода raw secret, duplicate bytes, raw input guard, formatting noise, IP/MAC/name/add/remove events, duplicate-source conflict, ambiguous matching block, manual project mapping и end-to-end persist/restore comparison.
- Backend, database, package manager, runtime dependencies и network calls не добавлены.
- SpecKit checklist: 16/16 PASS; extension hooks отсутствуют.

### Ограничения проверки

- Автоматический in-app browser preview недоступен из-за ограничения доступа среды к локальному browser profile.
- Прямое открытие `index.html` обеспечено относительными plain CSS/JS assets без module imports; визуальный acceptance в целевом browser остаётся ручной проверкой.

### Дальнейшие шаги

- Реализовать US2 (`T035`–`T041`): timeline по `capturedAt`, selected-date comparison и late-snapshot reflow.

## 2026-08-03 — Реализована история проектов и late-snapshot reflow

### Итог

Выполнены задачи `T035`–`T041`: добавлены хронология снимков по `capturedAt`, отдельное отображение `uploadedAt`, детерминированный порядок одинаковых дат, текущий inventory проекта, идемпотентное сравнение выбранной пары и перестроение active previous graph при поздней загрузке.

Старые несмежные ChangeSets не удаляются: они получают статус `superseded`, а новые соседние расчёты сохраняют `supersedesId`.

### Изменённые файлы

- `app.js`
- `styles.css`
- `tests.html`
- `tests.js`
- `tests/fixtures/expectations.js`
- `tests/fixtures/timeline-expectations.js`
- `tests/fixtures/extron-v1/late-snapshot.json`
- `specs/001-project-change-analysis/tasks.md`
- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/context-map.md`
- `docs/implementation-log.md`

### Проверки

- JavaScript syntax check: PASS.
- Dependency-free Foundation + US1 + US2 tests: 42/42 PASS.
- Late import `date 1 → date 3 → date 2` даёт active graph `1→2`, `2→3`; прежний `1→3` остаётся `superseded`.
- Selected comparison повторно использует существующий результат для той же нормализованной пары дат.
- Extension hooks отсутствуют; backend, dependencies и network calls не добавлены.

### Ограничения проверки

- Визуальный acceptance через встроенный browser profile недоступен в текущей среде; direct-open UI требует ручной проверки двойным кликом.

### Дальнейшие шаги

- Реализовать US3 (`T042`–`T047`): baseline assignment, replacement history и persistent drift.

## 2026-08-03 — Реализован контроль отклонений от baseline

### Итог

Выполнены задачи `T042`–`T047`: реализованы назначение, подтверждаемая замена и завершение baseline, единственный active assignment, сохраняемая история решений и baseline ChangeSets для текущего состояния.

Persistent drift остаётся видимым относительно утверждённого снимка, даже если последний previous diff пуст. Статус `expiration_pending` сохраняет baseline и требует явного решения пользователя.

### Изменённые файлы

- `app.js`
- `styles.css`
- `tests.html`
- `tests.js`
- `tests/fixtures/baseline-expectations.js`
- `specs/001-project-change-analysis/tasks.md`
- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/context-map.md`
- `docs/implementation-log.md`

### Проверки

- JavaScript syntax check: PASS.
- Dependency-free Foundation + US1–US3 tests: 45/45 PASS.
- Проверены single-active invariant, запрет неподтверждённой замены, replacement links, persistent drift, superseded baseline calculations и expiration-pending guard.
- Extension hooks отсутствуют; backend, dependencies и network calls не добавлены.

### Ограничения проверки

- Визуальный acceptance через встроенный browser profile недоступен в текущей среде; direct-open UI требует ручной проверки двойным кликом.

### Дальнейшие шаги

- Реализовать US4 (`T048`–`T055`): filters, append-only reviews, match decisions и demo-role action filtering.

## 2026-08-03 — Реализованы review и ручное разрешение matching

### Итог

Выполнены задачи `T048`–`T055`: добавлены восемь фильтров Change Events, детальная evidence-карточка, append-only ReviewDecision, экран неоднозначных сопоставлений и четыре ручных MatchDecision-действия.

Ручное решение пересчитывает производные previous/selected/baseline ChangeSets, сохраняя прежние расчёты как `superseded`. Raw snapshots не изменяются. Постоянное предупреждение подчёркивает, что demo-роли и `localStorage` не являются настоящей защитой.

### Изменённые файлы

- `app.js`
- `styles.css`
- `tests.html`
- `tests.js`
- `specs/001-project-change-analysis/tasks.md`
- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/implementation-log.md`

### Проверки

- JavaScript syntax check: PASS.
- Dependency-free Foundation + US1–US4 tests: 52/52 PASS.
- Проверены обязательные поля Change Event, safe evidence, все фильтры, latest review projection, append-only review/match history и действия choose/create_new/replace/unmatched.
- Demo role matrix разрешает backup обеим ролям и скрывает/отклоняет admin-only reset/user actions для AV Engineer.
- Extension hooks отсутствуют; backend, dependencies и network calls не добавлены.

### Ограничения проверки

- Визуальный acceptance через встроенный browser profile недоступен в текущей среде; direct-open UI требует ручной проверки двойным кликом.

### Дальнейшие шаги

- Выполнить `T056`–`T060`: retention, regression/accessibility/performance и финальный acceptance документации.

## 2026-08-03 — Завершены retention и automated acceptance

### Итог

Выполнены `T056`–`T058` и документационная задача `T060`. Добавлены startup/manual retention, минимальный `RetentionAudit`, атомарное удаление зависимых derived records без создания equipment ChangeEvent и защита активного baseline через `expiration_pending`.

UI получил skip-link, расширенный keyboard focus, текстовые live-статусы, storage meter/usage, responsive table overflow и доступные empty/error states. Администратор может изменить срок хранения и применить retention одним атомарным действием.

### Изменённые файлы

- `index.html`
- `styles.css`
- `app.js`
- `tests.js`
- `AGENTS.md`
- `README.md`
- `docs/architecture.md`
- `docs/context-map.md`
- `docs/implementation-log.md`
- `specs/001-project-change-analysis/quickstart.md`
- `specs/001-project-change-analysis/tasks.md`

### Проверки

- JavaScript syntax check: PASS.
- Dependency-free regression/performance suite: 58/58 PASS.
- Проверены ordinary retention deletion/audit, active-baseline guard, idempotency, post-retention backup round-trip, quota rollback и corrupt-state preservation.
- Performance control: 10 snapshots × 100 synthetic devices, combined raw ≤3 МиБ, processing <10 секунд.
- Backend, database, package manager, runtime dependencies и product network calls не добавлены.
- SpecKit checklist: 16/16 PASS; extension hooks отсутствуют.

### Ограничения проверки

- Browser-control подключился, но его URL policy запретила открытие локального `file://`; безопасного разрешённого обхода нет.
- `T059` и фактический render ≤2 секунд остаются ручной проверкой двойным кликом по `tests.html` и `index.html` в целевом browser.

### Дальнейшие шаги

- Выполнить manual direct-open сценарии 1–14 из `specs/001-project-change-analysis/quickstart.md` и записать browser/version/result.
- После подтверждения отметить `T059` и завершить feature 60/60.

## 2026-08-03 — Подтверждён direct-open acceptance

### Итог

Пользователь подтвердил, что `tests.html` открывается двойным кликом и показывает 58/58 PASS, а `index.html` запускает приложение и позволяет войти через `admin / admin`. Запрошенные ручные проверки подтверждены как рабочие; browser/version не указаны.

Задача `T059` закрыта. Feature `001-project-change-analysis` завершена: 60/60 задач.

### Проверки

- Manual direct-open: PASS по подтверждению пользователя.
- Automated regression/performance suite: 58/58 PASS.
- Product runtime network/module references: 0.
- SpecKit checklist: 16/16 PASS.

### Дальнейшие шаги

- Для новых крупных или рискованных изменений использовать новый Full SpecKit cycle.
- До работы с реальными чувствительными данными выполнить exit condition из ADR-0003.

## 2026-08-04 — Demo-сессия отделена от persistent state

### Итог

По принятому SpecKit-lite изменению устранён автоматический вход после повторного открытия файла. Demo-пользователь хранится только в `sessionStorage` до закрытия вкладки; `localStorage` и JSON backup содержат `currentUserId: null`. При первом запуске обновлённой версии legacy session из persistent state очищается безопасной полной записью state.

Предупреждение интерфейса уточнено: demo-вход включён, но не является защищённой авторизацией.

### Что входит

- восстановление demo-сессии после reload текущей вкладки;
- завершение сессии при закрытии вкладки или явном выходе;
- очистка session при reset, corrupt-state reset и backup import;
- регрессионные тесты session lifecycle.

### Что не входит

- backend-аутентификация, шифрование, защищённые cookies или production access control.

### Проверки

- JavaScript syntax: PASS.
- Dependency-free regression/performance suite: 61/61 PASS.
- Persistent state/backup session isolation: PASS.
- Targeted direct-open recheck после закрытия вкладки: ожидает подтверждения пользователя.

### Риски / дальнейшие шаги

- `sessionStorage` и demo credentials доступны пользователю browser profile; это остаётся UI-механизмом, а не security boundary.
- Для настоящей авторизации требуется новый Full SpecKit cycle и изменение архитектуры согласно exit condition ADR-0003.

## 2026-08-09 — SR inventory и история результатов опроса

### Итог

Выполнен Full SpecKit feature `002-sr-inventory-analytics`. State обновлён до v2 с автоматической миграцией; добавлены локальный XLSX parser, синхронизация SR, категории ВКС/контроллеров/панелей, folder-based polling import, история устройства, change detection, общий dashboard и фильтры.

Реальный сетевой опрос намеренно не имитируется: registry содержит только capability descriptors `not_implemented`, credentials отсутствуют в модели. Legacy-аудит проектных Extron snapshots сохранён.

### Проверки

- `node --check app.js`: PASS.
- `node --check tests.js`: PASS.
- Полный regression/contract/performance suite: 81/81 PASS.
- Локальный synthetic XLSX разобран vendored SheetJS без CDN.
- Проверены migration, optional «Домен», invalid/duplicate IP, identity/IP history, Primary Controller/TLP, ping failure, malformed/unmatched/conflict и duplicate polling.
- Встроенный browser-control не разрешает `file://`; повторный visual/direct-open acceptance изменённого UI остаётся ручным.

### Изменённые зоны

- `app.js`, `styles.css`, `index.html`, `tests.html`, `tests.js`;
- `vendor/`, `.gitignore`;
- `specs/002-sr-inventory-analytics/`;
- `README.md`, architecture/product/context docs и ADR-0004.

## 2026-08-10 — Защищённый локальный runtime и подготовка polling

### Итог

Выполнен Full SpecKit feature `003-secure-local-polling`. Browser-only режим заменён Windows loopback runtime: UI доступен только через одноразовую локальную сессию, state v3 хранится зашифрованным, мастер-ключ защищён DPAPI CurrentUser. Искусственный лимит 4 МиБ удалён.

Оставлена единственная роль «Администратор МЦТП». Из навигации и маршрутизации удалены «Проекты аудита», «События», «Сопоставления», «Снимки». Добавлен экран защищённого локального хранилища и импорт JSON/CSV credentials в отдельный write-only vault.

Переданный каталог моделей/производителей закодирован в model catalog. Реализованы explicit IP allowlist, unicast validation, bounded ping, безопасные per-IP JSON и fail-closed статус `protocol_required`. Vendor-команды намеренно не выдуманы: для реального опроса нужны подтверждённые протоколы и read-only контракты.

### Security controls

- AES-256-GCM для каждого persisted object, случайные nonce и authenticated metadata;
- мастер-ключ под Windows DPAPI CurrentUser;
- atomic temp/fsync/replace;
- bind только `127.0.0.1`, random port, one-time launch token;
- HttpOnly/SameSite session, Host/Origin/CSRF, CSP, no CORS, no-store;
- credential vault исключён из generic storage API, state, UI, аналитики, backup и polling output;
- runtime data, key envelopes, vaults и polling output исключены из Git.

### Проверки

- JavaScript syntax: PASS для всех новых и изменённых runtime-файлов.
- Legacy regression/contract/performance: 81/81 PASS.
- DPAPI, encrypted store, vault, catalog и polling: 9/9 PASS из реального Windows-профиля.
- Loopback session, CSRF, encrypted state >5 МиБ и write-only vault: 1/1 PASS.
- Secret/artifact scan: реальные секреты и persisted runtime artifacts не найдены; в тестах используются только явно synthetic значения.

### Изменённые зоны

- `server.js`, `start.ps1`, `runtime-config.js`;
- `runtime/`, `scripts/poll-devices.js`;
- `app.js`, `index.html`, `tests.js`, `runtime-tests.js`, `server-tests.js`;
- `.gitignore`, `.specify/memory/constitution.md`;
- `specs/003-secure-local-polling/`;
- README, architecture/product/context docs и ADR-0005.

## 2026-08-10 — Операционный главный Dashboard

### Итог

Выполнен Full SpecKit feature `004-analytics-dashboard`. Минимальный обзор заменён операционным главным экраном единственной роли «Администратор МЦТП». Все значения вычисляются из актуальной SR и polling history; mock/random данные отсутствуют.

Current-state KPI используют один детерминированный последний результат на устройство. Метрики выбранного периода вынесены в отдельный блок и не меняют смысл текущего состояния. Добавлены глобальные фильтры, drill-down в списки оборудования, последний запуск, VIP/локации, проблемы и изменения, распределения и явные empty/unsupported/insufficient-data состояния.

Authorization, reboot, GCPlus и freshness не рассчитываются без достоверных исходных сигналов или настроенного порога. Презентационные списки ограничены, но итоговые числа всегда считаются по полной выборке.

### Проверки

- JavaScript syntax: PASS.
- Regression/contract/performance: 93/93 PASS, включая 5 000 устройств и 25 000 результатов менее чем за 2 секунды.
- Secure runtime: 9/9 PASS; loopback server integration: 1/1 PASS.
- Локальная browser acceptance: empty state, импорт synthetic XLSX и папки polling JSON, заполненный Dashboard, отсутствие горизонтального переполнения и KPI drill-down — PASS.
- Secret/artifact scan: PASS; для acceptance использовались только synthetic данные во временном каталоге.

### Изменённые зоны

- `app.js`, `styles.css`, `tests.js`;
- `specs/004-analytics-dashboard/`;
- README, architecture/product/context docs и этот журнал.

## 2026-08-10 — Русская терминология и Справочник

### Итог

Выполнен Full SpecKit feature `005-russian-ui-reference`. Доступные пользователю маршруты переведены на единый русский словарь без изменения исходных значений SR/JSON и внутренних enum-кодов. Обязательные категории отображаются как «Терминалы ВКС», «Контроллеры» и «Панели управления»; отсутствие ответа по ping — как «Нет ответа по сети».

Добавлен локальный модуль «Справочник» с десятью разделами, поиском по названию, сокращениям, определению и ключевым словам. Главный экран и три категории оборудования получили переходы «О модуле», а показатели отсутствия сети, изменений и отсутствия опроса — централизованные подсказки. Значения SR и GCPlus не интерпретируются без подтверждения и помечены как требующие уточнения; метрика перезагрузок помечена как находящаяся в разработке.

### Проверки

- JavaScript syntax: PASS.
- Regression/contract/performance: 99/99 PASS.
- Secure runtime: 9/9 PASS; loopback server integration: 1/1 PASS.
- Локальная browser acceptance: семь маршрутов, десять разделов, поиск `ping`, контекстный переход, отсутствие необработанных кодов и горизонтального переполнения — PASS.
- Исходные тестовые значения SR/JSON остаются неизменными; внешние запросы и сохранение поисковых запросов не добавлены.

### Изменённые зоны

- `app.js`, `styles.css`, `index.html`, `tests.js`, `runtime-tests.js`;
- `specs/005-russian-ui-reference/`;
- README, architecture/product/context docs, `AGENTS.md` и этот журнал.

Commit, push и deploy для этого этапа не выполнялись.

## 2026-08-10 — Переносимый запуск и автоматический Справочник

### Итог

Выполнен Full SpecKit feature `006-portable-reference-sync`. Чистая GitHub-копия теперь может однократно подготовить официальный закреплённый Node.js 24 LTS для Windows x64/ARM64 без прав администратора. Версия и SHA-256 находятся в `portable-runtime.json`; загрузка выполняется только при отсутствии совместимой среды, архив проверяется до исполнения и атомарно распаковывается в исключённый из Git `.runtime/`.

Каждый новый ПК/Windows-профиль сохраняет собственные DPAPI-ключ, encrypted state и credential vault. Перенос рабочих данных через GitHub не добавлен. Bootstrap изолирован от SR, polling results, аналитики и секретов и выполняет только официальный HTTPS GET до запуска приложения.

Модули, presentation dictionary, status descriptors и tooltips вынесены в `product-catalog.js`. Из каталога автоматически строятся навигация, модульные и статусные карточки Справочника, контекстная помощь и inventory route metadata. Добавление, переименование или удаление зарегистрированного модуля не требует второй ручной правки. Неизвестный смысл по-прежнему не выдумывается; отсутствие метаданных блокирует validation.

### Проверки

- Spec quality checklist: 16/16 PASS.
- Product catalog validation: 7 модулей, 7 модульных и 8 статусных карточек — PASS.
- Regression/contract/performance: 101/101 PASS.
- Secure runtime/bootstrap: 12/12 PASS; loopback server integration: 1/1 PASS.
- Fresh-PC bootstrap verified against the official Node.js v24.19.0 x64 archive: first download and SHA-256 verification passed, cached restart completed without network, and a deliberately altered archive was rejected before extraction or execution.
- PowerShell 5.1 parser и `-NoDownload` resolution: PASS.
- GitHub Windows quality workflow добавлен без operational data/secrets.

### Изменённые зоны

- `portable-runtime.json`, `start.ps1`, `scripts/ensure-node.ps1`;
- `product-catalog.js`, `scripts/validate-reference.js`, `app.js`, `index.html`, `server.js`;
- `.github/workflows/quality.yml`, `.gitignore`, тестовые suites;
- `specs/006-portable-reference-sync/`, ADR-0006 и основная документация.

Commit, push и deploy не выполнялись.

## 2026-09-01 — Автоматический опрос внутри инструмента

Создана Full SpecKit feature `013-in-tool-polling`. После выбора общей папки кнопка «Сформировать и запустить опрос» создаёт plan v2 и автоматически передаёт его защищённому runtime, запущенному через `start.ps1` только на `127.0.0.1`.

XLSX `Логин | Пароль` передаётся бинарно same-origin endpoint, сверяется по SHA-256 и существует только в памяти одного job. Runtime не использует historical vault или fallback credentials и очищает pool после completed, cancelled или failed. Extron использует только HTTPS/443; self-signed bypass является явным per-job параметром и не меняет глобальную TLS-конфигурацию.

Добавлен pull/ACK-контракт результата: runtime выдаёт один redacted JSON и блокирует interval/следующее устройство, пока browser не запишет файл в выбранную папку `YYYY-MM-DD_HH-mm-ss` и не подтвердит успех. Ошибка записи останавливает job; отмена прерывает schedule/interval, ранее записанные JSON остаются. Direct `index.html` сохраняет ручной импорт и аналитику, но автоматический сетевой запуск блокирует.

Документация, Constitution 3.1.0, ADR-0013, Справочник и тестовые контракты обновлены. Проверки: main regression — 136/136 PASS; runtime/DPAPI/job — 30/30 PASS; loopback API — 1/1 PASS; product catalog, JavaScript syntax и `git diff --check` — PASS. Визуальный smoke-test реального `127.0.0.1` экрана подтвердил новые элементы и отсутствие browser console errors. Реальные SR, credentials и опрос оборудования в acceptance не использовались. Commit, push и deploy не выполнялись.

## 2026-09-01 — Загрузка и План автоматического опроса

Создана Full SpecKit feature `012-automatic-polling-plan`. Модуль «Загрузка» разделён на SR, общую папку, учётные данные и План автоматического опроса. Длинные пояснения убраны с операционного экрана и перенесены в централизованный Справочник.

Причина ложного «Загружено частично» находилась в status rule: наличие любой диагностической inventory issue приравнивалось к отклонённой строке. Теперь `partial` зависит только от `rejectedCount > 0`; предупреждения сохраняются отдельно.

Добавлена чистая каскадная проекция актуальной SR с multi-select и взаимоисключающим «Все», точными total/supported/unsupported, обязательными Производителем и Моделью, стабильным порядком и plan schema v2. XLSX `Логин | Пароль` проверяется в памяти вкладки с безопасной статистикой; план содержит только его SHA-256. Тот же файл обязателен локальному CLI, сверяется до сети и является единственным credential source текущего запуска.

Polling runner теперь исключает unsupported до ping, сохраняет каждый JSON через awaited callback, после успешной записи ждёт интервал только перед следующим поддерживаемым устройством и прерывает ожидание по AbortSignal. Save failure пытается создать локальную recovery-копию и прекращает batch. PowerShell launcher требует Plan, Credentials и Output.

Проверки: main regression — 135/135 PASS; runtime/DPAPI — 28/28 PASS; historical server integration — 1/1 PASS; product catalog/reference — PASS; JavaScript и PowerShell syntax — PASS; `git diff --check`, real-IP/artifact scan — PASS. Старый fixture с ранее использованным инфраструктурным IP заменён адресами RFC 5737. Встроенный browser-control блокирует `file://` политикой URL, поэтому визуальный smoke-test не подменялся localhost-режимом.

Commit, push и deploy не выполнялись.

## 2026-08-31 — Локальный web-опрос контроллеров и панелей Extron

Выполнена feature `011-extron-web-polling`. Добавлен единый contract-based HTTPS adapter для контроллеров и панелей управления Extron. После login он сохраняет `NortxeSession` только в памяти процесса, читает текущий `/www/main.js`, извлекает динамические URI подтверждённых ресурсов и делает exact resource GET без query. Поддержка определяется контрактом, поэтому не ограничена каталогом моделей; неизвестный bundle/schema завершается fail-closed.

`CredentialVault` расширен scopes: exact IP, тип+производитель+модель и тип+производитель с однозначным приоритетом. Локальный CLI принимает первую таблицу XLSX/XLS через vendored SheetJS без выполнения формул и импортирует credentials напрямую в DPAPI vault. Browser файл паролей не читает. UI формирует из актуальной SR скачиваемый plan JSON без secrets.

Результаты по умолчанию атомарно сохраняются вне репозитория в `%LOCALAPPDATA%\MVP_SPHERE_SR\poll-results\YYYY-MM-DD_HH-mm-ss\<IP>.json`; explicit local output также поддерживается. Существующая ручная загрузка общей папки результатов в `index.html` сохранена и не зависит от polling CLI. Справочник дополнен через `product-catalog.js`.

Добавлены synthetic tests dynamic URI, cookie isolation, exact resource URL, unknown contract, credential precedence, Excel import, redaction, timestamp folder и partial batch. Реальные IP, credentials, device payloads и runtime files в repository/fixtures не добавлялись.

Проверки: main regression — 132/132 PASS; runtime/DPAPI — 20/20 PASS; historical loopback secure runtime — 1/1 PASS; product catalog/reference — PASS; PowerShell parser — PASS; secret/artifact/external-request/persistence scan и `git diff --check` — PASS.

Commit, push и deploy не выполнялись.

## 2026-08-10 — Прямой запуск index.html с сохранением security boundary

### Итог

Выполнен Full SpecKit feature `007-direct-index-launch`. Корневой `index.html` снова открывает приложение напрямую без Node.js, PowerShell и сети. Файловый режим подтверждается статическим `runtime-config.js`, использует новый in-memory adapter и не читает/не пишет рабочие данные в `localStorage` или IndexedDB. Импорт SR и результатов опроса доступен для аналитики текущей вкладки; reload/close создаёт чистое состояние.

Credential input в файловом режиме не отрисовывается, а общий обработчик дополнительно проверяет secure runtime до получения `File` и создания `FileReader`. Постоянное хранение, импорт учётных данных, AES-256-GCM, DPAPI CurrentUser, HttpOnly session и CSRF остаются только за `start.ps1`. Неподтверждённый HTTP/HTTPS runtime по-прежнему блокируется без browser fallback.

Удалены три заданных глобальных уведомления: статический banner, topbar «Защищённый локальный анализ» и повторяющийся `SECURITY_NOTICE`. Экран хранения и Справочник обновлены для точного описания активного режима; catalog validation остаётся обязательным.

### Проверки

- Spec quality checklist: 16/16 PASS.
- JavaScript syntax и product catalog: PASS.
- Regression/contract/performance: 101/101 PASS.
- Runtime/bootstrap/direct-open contracts: 13/13 PASS.
- Loopback server integration: 1/1 PASS.
- Автоматическая browser-навигация на `file://` заблокирована политикой browser-control; обход не выполнялся. Требуется короткая ручная проверка двойным щелчком по `index.html`.

### Изменённые зоны

- `index.html`, `runtime-config.js`, `app.js`, `styles.css`, `product-catalog.js`;
- `tests.js`, `runtime-tests.js`, `server-tests.js`, `.github/workflows/quality.yml`;
- `specs/007-direct-index-launch/`, ADR-0007 и основная документация.

Commit, push и deploy для feature 007 не выполнялись.

## 2026-08-10 — Пакетный импорт общей папки опросов

### Итог

Выполнен Full SpecKit feature `008-batch-polling-folder-import`. Модуль «Загрузка» принимает одну общую папку и рекурсивно группирует JSON по ближайшим родительским каталогам `YYYY-MM-DD_HH-MM-SS`. Каждая папка создаёт отдельный запуск, группы обрабатываются хронологически, а одинаковые имена в разных ветвях не смешиваются благодаря полному относительному пути.

Ошибки пути, чтения и разбора изолируются на уровне файла: корректные папки продолжают импортироваться, пользователь получает общий итог и детализацию. В provenance результата добавлен `sourceRelativePath`, в запуск — `folderPath`.

Интерфейс переведён на единственный поддерживаемый режим прямого открытия `index.html`. Он всегда использует volatile memory adapter, не предлагает серверный запуск или импорт учётных данных и не выполняет продуктовые сетевые запросы.

## 2026-08-10 — Масштабируемый импорт, прогресс и отмена

Выполнен Full SpecKit feature `009-scalable-polling-import`. Профилирование доказало O(N²) hot path: на 1 000 JSON legacy pipeline выполнял минимум 2 003 full-state clone, 1 000 rebuild истории и 1 000 000 SR comparisons, занимая 11,15 с; 5 000 не завершились за 180 с.

UI переведён на индексированный pipeline с пакетами по 32 файла, bounded FileReader concurrency 2–6 и cooperative yield. SR, дубликаты, запуски, история и change-пары индексируются; late arrival изменяет только затронутые соседние пары. Дубликат пропускается до parse/normalization/diff. В памяти одновременно удерживаются тексты только текущего пакета.

Добавлены живые показатели этапа, обработанных файлов, успехов, ошибок, дубликатов, скорости и ETA, а также безопасная отмена с сохранением завершённых результатов. Render ограничен 100 мс, Dashboard и полная serialization исключены из import hot path. Справочник дополнен пользовательским описанием.

Синтетический benchmark: 1 000 — 287,97 мс; 5 000 — 1,27 с; 7 862 — 2,03 с; 10 000 — 2,60 с; manual 25 000 — 7,19 с. На целевых 7 862 max event-loop lag составил 16,67 мс. Реальные пользовательские JSON не добавлялись. Подробности: `specs/009-scalable-polling-import/benchmark-results.md` и ADR-0009.

### Проверки

- JavaScript syntax: PASS.
- Regression/contract/performance: 106/106 PASS.
- Product catalog/reference validation: PASS.
- Пакетная группировка, календарная валидация, хронологический порядок, provenance, malformed/read/path errors и file-only launch contract покрыты автоматическими тестами.
- Ручной выбор каталога через `file://` описан в `specs/008-batch-polling-folder-import/quickstart.md`.

### Изменённые зоны

- `app.js`, `tests.js`, `runtime-tests.js`, `product-catalog.js`;
- `README.md`, `AGENTS.md`, architecture/context/product docs;
- `specs/008-batch-polling-folder-import/`, ADR-0008.

Commit и push для feature 008 не выполнялись.

## 2026-08-14 — Повторное исправление навигации «Оборудование»

Предыдущее исправление меняло начальное значение и условие render, но regression проверял только наличие/отсутствие строк в исходниках. Полный production lifecycle `render → click → render → child route → collapse/expand` не выполнялся, поэтому повторный дефект не был защищён тестом.

Navigation state вынесен в единый reducer/resolver, который использует сам browser click-handler. Начальное состояние всегда collapsed; переход по дочернему route сохраняет ручное состояние группы; active child не выполняет auto-expand. Скрытие дочерних пунктов подтверждается классом и нативным `hidden`, а общее правило `.nav-button` задаёт одинаковое базовое начертание родителя и других верхнеуровневых модулей.

Автоматический production regression покрывает collapsed → expanded → collapsed → expanded, все семь дочерних routes, collapse при active child и повторный render. Browser-control не может открыть `file://` из-за политики URL; обход не выполнялся.

Проверки: JavaScript syntax — PASS; regression — 126/126 PASS; runtime contracts — 13/13 PASS; server integration — 1/1 PASS; product catalog/reference — 12 модулей, 12 модульных карточек и 10 статусных карточек PASS; secret/artifact scan и `git diff --check` — PASS.

Commit, push и deploy не выполнялись.

## 2026-08-14 — Полнота Контроллеров, Терминалов ВКС и Скалеров

Ручное расхождение локализовано в трёх местах. Классификатор ошибочно давал всем утверждённым значениям «Тип модели» приоритет над `Тип оборудования = controller`. Identity pipeline переиспользовал уже занятое в текущем импорте устройство по первому совпавшему precedence-key и перезаписывал его другой строкой; synthetic «Скалеры −1» воспроизводился как 5 SR rows → 4 inventory. Таблица без фильтра включала historical devices, тогда как карточка считала только актуальную SR.

Controller-rule сделан первичным и точным; ВКС/Скалеры используют точное `Тип модели` с безопасной обработкой Excel-пробелов без substring matching. Эфемерный fingerprint index различает точный duplicate и identity collision: duplicate использует одну запись, конфликт сохраняет обе строки. Default inventory scope установлен в актуальную SR, JSON availability не участвует в count.

Synthetic stage matrix: ВКС `10 → 10 → 10 → 10 → 10 → 10`, Контроллеры `10 → 10 → 10 → 10 → 10 → 10`, Скалеры `10 → 10 → 10 → 10 → 10 → 10`; отдельный scaler regression после исправления `5 → 5`. Реальная пользовательская SR в репозитории и fixtures отсутствует, поэтому реальные raw counts не копировались и не фиксировались.

Проверки: JavaScript syntax — PASS; regression/navigation/SR — 132/132 PASS; runtime contracts — 13/13 PASS; server integration — 1/1 PASS; Справочник — 12 модулей, 12 модульных карточек и 10 статусных карточек PASS. SR benchmark сохранил линейный рост: 1k — 95 мс, 5k — 508 мс, 10k — 1,01 с, 25k — 2,54 с; worst-case 1 500 строк с общим inventory key сохранил 1 500 устройств быстрее 5 секунд. Secret/artifact scan и `git diff --check` — PASS.

Commit, push и deploy не выполнялись.
