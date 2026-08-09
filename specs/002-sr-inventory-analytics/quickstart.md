# Quickstart Validation Guide: SR inventory and polling history

## Prerequisites

- Current project files including `vendor/xlsx.full.min.js`.
- Modern desktop browser for direct-open acceptance.
- Bundled Node.js for automated checks.
- Synthetic data only for repository tests.

## Automated checks

```powershell
& 'C:\Users\Roman\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check app.js
& 'C:\Users\Roman\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --check tests.js
& 'C:\Users\Roman\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' tests.js
```

Expected: syntax passes; all legacy 61 tests and new inventory/polling tests pass.

**2026-08-09 result**: PASS — syntax checks and 81/81 automated regression/contract/performance tests.

## Scenario 1: SR XLSX inventory

1. Open `index.html` directly and sign in as `admin / admin`.
2. Open the import screen.
3. Select a synthetic XLSX containing VCS, controller and panel rows; omit `Домен`.
4. Import.

Expected: three category inventories are populated; missing domain is `—`; invalid rows are reported without rolling back valid rows.

## Scenario 2: SR synchronization

Import a second synthetic SR where one stable device changes IP, one is new and one old device is absent.

Expected: changed-IP device keeps identity/history; new device is added; absent device remains with `Не в актуальной SR`.

## Scenario 3: Polling folder history

1. Select a folder named `2026-06-01_09-41-28` with JSON files named by IP.
2. Include Primary Controller, TLP, unmatched IP and malformed JSON.
3. Import a second later folder for the matched devices.

Expected: timestamp is 1 June 2026 09:41:28; controller/panel classifications are validated against SR; unmatched/malformed results are retained/reported independently; devices show two snapshots and changes.

## Scenario 4: Ping failure

Import a synthetic Extron result containing `failedStage = ping` and `ping.ok = false`.

Expected: latest ping status is failed; Dashboard and category drill-down identify the device and its location.

## Scenario 5: Idempotency

Import the same folder/files again.

Expected: no duplicate PollingResult or DeviceChange is created.

## Scenario 6: Unknown analytics

Open Dashboard without authorization/reboot/GCPlus rules.

Expected: cards state that the metric is unavailable; no zero/demo value implies detection support.

## Scenario 7: Polling plan

Choose Extron and non-Extron devices and create a plan.

Expected: selection/count/time/support are visible; start is blocked with `not implemented`; no request or credential persistence occurs.

## Regression

- Existing Project/Snapshot import, matching, baseline, review, backup and retention tests remain green.
- Existing legacy audit screens remain reachable.
- App performs no network request at runtime.
- `.gitignore` prevents local SR, run folders, databases, backups and secrets from being added accidentally.

## Manual limitation

Automation in this environment may not navigate to `file://` URLs. If blocked, direct-open UI acceptance must be performed manually and reported separately; this must not be bypassed with an alternate browser surface.

**2026-08-09 result**: BLOCKED BY TOOL POLICY — browser-control запрещает `file://`. Базовая версия ранее была подтверждена пользователем, но изменённые Dashboard/SR/polling screens требуют повторного ручного открытия `index.html`. Это не считается automated visual PASS.
