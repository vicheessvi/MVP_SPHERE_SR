# Verification

1. Run `python -m unittest discover -s python_tests` and `node tests.js`, then `node scripts/validate-reference.js`.
2. On a connected exact Group 310, run read-only polling with explicit TLS decision and compare one field at a time with its web-menu value.
3. Inspect the resulting JSON: nine `deviceSettings` groups have explicit statuses; Site name still equals the exact System Name.
4. Import the result with current SR and inspect the existing settings fact table/XLSX; verify mismatched IP/model and malformed fields do not produce facts.
5. Exercise synthetic exact Group 300/500/700 and bundle-drift tests; new successful results are confirmed, historical provisional imports stay provisional, and Group 300 with HTTP-only firmware remains unsupported by this HTTPS path.
6. SSH amendment: on firmware without `Enable SSH Service`, confirm `legacy_api_fallback` and a qualified audit label. On a synthetic menu/bundle with a proven primary checkbox, confirm direct priority; malformed/failed primary must not fall back. A real device with that primary checkbox is still needed to confirm its status.
