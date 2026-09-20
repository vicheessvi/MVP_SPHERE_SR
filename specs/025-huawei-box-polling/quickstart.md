# Quickstart: Huawei Box 310/610 contract validation

1. Run `python -m unittest discover -s python_tests -v`.
2. Run `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`.
3. Run `node tests.js` and `node scripts/validate-reference.js`.
4. Run `node --check app.js` and `node --check product-catalog.js`.
5. Confirm catalog resolves Box 310 and Box 610 to different transports and no management action.
6. On the working computer, start `START_MVP_SPHERE_SR.py`, load the normal SR and memory-only XLSX credentials, select one exact Box model/IP and allow the local certificate only for the current job if required.
7. Expected success: correct separate contract ID, provisional evidence status, five compatible blocks, no secrets.
8. Expected safe incompatibility: `unsupported_web_contract`, `target_model_mismatch` or `resource_schema_unconfirmed`; report the safe status and firmware/model, not credentials or raw responses.
9. Run the secret/private-IP/artifact scan before any commit.
