# Quickstart: Python runtime migration

## User acceptance

1. Confirm Windows 10/11 x64 has Python 3.11 or newer and no Node.js requirement.
2. Copy the repository to a normal path, a path with spaces and a path containing Cyrillic.
3. Double-click `START_MVP_SPHERE_SR.py` in each location.
4. Confirm the browser opens a random `127.0.0.1` URL and the «Загрузка» screen identifies automatic mode.
5. Load synthetic SR and synthetic credential XLSX, select an empty output folder and run a synthetic Extron target.
6. Confirm a dated folder and redacted JSON are written, progress waits for each save, and cancellation clears the session pool.
7. Close runtime, open `index.html` directly and confirm manual folder import and analytics still work.

## Development validation

```powershell
python -m unittest discover -s python_tests -v
node tests.js
node scripts\validate-reference.js
```

The PowerShell code fence documents a developer shell only; production users do not run commands.

Expected outcomes:

- Python tests pass API, XLSX, catalog, Extron, allowlist, lifecycle, redaction and integration contracts.
- Existing frontend regression remains green.
- Secret/artifact scan reports no real credentials, IP data or polling output.
- `git diff --check` passes.

## Failure acceptance

- Python older than the supported minimum: local Russian error before server bind.
- Missing required static/catalog file: fail before browser/device network.
- Invalid XLSX or plan: safe 4xx and credential clear.
- Self-signed TLS without explicit consent: safe adapter failure; no HTTP fallback.
- Save NACK or cancellation: terminal safe status; no next device.
