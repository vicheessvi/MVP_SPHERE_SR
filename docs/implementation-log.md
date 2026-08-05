# Implementation Log

Этот журнал фиксирует только значимые изменения проекта.

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
