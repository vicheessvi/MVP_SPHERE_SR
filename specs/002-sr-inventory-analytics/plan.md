# Implementation Plan: SR inventory, polling history and analytics

**Branch**: `not-created` | **Date**: 2026-08-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-sr-inventory-analytics/spec.md`

## Summary

Расширить существующий direct-open browser-only MVP цельным вертикальным срезом: локально разобрать SR XLSX, сформировать device-centric inventory, импортировать папки прошлых JSON polling runs, связать results с устройствами, накопить историю, вычислить ping/change analytics и отобразить Dashboard/VCS/Controller/Panel модули. Существующий Extron project snapshot pipeline сохраняется. Реальный network polling не имитируется: добавляется registry/contract adapters и UI support state, а транспорт остаётся заблокированным до предоставления протокола и auth examples.

Технически сохраняются `index.html` + `styles.css` + `app.js` и dependency-free test harness. Для надёжного offline-чтения XLSX добавляется локально vendored SheetJS CE 0.20.3 standalone build; CDN/runtime network calls отсутствуют. State получает совместимую v1→v2 migration и новые массивы inventory/polling сущностей.

## Technical Context

**Language/Version**: HTML5, CSS3, Vanilla JavaScript уровня современных evergreen desktop browsers; bundled Node.js 24 для проверок

**Primary Dependencies**: локально vendored SheetJS Community Edition 0.20.3 (`vendor/xlsx.full.min.js`), Apache-2.0; package manager и runtime CDN не требуются

**Storage**: versioned browser `localStorage` state v2; raw polling JSON + hash; SR binary не сохраняется, сохраняются hash/import metadata и raw row values; полный JSON backup/restore

**Testing**: существующие `tests.html` + `tests.js`; synthetic in-memory XLSX и JSON fixtures; Node syntax/regression checks

**Target Platform**: локальный desktop browser; прямой запуск `file://.../index.html`

**Project Type**: автономное статическое browser application

**Performance Goals**: SR до 1 000 строк импортируется до 10 секунд; batch из 100 polling JSON не блокирует обработку из-за одного файла; таблица ограничивает рендер большим, но конечным количеством строк

**Constraints**: no backend, no network calls, no fake device APIs, no stored credentials, offline operation, user data never committed, localStorage quota remains a runtime limit

**Scale/Scope**: один локальный browser profile; первый vertical slice для inventory/history/analytics; реальное polling execution и background scheduling out of scope until protocol/runtime ADR

## Constitution Check

### Pre-design gate

| Principle | Plan evidence | Status |
|---|---|---|
| I. Неизменяемые исходные доказательства | Polling JSON сохраняется raw + SHA-256; SR сохраняет file hash и raw row fields; normalized values ссылаются на result/row | PASS WITH EXISTING BROWSER-STORAGE EXCEPTION |
| II. Идентичность предшествует сравнению | inventory/serial/serial+manufacturer приоритетнее IP; unmatched/conflicts не превращаются в достоверные changes | PASS |
| III. Детерминированная нормализация | Pure row/result normalizers, raw values retained, versioned state and rules, synthetic pair tests | PASS |
| IV. Безопасная работа с неполными данными | Row/file issues isolated; missing fields become unknown; batch continues | PASS |
| V. Разделение событий и объяснимость | Poll status, ping, auth/reboot/GCPlus unknown states and DeviceChange provenance separated | PASS |
| VI. Защита инфраструктурных данных | Offline vendored parser, no network/logged credentials, `.gitignore`, no device auth implementation | TEMPORARY EXCEPTION: browser storage/demo login are not a security boundary |
| Workflow и контроль качества | New Full SpecKit feature, contracts, synthetic tests, compatibility migration | PASS |

Gate result: **PASS WITH DOCUMENTED TEMPORARY EXCEPTION** inherited from ADR-0003. The feature does not expand security claims: real credentials remain excluded, and sensitive production use still requires a packaged/server storage ADR.

### Post-design gate

Design keeps raw polling evidence, preserves legacy state, records unmatched/conflicting inputs, and does not add network transport. The only external code is a pinned offline parser with license and provenance. No new unjustified constitution violation is introduced.

## Project Structure

### Documentation (this feature)

```text
specs/002-sr-inventory-analytics/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/
│   └── requirements.md
└── contracts/
    ├── sr-xlsx-import.md
    ├── polling-result-import.md
    ├── polling-adapter.md
    └── html-interface.md
```

### Source Code (repository root)

```text
index.html                  # loads vendored XLSX parser then application
styles.css                 # existing components plus inventory/dashboard layouts
app.js                     # state v2, import, normalization, analytics, UI
tests.html                 # browser harness with vendored parser
tests.js                   # existing + new regression tests
vendor/
├── xlsx.full.min.js       # pinned SheetJS CE 0.20.3 standalone build
└── LICENSE.sheetjs.txt
tests/
└── fixtures/              # existing JSON fixtures; new data created synthetically in tests
docs/
├── architecture.md
├── project-vision.md
├── context-map.md
├── implementation-log.md
└── decisions/ADR-0004-sr-inventory-xlsx-extension.md
```

**Structure Decision**: сохранить текущий минимальный runtime boundary и монолитное plain-script приложение, поскольку переход на backend/framework не нужен для импортного vertical slice и был бы несогласованным масштабным refactor. Новые функции добавляются именованными секциями в `app.js`, экспортируются через существующий `MvpSphereSR` test surface. SheetJS vendored локально и не требует установки пользователем.

## Runtime Flow

```text
open index.html
  → load/migrate local state v1→v2
  → import SR XLSX locally
  → SheetJS rows → validate headers → normalize/classify → merge inventory
  → select/import polling run folder
  → parse folder timestamp + filename IP + JSON
  → match inventory + classify Extron Controller Type
  → preserve raw result/hash → normalized status
  → reconcile per-device history → DeviceChange
  → compute analytics projection
  → render Dashboard / VCS / Controllers / Panels / device detail
```

## State and Compatibility Strategy

- Use state version 2 and `mvpSphereSrState.v2`.
- On first v2 load, read legacy `mvpSphereSrState.v1`, migrate existing users/projects/snapshots unchanged, add empty new arrays/settings, then save v2 atomically.
- Backup validation accepts v1 and migrates to v2; active session remains outside persistent state.
- Inventory sync never deletes a Device or PollingResult; absent devices receive `inCurrentSr: false`.
- Analytics is derived from inventory/latest results and is not duplicated as authoritative state.
- Existing Project/Asset/ChangeSet behavior remains available through legacy audit screens.

## Dependency Decision

SheetJS CE 0.20.3 is vendored because browser platforms have no built-in XLSX reader. The official documentation recommends vendoring the standalone build for stability and offline use. The script is loaded from a local relative path before `app.js`; data never leaves the browser. See `research.md` and ADR-0004.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| External vendored runtime file added to previously dependency-free app | Reliable XLSX parsing is a core requirement | Hand-written ZIP/OOXML parsing is higher-risk and would be a larger custom subsystem; CDN would violate offline/privacy requirements |
| State v2 remains in browser storage | Minimal compatible vertical slice over existing architecture | Backend/desktop packaging would be a project rewrite and requires deployment/security choices not provided |
| Real polling not implemented | Protocol/auth/examples absent and browser runtime cannot safely schedule closed-tab work | Fake endpoints or simulated success would violate explicit requirements and data integrity principles |
