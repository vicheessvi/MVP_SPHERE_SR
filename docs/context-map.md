# Карта контекста

Этот файл помогает ИИ-агент находить нужный контекст без загрузки всего репозитория.

## Постоянные инструкции

- `AGENTS.md`

## SpecKit / skills/инструкции агента

- `.agents/skills`
- `.specify`

## Продуктовый и архитектурный контекст

- `docs/project-vision.md`
- `docs/architecture.md`
- `docs/decisions/`

## Workflow разработки

- `docs/development-workflow.md`
- `docs/implementation-log.md`

## Спецификации фич

- `specs/`

## Будущие зоны приложения

Фактические зоны browser-only приложения:

- UI и точка входа: `index.html`.
- Состояние, аналитика, retention и client-side navigation: `app.js`.
- Стили: `styles.css`.
- Dependency-free browser/Node regression и performance tests: `tests.html` и `tests.js`.
- Synthetic fixture builders/expectations: `tests/fixtures/expectations.js`, `tests/fixtures/timeline-expectations.js` и `tests/fixtures/baseline-expectations.js`.
- Синтетические входные snapshots: `tests/fixtures/extron-v1/` и `tests/fixtures/legacy/`.
- Внешнего API, backend, build/config и package manager нет.

Source paths созданы в Phase 1–2 согласно `specs/001-project-change-analysis/plan.md`. Архитектурный эталон: `drthalas/MVP_DEMO`.

Acceptance `T001`–`T060` завершён; результаты direct-open проверки записаны в `specs/001-project-change-analysis/quickstart.md`.

## Монорепозиторий

Если репозиторий станет монорепозиторием, явно указать зоны вроде `frontend`, `backend`, `admin`, `mobile` и правила поиска контекста для каждой зоны.

Обновлять этот файл, когда фактическая структура проекта становится понятнее.
