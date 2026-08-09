# Quickstart: secure local runtime

1. Run `powershell -ExecutionPolicy Bypass -File .\start.ps1`.
2. Use the automatically opened loopback URL; direct `index.html` is not the protected mode.
3. Import SR and polling result files, then restart runtime and verify persistence.
4. Import a synthetic credentials JSON/CSV in Upload; verify only count/masked summary is displayed.
5. Run a synthetic polling plan through `node scripts/poll-devices.js --plan tests/fixtures/polling-plan.json --out <temporary folder>`.

## Automated checks

```powershell
node --check app.js
node --check server.js
node --check runtime/security.js
node --check runtime/secure-store.js
node --check runtime/credential-vault.js
node --check runtime/model-catalog.js
node --check runtime/polling.js
node --check scripts/poll-devices.js
node tests.js
node runtime-tests.js
node server-tests.js
```

Expected: all tests pass; persisted fixtures contain no plaintext synthetic password; state larger than 4 MiB round-trips; non-loopback/non-SR targets and undocumented provider execution fail closed.

## Validation result — 2026-08-10

- Syntax checks: PASS for `app.js`, server, runtime, CLI and test files.
- Existing regression/contract/performance suite: **81/81 PASS**.
- Secure runtime suite under the actual Windows CurrentUser profile: **9/9 PASS**.
- Loopback server integration: **1/1 PASS**.
- Encrypted state of more than 5 MiB round-tripped successfully; persisted object did not contain the plaintext marker.
- Credential summary and API responses did not contain the synthetic password; direct generic access to the vault returned 403.
- Cross-origin mutation was rejected with 403.
- Navigation assertion confirms that legacy audit routes are absent.
- Source/artifact scan found no real credential file, key envelope, encrypted runtime object or polling output in the repository.

Manual acceptance should use `start.ps1`. Direct `index.html` is intentionally blocked for protected operation.
