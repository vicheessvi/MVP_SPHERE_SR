# Quickstart: validate shared Huawei TE30/TE40/TE50/TE60 polling

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

Expected: TE30, TE40, TE50 and TE60 resolve to one transport; all four synthetic flows pass; pre-auth mismatch makes zero credential calls; TE20/TX50 remain network-silent; all previous Extron/Huawei/manual tests pass.

## Controlled live TE30/TE50/TE60 validation

1. Start `START_MVP_SPHERE_SR.py`.
2. Load current SR containing the exact Huawei target and the local XLSX credential pool.
3. Select the output folder and choose the device by its exact IP.
4. Enable the self-signed HTTPS exception only for this run if required.
5. Run one-device polling and retain the generated redacted JSON locally.
6. Verify the expected model, serial/MAC, firmware, time, network and capabilities; verify that no login/password/cookie/token exists.
7. If the run fails, provide only the redacted JSON and safe stage/code for compatibility analysis.

Do not add the real IP, credentials, raw web responses or generated JSON to Git.
