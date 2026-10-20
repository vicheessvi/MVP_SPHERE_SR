# Acceptance quickstart

1. Start with `START_MVP_SPHERE_SR.py`, select a writable output folder, enter pairs and run a two-device plan.
2. Force the first JSON write to fail while the folder remains writable; confirm second device is polled and `saveFailed=1` is shown.
3. Close/restart the browser or runtime; relaunch, select the same output folder, reimport the original SR or dedicated target list, enter pairs, press «Продолжить опрос». Verify the saved device JSON is not overwritten.
4. For a management task, interrupt after an uncertain device action; confirm that target is listed for review and not replayed automatically.
5. On each exact Huawei TE20/30/40/50/60, Bar 310, Box 310 and Box 610 terminal with current mailbox markers, verify `siteName.value` and `Device Info.Site Name` match the device UI. Where either marker is missing, verify `protocol_required` and no mailbox request. A failed or invalid response must leave the base poll successful with `siteName.status=unavailable`.

Offline checks: `python -m unittest discover -s python_tests -v`, `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`, `node tests.js`, `node scripts/validate-reference.js`, `node --check app.js`.
