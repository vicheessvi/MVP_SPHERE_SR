# Contract: Portable runtime bootstrap

## Invocation

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\start.ps1
```

`start.ps1` MUST obtain exactly one executable path from `scripts/ensure-node.ps1` and MUST validate its major version before starting `server.js`.

## Resolution order

1. Ready portable runtime matching the pinned manifest.
2. Compatible `node` available to the current user.
3. Compatible bundled Codex runtime, if present.
4. Verified cached official archive under `.runtime/cache/`.
5. HTTPS GET of the exact official pinned artifact.

No network request is allowed for outcomes 1–3.

## Integrity contract

- Architecture MUST be normalized before selecting an artifact.
- URL MUST equal `baseUrl + filename` from the manifest.
- Download MUST use a unique `.partial` path.
- SHA-256 MUST match before extraction.
- Archive MUST contain the expected root and `node.exe`.
- `node.exe --version` MUST equal the pinned version before installation becomes ready.
- Any mismatch MUST stop without starting `server.js`.

## Local boundary

- Allowed writes: `.runtime/` only.
- Allowed external method: HTTPS GET only.
- Forbidden reads: `%LOCALAPPDATA%\MVP_SPHERE_SR`, SR/XLSX, polling JSON, credential files, vault and encrypted objects.
- Forbidden changes: system PATH, registry, machine/user installers, firewall and execution policy.

## Safe failures

Messages distinguish unsupported OS/architecture, official source unavailable, hash mismatch, invalid archive, insufficient space/permissions and concurrent preparation. Messages MUST NOT include tokens, credentials or file contents.
