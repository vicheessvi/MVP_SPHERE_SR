# Research: secure local polling runtime

## Local protection boundary

**Decision**: Windows-only local runtime bound to `127.0.0.1`; a random one-time launch token creates an HttpOnly SameSite=Strict session. State-changing API calls also require same-origin validation and a custom CSRF header.

**Rationale**: Direct-open browser storage cannot meet disk-bounded storage or secret isolation. Loopback plus an ephemeral session prevents casual access from unrelated browser pages while keeping data on the machine.

**Alternatives**: Remote backend rejected for privacy; Electron/Tauri rejected as a much larger packaging change; IndexedDB rejected because it remains browser-profile storage with quota and plaintext exposure.

## Encryption at rest

**Decision**: Generate a random 256-bit master key, protect it with Windows DPAPI `CurrentUser`, and use unique random 96-bit IVs with AES-256-GCM and 128-bit tags for each stored object.

**Rationale**: DPAPI CurrentUser ties key recovery to the OS account. AES-GCM provides confidentiality and tamper detection; object separation supports atomic replacement.

**Alternatives**: Plain SQLite/files rejected; password-derived key rejected because it adds key recovery UX and risks weak passwords; LocalMachine DPAPI rejected because any machine account could decrypt.

## Storage capacity

**Decision**: No programmatic state/raw quota. Use atomic filesystem writes and report `ENOSPC`; capacity is bounded by disk/filesystem only.

**Rationale**: Meets the user's intent without making an impossible “infinite storage” claim.

## Credentials

**Decision**: Accept JSON and RFC-style CSV with normalized aliases for IP/login/password. Validate all records before atomic vault replacement. Expose only count, hash and masked IP summary.

**Rationale**: Credentials never enter analytics state or browser persistence. The source plaintext file remains under administrator control and should be deleted or protected after import.

## Polling protocols

**Decision**: Implement a real bounded ICMP reachability stage and model-aware adapter manifests. All vendor data collection remains `protocol_required` until official endpoint/auth/response contracts or existing scripts are supplied.

**Rationale**: Manufacturer and model lists are dispatch metadata, not enough information to construct safe APIs. This honors the explicit “do not invent API” requirement.

**Alternatives**: Guessing HTTPS/SSH paths rejected; generic credential spray rejected as unsafe; no scripts at all rejected because ping and routing can be delivered safely now.
