# Архитектура

## Текущий статус

Принята архитектура автономного browser-only MVP, запускаемого прямым открытием `index.html`. Основание: `docs/decisions/ADR-0003-browser-only-demo-stack.md`.

## Технологический стек

- HTML5;
- CSS3;
- Vanilla JavaScript;
- browser `localStorage`;
- JSON import/export для полного backup;
- встроенные browser APIs: File API, Blob URL и при доступности Web Crypto.

Backend, база данных, package manager, build step, frontend framework и внешние runtime-библиотеки отсутствуют.

## Структура приложения

- `index.html` — единственная точка входа и корневой контейнер UI;
- `styles.css` — адаптивная верстка, компоненты и состояния;
- `app.js` — versioned state, import, normalization, matching, diff, retention, rendering и event handlers;
- `tests.html` и `tests.js` — dependency-free browser regression harness;
- `tests/fixtures/` — синтетические Extron v1 и sanitized legacy snapshots.

Реализованы US1–US4 и cross-cutting требования: intake/validation/normalization, Project/Asset identity, previous/selected/baseline comparison, timeline/late reflow, event filters, append-only ReviewDecision и MatchDecision, startup/manual retention, quota-safe persistence и доступные текстовые состояния. Automated и подтверждённый пользователем ручной `file://` acceptance завершены.

## Модель данных

Единый versioned state хранится под ключом `mvpSphereSrState.v1`. Он содержит локальных demo users, projects, immutable-at-application-level snapshots, normalized observations, match decisions, change sets/events, baselines, reviews, retention audit и history.

Полная модель описана в `specs/001-project-change-analysis/data-model.md`.

Retention выполняется только при запуске страницы и по явному действию администратора. Обычный expired snapshot удаляется атомарно с зависимыми ChangeSet/ReviewDecision/MatchDecision/BaselineAssignment и получает минимальный `RetentionAudit`; ChangeEvent для очистки не создаётся. Активный baseline защищён и переводится в `expiration_pending`.

## Контракты

- Extron v1 и legacy-профиль остаются входными контрактами.
- Внешнего API нет.
- Snapshot выбирается через `<input type="file">` и обрабатывается внутри browser process.
- Полный state экспортируется и импортируется как versioned JSON backup.

## UI-принципы

- Один `index.html` и client-side screen state без URL router.
- Светлая desktop-first компоновка с боковой навигацией, карточками, таблицами, фильтрами и detail panels.
- Статусы, важность и confidence передаются текстом и цветом.
- Все действия доступны с клавиатуры и имеют empty/error states.
- В интерфейсе постоянно видна маркировка «локальный демонстрационный режим».

## Безопасность и приватность

Browser-only MVP не является защищённой системой:

- UI-роли не обеспечивают настоящую авторизацию;
- `localStorage` доступен пользователю browser profile и DevTools;
- данные могут быть потеряны при очистке storage;
- raw snapshot и history не имеют tamper-resistant защиты;
- использовать можно только synthetic/sanitized или явно разрешённые локальные данные.

Приложение не делает сетевых запросов, обнаруживает признаки секретов, скрывает их из обычного UI и предупреждает пользователя перед сохранением snapshot.

## Стратегия тестирования

- dependency-free unit/contract/regression tests в `tests.html` + `tests.js`;
- синтетические pair fixtures с ожидаемыми событиями;
- ручные сценарии из `specs/001-project-change-analysis/quickstart.md`;
- проверка прямого запуска `index.html` в согласованном desktop browser;
- проверка backup/restore, quota failure и поведения после reload.

Текущий automated набор: 58/58 PASS, включая контроль 10 snapshots × 100 devices с суммарным raw input не более 3 МиБ и пределом обработки 10 секунд. Пользователь подтвердил фактический `file://` launch и работоспособность приложения в desktop browser; browser/version не указаны.

## Деплой

Установка не требуется. Пользователь получает папку со статическими файлами и открывает `index.html` двойным кликом. Static hosting возможен отдельно, но не является обязательным режимом MVP.

## Ограничение эксплуатации

Перед использованием реальных чувствительных данных, совместной работой или production-запуском требуется новый ADR с защищённым backend либо packaged desktop runtime.

Временные исключения из принципов I и VI constitution, владелец, компенсации и exit condition описаны в `docs/decisions/ADR-0003-browser-only-demo-stack.md` и остаются действующими только для локального demo.
