# Quickstart: validate Huawei Bar 310 polling

## Prerequisites

- Windows 10/11 with permitted Python 3.11+.
- Repository checkout with no real credential workbook, device transcript or generated result staged in Git.
- Node.js only for development regression commands.

## Automated validation

```powershell
python -m unittest discover -s python_tests -v
python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py
node tests.js
node scripts/validate-reference.js
node --check app.js
node --check product-catalog.js
git diff --check
```

Expected:

- Synthetic Bar 310 success verifies exact pre-auth model, row-order credentials, cookie/token boundaries, fixed GET resources and best-effort logout.
- Model mismatch blocks `/v1/login/account` entirely.
- Auth rejection, unknown bundle/schema, timeout/TLS and oversize errors return stable safe codes.
- No synthetic result contains credential, cookie or access-token values.
- Exact Bar 310 catalog aliases select only the new transport; unknown Huawei Bar/Box devices remain `protocol_required`.
- Existing TE-family, Extron, job/server, direct-file import and analytics regressions remain green.

## Controlled local acceptance

1. Start with `START_MVP_SPHERE_SR.py`.
2. Load the current SR export and user-selected credentials XLSX.
3. Select one exact Huawei Bar 310 target and enable the existing untrusted-certificate option only if needed for that local device.
4. Select the common result folder and run the plan.
5. Confirm one JSON is written under the timestamped run folder and ACKed before any next target begins.
6. Confirm the result contains Bar 310 identity, firmware, local time, uptime, MAC and capability blocks, plus no login, password, cookie, token, Authorization or raw header/body.
7. Import the folder manually through direct `index.html` mode and confirm the result is analyzable.

Real credentials, target addresses, MACs, serials, firmware transcripts and generated JSON must remain outside the repository and test output.
