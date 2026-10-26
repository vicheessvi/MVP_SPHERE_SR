# Validation guide: Polycom RealPresence Group polling

1. Run `python -m unittest discover -s python_tests -v` and `python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py`.
2. Run `node tests.js` and `node scripts/validate-reference.js` (Node is development-only).
3. Launch `START_MVP_SPHERE_SR.py`, load an SR export containing an exact Group 310 and enter credentials only into the current session. Select the exact device IP in the automatic plan and choose a results folder.
4. If the device uses an untrusted certificate, explicitly approve the existing current-run insecure-TLS option; never make it the default.
5. Compare the resulting JSON's exact model, serial, MAC and firmware with the device UI. Check that the output contains no password, cookie or token and that the device settings are unchanged.
   Numeric REST time/uptime fields are labeled raw until their units are independently verified; do not derive reboot timestamps from them yet.
6. Group 310, Group 500 and Group 700 have separate administrator-confirmed successful polls. Group 300 with 4.1.5-180072 failed HTTPS validation; software 5.0+ is only a candidate for testing, not a guarantee. Test exact Group 300 on a real 5.0+ device and inspect its JSON before confirming support. Keep wrong-model and unknown-firmware rejection; do not use HTTP for credentials.

No target IP, password or raw device response belongs in this repository.
