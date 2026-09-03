# Quickstart: validate Huawei TE40 polling

## Prerequisites

- Windows 10/11 with permitted Python 3.11+.
- Repository checkout with no real credentials, device transcripts or poll results staged in Git.
- Node.js only for development regression commands.

## Automated validation

```powershell
python -m unittest discover -s python_tests -v
python -m compileall -q mvp_runtime python_tests START_MVP_SPHERE_SR.py
node tests.js
node scripts/validate-reference.js
```

Expected:

- Synthetic Huawei success verifies login order, cookie, CSRF and the fixed resource allowlist.
- Auth rejection, active session, unsupported bundle, malformed response, timeout/TLS and redaction scenarios return stable safe errors.
- Catalog routes exact TE40 to Huawei contract v1 while TE20 and unknown Huawei models remain `protocol_required` without network attempts.
- Existing Extron, polling job, server, manual import and analytics tests remain green.

## Local acceptance

1. Start the project through `START_MVP_SPHERE_SR.py`.
2. Load the SR export and the user-selected credentials XLSX.
3. Build a plan containing one exact Huawei TE40 target and explicitly enable insecure TLS only if its local certificate is not trusted.
4. Select the common result folder and start polling.
5. Confirm that one JSON appears in the timestamped run folder and is ACKed before the next device begins.
6. Confirm that the JSON contains Huawei identity, firmware, device time, network and capability blocks but contains no login, password, Authorization, cookie, token or raw header.
7. Import the same common folder manually through direct `index.html` mode and confirm the result remains analyzable.

Real credentials, IPs, MACs, serials and resulting JSON must remain outside the repository and test output.
