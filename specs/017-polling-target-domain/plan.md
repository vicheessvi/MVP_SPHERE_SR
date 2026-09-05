# Implementation Plan: Адресный опрос и фильтр домена

**Branch**: `codex/secure-local-runtime` | **Date**: 2026-09-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/017-polling-target-domain/spec.md`

## Summary

Расширить существующий браузерный selector плана двумя способами выбора: точным устройством из актуальной SR по IPv4 и прежним массовым каскадом, дополненным первым измерением «Домен». Чистая проекция будет возвращать детерминированный статус адресного поиска, одну цель или пустой набор, а также четырёхуровневые доступные значения. UI покажет карточку уже загруженного устройства без сети. Сформированный plan v2 продолжит передавать только существующий список устройств локальному Python-runtime; сервер, adapter registry, exact-IP allowlist, credential pool, job/ACK и output folder остаются без изменений.

## Technical Context

**Language/Version**: HTML5/CSS3/Vanilla JavaScript; Python 3.11+ runtime без изменений; Node.js только для development-проверок

**Primary Dependencies**: существующий `app.js`, `styles.css`, `product-catalog.js`; vendored SheetJS для импорта SR; сторонние пакеты не добавляются

**Storage**: UI-выбор существует в памяти вкладки; готовый план остаётся в текущем memory state; JSON-результаты записываются только в выбранную папку

**Testing**: `node tests.js`, `node scripts/validate-reference.js`, `node --check`; полный Python `unittest` и compileall как регрессия границы runtime

**Target Platform**: Windows 10/11, Chromium browser; для автоматического режима установленный Python 3.11+

**Project Type**: локальное desktop-style web-приложение с авторизованным loopback runtime

**Performance Goals**: точный IP lookup до 300 мс; четырёхуровневый cascade до 2 секунд при 25 000 актуальных устройств

**Constraints**: только актуальная SR; exact normalized IPv4; неоднозначность блокирует выбор; отсутствие сети при показе карточки; никакого секрета или дублирующего IP в plan selection; старые массовые результаты и порядок сортировки сохраняются

**Scale/Scope**: один администратор, одна вкладка, до 25 000 устройств; одна адресная цель или массовое пересечение доменов/категорий/производителей/моделей

## Constitution Check

*GATE before research: PASS. Re-check after design: PASS.*

- **I — raw evidence**: SR не изменяется; карточка и фильтры являются производной проекцией актуальных строк.
- **II — identity before comparison**: адресный режим выбирает существующий `device.id` только после единственного точного current-IP совпадения; конфликт не разрешается догадкой.
- **III — deterministic normalization**: IP использует существующую нормализацию, домен — единый `normalizeText`; сортировка плана остаётся стабильной.
- **IV — incomplete data**: пустой домен получает явный вариант «Не указано»; отсутствующий/некорректный/неоднозначный IP даёт пустой набор, а не соседнее устройство.
- **V — explainability**: проекция возвращает отдельный статус адресного разрешения; карточка объясняет данные SR и поддержку адаптера.
- **VI — local protection**: lookup выполняется только в memory state и не делает сеть; credentials не затрагиваются; runtime получает прежний exact-IP список выбранных устройств.
- **Workflow**: Full SpecKit, TDD для обоих пользовательских сценариев, 25k performance, frontend/Python/reference/security regressions обязательны.

Нарушений constitution нет.

## Project Structure

### Documentation (this feature)

```text
specs/017-polling-target-domain/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── polling-selection-v1.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
app.js                    # selector, plan creation, UI renderer and events
styles.css                # mode selector and target-card layout
tests.js                  # pure projection, UI and performance regressions
product-catalog.js        # Справочник and module description
mvp_runtime/              # unchanged runtime boundary; full regression only
python_tests/             # unchanged runtime tests
docs/
├── architecture.md
├── context-map.md
├── implementation-log.md
└── decisions/
    └── ADR-0017-polling-target-domain.md
```

**Structure Decision**: Реализовать новые способы выбора внутри существующей чистой проекции `deriveAutomaticPollingPlan` и текущего renderer «Загрузка». Не создавать новый runtime endpoint и не менять plan schema: локальному исполнителю по-прежнему важен только уже разрешённый массив устройств.

## Complexity Tracking

Нарушений constitution и дополнительных архитектурных слоёв нет.
