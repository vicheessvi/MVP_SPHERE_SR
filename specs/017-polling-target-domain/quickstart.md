# Quickstart: Validate polling target selection

## Automated validation

```powershell
node tests.js
node scripts/validate-reference.js
node --check app.js
node --check product-catalog.js
python -m unittest discover -s python_tests -v
python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py
git diff --check
```

Expected:

- Unique current-SR IP resolves to exactly one card and one planned device.
- Invalid, absent, historical-only and duplicate IP resolve fail-closed with zero devices.
- Domain `Все`, one, multiple and `Не указано` preserve intersection and cascade reset rules.
- 25 000-device projection remains below the stated limit.
- Existing Extron/Huawei/runtime/manual-import tests remain green.
- No credentials or real infrastructure data appear in tracked changes.

## Local acceptance

1. Start `START_MVP_SPHERE_SR.py` and import an SR workbook containing `Домен`.
2. In «Загрузка» → «План автоматического опроса», select «По IP-адресу».
3. Enter a unique IP from the current SR and verify the device card before any network activity.
4. Complete the existing output-folder, XLSX credential, schedule and TLS choices; start the plan and verify exactly one JSON is written to the timestamp folder.
5. Switch to «По фильтрам», select one or more domains and verify the remaining filters and counts.
6. Select «Все домены» and confirm the previous mass-plan device set is restored.
7. Open direct `index.html` and confirm selection UI can be inspected but network start remains blocked.

Use only local production data. Do not copy real IP, MAC, serial, credentials or poll output into Git or test logs.
