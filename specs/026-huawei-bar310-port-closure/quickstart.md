# Validation Quickstart

Run from repository root with the project Python and development Node runtimes:

1. `python -m unittest discover -s python_tests -v`
2. `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`
3. `node tests.js`
4. `node scripts/validate-reference.js`
5. `node --check app.js`
6. `node --check product-catalog.js`
7. Inspect `git diff --check`, status, secret/artifact/private-IP scan.
8. Controlled live acceptance: exact Bar 310 only, explicit opt-in, one minimal HTTP PUT if required, post-read `enable_http=0`, no Telnet read/write, no secret output.
