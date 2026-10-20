# Acceptance quickstart

1. Start the local Python runtime, load current SR, enter the administrator-provided device pairs in the tool and select a writable result folder.
2. Select one exact Bar 300 by its current SR IP. Run a read-only poll; compare JSON model, serial/MAC, firmware, device time/network and Site name with the device UI. No credential material should appear in the JSON.
3. Exact Box 300 and Box 600 reports and Site name equality were independently confirmed by the administrator. On a later firmware, repeat these checks; model mismatch must still fail before credentials.
4. Run synthetic wrong-model, missing-marker, auth-failure, TLS/timeout and redaction tests. Confirm existing TE/310/Extron routes and manual import remain unchanged.

Checks: `python -m unittest discover -s python_tests -v`; `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`; `node tests.js`; `node scripts/validate-reference.js`; `node --check app.js`; `git diff --check`.
