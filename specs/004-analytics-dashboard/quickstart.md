# Quickstart: Dashboard validation

## Automated

```powershell
node --check app.js
node --check tests.js
node tests.js
node runtime-tests.js
node server-tests.js
```

Expected: dashboard scenarios for empty state, inventory, latest result, ping failure, unsupported, VIP, unmatched/data error, change, period separation and de-duplication pass; existing suites remain green.

## Manual local acceptance

1. Start with `powershell -ExecutionPolicy Bypass -File .\start.ps1`.
2. On an empty state verify the «Нет SR» action opens Upload.
3. Import a synthetic SR and verify category inventory plus «polling отсутствует» without failures.
4. Import two synthetic polling folders for the same devices.
5. Verify latest-state KPI uses the newer result and period KPI changes with period selector.
6. Apply category/manufacturer/model/location/VIP/status filters.
7. Open ping/failed/change/VIP drill-down and verify inventory filters.
8. Verify authorization/reboot/GCPlus show «Недостаточно данных», not zero.
9. Verify long labels wrap/truncate safely and lists remain limited.

Do not use real credentials or infrastructure data for acceptance fixtures.

## Validation result — 2026-08-10

- `node --check app.js`, `node --check tests.js`: PASS.
- Regression/contract/performance: 93/93 PASS.
- Secure runtime: 9/9 PASS.
- Loopback server integration: 1/1 PASS.
- Performance fixture: 5,000 devices / 25,000 results completed below the 2-second budget.
- Browser acceptance: empty SR action, synthetic XLSX import, polling folder import, populated Dashboard and controller KPI drill-down PASS.
- Layout: 1280 px viewport had `scrollWidth == clientWidth`; no horizontal overflow.
- Blocked analytics render «Недостаточно данных» / «Порог не настроен» rather than invented zeros.
