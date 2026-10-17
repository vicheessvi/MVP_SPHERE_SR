# Validation Quickstart: Huawei 310 HTTP-only management

1. Run `python -m unittest discover -s python_tests -v` and `node tests.js` from the project root.
2. Run `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`, `node --check app.js`, `node --check product-catalog.js`, and `node scripts/validate-reference.js`.
3. Check exact Bar 310, Box 310 and Box 610 plans: their existing polling transports remain separate; the management task is explicit and receives the same selected-target allowlist.
4. For each model's synthetic transport, verify HTTP already `0` (no write), HTTP `1` (one minimal PUT then post-read `0`), missing markers, identity mismatch, unexpected schema, failed verification and redaction.
5. Verify zero Telnet configuration requests and that `not_exposed` does not claim TCP/23 was measured or closed.
6. Controlled live acceptance, separately for exact Box 310 and Box 610: user selects one device, authorizes the task, observes the safe JSON action result and confirms HTTP setting by post-read. Do not intentionally enable HTTP to manufacture the test. Until then, label Box action validation provisional.
7. Inspect `git diff --check`, staged/untracked files, and secret/artifact/private-IP scans before any user-authorized commit.
