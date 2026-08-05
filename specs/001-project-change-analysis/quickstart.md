# Quickstart Validation Guide: Browser-only MVP_SPHERE_SR

## Prerequisites after implementation

- современный desktop browser;
- папка приложения с `index.html`, `styles.css` и `app.js`;
- только synthetic/sanitized test snapshots.

Установка Python, Node.js, package manager, database или local server не требуется.

## Run

1. Открыть корневой `index.html` двойным кликом.
2. Убедиться, что адрес начинается с `file://`.
3. Подтвердить предупреждение о локальном demo storage.
4. Войти demo-пользователем Administrator или AV Engineer.

## Automated browser checks

Открыть `tests.html` двойным кликом и получить PASS для contract, normalization, matching, diff, late snapshot, baseline, retention и backup tests.

`node --check app.js` допускается как дополнительная syntax check только если Node.js уже установлен; установка Node не требуется для работы приложения.

## Validation status — 2026-08-03

- Automated dependency-free suite: **58/58 PASS** через bundled Node.js.
- JavaScript syntax: **PASS** для `app.js` и `tests.js`.
- Performance control: **PASS** для 10 snapshots × 100 synthetic devices, combined raw input ≤3 МиБ, обработка <10 секунд.
- Static runtime boundary: backend, package manager и внешние runtime dependencies отсутствуют.
- In-app browser попытался открыть `tests.html` как `file://`, но среда автоматизации запретила локальный URL своей browser policy. Обход не выполнялся.
- **Manual direct-open acceptance: PASS.** Пользователь 2026-08-03 подтвердил открытие `tests.html` двойным кликом с результатом 58/58 PASS, запуск `index.html` и рабочий вход `admin / admin`.
- Пользователь подтвердил работоспособность запрошенных ручных сценариев; browser/version не указаны.
- `T059`: **COMPLETE**.

### Session lifecycle update — 2026-08-04

- Automated suite после переноса demo-session в `sessionStorage`: **61/61 PASS**.
- Persistent `localStorage` state и JSON backup не содержат активного пользователя (`currentUserId: null`).
- Старый сохранённый `currentUserId` очищается при первом запуске обновлённой версии.
- Targeted manual recheck: открыть приложение, войти, перезагрузить вкладку (вход должен сохраниться), закрыть вкладку и открыть `index.html` снова (должна появиться форма входа).

## Required synthetic fixtures

```text
tests/fixtures/
├── expectations.js
├── extron-v1/
│   ├── baseline.json
│   ├── ip-changed.json
│   ├── mac-changed.json
│   ├── device-added.json
│   ├── device-removed-complete.json
│   ├── device-missing-unknown.json
│   ├── formatting-only.json
│   ├── late-snapshot.json
│   ├── secret-present.json
│   └── unsupported-version.json
└── legacy/
    ├── sample-a.json
    └── sample-a-reordered.json
```

## Scenario 1: Direct launch and persistence

1. Open `index.html` by double-click.
2. Confirm no network/server instruction appears.
3. Change one harmless local setting.
4. Reload the page.

Expected: app loads via `file://`, setting persists in the same profile/path, local-demo warning remains accessible.

## Scenario 2: First legacy import

1. Sign in as AV Engineer.
2. Import sanitized `legacy/sample-a.json`.
3. Verify hash/schema profile and `needs_project_mapping`.
4. Map it to a new logical Project.

Expected: legacy completeness warnings are visible; no comparison for first snapshot.

## Scenario 3: IP/MAC changes on same Asset

Import baseline, `ip-changed.json` and `mac-changed.json` with stable serial.

Expected: one field event per change for the same Asset, with old/new values, confidence and JSON paths; no remove/add pair.

## Scenario 4: Confirmed versus possible removal

Compare baseline with complete-removal and unknown-completeness fixtures.

Expected: `confirmed_removal` only for complete; otherwise `possible_removal`, quality issue and no automatic Asset retirement.

## Scenario 5: Formatting-only difference

Import `formatting-only.json`.

Expected: raw hash may differ, but configuration ChangeEvent count is zero.

## Scenario 6: Duplicate and batch isolation

Import the same bytes twice together with an unsupported file.

Expected: duplicate references existing Snapshot; unsupported file gets its own result; successful files remain processed.

## Scenario 7: Late snapshot

Import dates 1 and 3, then date 2.

Expected: timeline becomes 1→2→3; old 1→3 is superseded; active previous comparisons are 1→2 and 2→3.

## Scenario 8: Baseline drift

Assign date 1 baseline and import two later snapshots retaining the same drift.

Expected: latest previous diff may be empty, while baseline drift remains visible.

## Scenario 9: Review and demo roles

1. Review an event twice with different decisions.
2. Resolve an ambiguous match.
3. Sign in with each demo role.

Expected: decision history is append-only in ordinary UI; Administrator-only settings are hidden from AV Engineer; every role sees the warning that this is not real authorization.

## Scenario 10: Secret detection

Import `secret-present.json` after sanitized-data confirmation.

Expected: secret marker creates security issue; ordinary UI/history/error text does not reveal the value; settings explain that raw local state is not secure storage.

## Scenario 11: Backup, reset and restore

1. Export full JSON backup.
2. Reset local state with explicit confirmation.
3. Import the backup.

Expected: projects, snapshots, ChangeSets, baselines, reviews and history restore; malformed backup never replaces current state.

## Scenario 12: Retention

With a controlled test clock, create expired/current snapshots and an expired active baseline, then apply retention.

Expected: ordinary expired content is removed with RetentionAudit; baseline becomes expiration_pending; no equipment ChangeEvent is created.

## Scenario 13: Quota-safe failure

Attempt to import a synthetic backup larger than the available/preconfigured state limit.

Expected: app reports quota/preflight failure, current state remains byte-equivalent after reserialization, and backup/recovery guidance is shown.

## Scenario 14: Performance acceptance

Load up to 10 projects, 100 devices and 10 snapshots with combined raw size no more than 3 MiB.

Expected: new comparison completes within 10 seconds and ordinary screen rerender within 2 seconds in the acceptance browser.

## Completion criteria

- `tests.html` reports no failures;
- all applicable manual scenarios pass;
- app performs no network requests;
- no real/unsanitized infrastructure snapshot is committed to the repository;
- temporary constitution exceptions remain visible in UI/docs and are not described as production security.
