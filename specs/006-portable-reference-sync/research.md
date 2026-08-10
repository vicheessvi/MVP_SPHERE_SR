# Research: Переносимый запуск и синхронизация Справочника

## Decision 1: Закреплённый portable Node.js 24 LTS

**Decision**: Use official Node.js v24.19.0 LTS Windows ZIP artifacts for x64 and ARM64 with repository-pinned SHA-256 values from the official `SHASUMS256.txt`.

**Rationale**: Node.js recommends supported LTS for production. A portable ZIP requires no elevation or system PATH change. Pinning version and hash prevents a moving `latest` target from becoming executable without a reviewed repository change.

**Official sources**:

- `https://nodejs.org/en/about/previous-releases`
- `https://nodejs.org/download/release/v24.19.0/`
- `https://nodejs.org/download/release/v24.19.0/SHASUMS256.txt`

**Pinned artifacts**:

- x64: `node-v24.19.0-win-x64.zip`, SHA-256 `57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73`
- ARM64: `node-v24.19.0-win-arm64.zip`, SHA-256 `8502f4a50b458d4cc38ed8f2001556c2cd239d464920f74017926ccb1e1c157f`

**Alternatives considered**:

- Commit Node binaries to Git — rejected due repository size, opaque diffs and update burden.
- Install MSI/winget — rejected because it changes system state and may require elevation or unavailable package policy.
- Download `latest-v24.x` and its checksum together — rejected because TLS compromise could replace both and updates would bypass code review.
- Package as a single executable — deferred; adds a build/signing/release supply chain not present in the project.

## Decision 2: Per-PC protected data remains independent

**Decision**: A GitHub copy starts with a new `%LOCALAPPDATA%\MVP_SPHERE_SR` protected by a DPAPI CurrentUser key on that Windows profile.

**Rationale**: OS-bound encryption is the current security guarantee. Making the same encrypted vault portable would either fail on another profile or require a new passphrase/key-distribution design.

**Alternatives considered**:

- Copy DPAPI files — rejected; not portable across machine/profile boundary.
- Store a shared key in Git — prohibited.
- Add password-encrypted migration — valid future feature, excluded from this scope.

## Decision 3: Declarative shared product catalog

**Decision**: Put module descriptors and presentation dictionaries in one dependency-free UMD catalog consumed by browser UI and Node tests.

**Rationale**: Runtime derivation removes the stale generated-file problem. Navigation and module help cannot diverge because both map the same immutable descriptors.

**Alternatives considered**:

- AI rewrite after every source edit — rejected as nondeterministic and unavailable offline.
- Generate a second help file on every start — rejected because generated artifacts can be stale and duplicate content.
- Keep manual documentation plus reminders — rejected because it does not satisfy automatic synchronization.

## Decision 4: Validation instead of invented semantics

**Decision**: Automatically synchronize only registered modules, status labels and tooltip-backed explanations. Require explicit narrative metadata for new behavior and fail checks when it is missing.

**Rationale**: Code cannot safely infer business meaning, especially for SR, GCPlus, reboot rules or vendor behavior. A fail-closed completeness gate is safer than fabricated help.

## Decision 5: Windows GitHub quality gate

**Decision**: Run code-only suites and catalog validation on a Windows GitHub Actions runner.

**Rationale**: PowerShell 5.1 parsing and DPAPI behavior are Windows-specific. Repository fixtures are synthetic and no operational data or credentials are required.

**Alternatives considered**:

- Linux-only CI — rejected because it cannot validate DPAPI or Windows launcher behavior.
- No CI — rejected because catalog drift could reach the main branch unnoticed.
