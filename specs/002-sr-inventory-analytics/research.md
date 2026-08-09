# Research: SR inventory, polling history and analytics

## Decision 1: XLSX parser

**Decision**: Vendor SheetJS Community Edition 0.20.3 standalone `xlsx.full.min.js` and its Apache-2.0 license into `vendor/`.

**Rationale**: Browsers do not expose a native XLSX parser. The official SheetJS standalone documentation identifies 0.20.3 as the current version, exposes a plain `window.XLSX` global suitable for the existing no-module application, and explicitly recommends vendoring for stability/offline deployments. Local vendoring ensures SR bytes are never transmitted to a CDN.

**Alternatives considered**:

- Hand-written ZIP + OOXML parser: rejected as a large, error-prone subsystem unrelated to product differentiation.
- Runtime CDN: rejected because the tool must work locally and not depend on external services while handling SR data.
- New package/bundler pipeline: rejected because the current direct-open runtime needs no build and users should not install dependencies.

**Primary sources**:

- https://docs.sheetjs.com/docs/getting-started/installation/standalone/
- https://cdn.sheetjs.com/

## Decision 2: Browser-only vertical slice

**Decision**: Keep the current static runtime for inventory and historical import; do not add backend, task queue or fake polling.

**Rationale**: The existing application and tests are browser-only. The user explicitly requires minimal changes and forbids guessing APIs. Importing prior polling folders provides an end-to-end inventory/history/analytics slice without claiming unsupported network functionality.

**Alternatives considered**:

- Python/Django or Node backend: capable of scheduling and credentials, but requires a major architecture/deployment decision and supersedes direct-open behavior.
- Electron/Tauri: appropriate for future local secure filesystem/polling, but requires packaging and an explicit ADR.

## Decision 3: Device identity and SR synchronization

**Decision**: Use a conservative merge priority: existing exact inventory number, then serial number scoped by manufacturer, then MAC, then current IP; ambiguous matches create issues and new Device records rather than silently merging.

**Rationale**: The constitution requires stable identity before comparison and explicitly states that IP/MAC may change. Inventory and serial are the strongest fields supplied by SR. No complex entity-resolution model is justified for the first slice.

**Alternatives considered**:

- IP-only identity: rejected because IP can change and would lose history.
- Fuzzy name/location matching: rejected because it can silently merge different devices.

## Decision 4: Polling result normalization

**Decision**: Preserve raw JSON and derive a compact canonical status plus a recursively normalized payload for device-level diff. Default ignored/volatile paths are empty and configurable.

**Rationale**: Existing Extron normalization and SHA-256 helpers can be reused, but new polling results are device-centric rather than project-centric. An empty ignored list respects the requirement not to invent volatile fields.

**Alternatives considered**:

- Diff raw JSON text: rejected because formatting/key order would create false changes.
- Large hard-coded ignored list: rejected because no reliable list was provided.

## Decision 5: Analytics evidence levels

**Decision**:

- Ping failure: implemented only when normalized `failedStage` equals `ping` and `ping.ok` (case-insensitive block lookup) is `false`.
- Authorization failure: normalized field exists but remains `unknown` until a fixture/rule is supplied.
- Reboot: `rebootCount` remains `null` and dashboard marks unavailable until an uptime/reboot event contract is supplied.
- GCPlus: `gcPlus` remains `null` until a reliable field/example is supplied.

**Rationale**: This distinguishes supported analytics from unknowns and avoids heuristics.

## Decision 6: Scheduling and credentials

**Decision**: Store only a polling plan/run selection and adapter capability; do not store credentials and do not execute network calls without a registered real adapter.

**Rationale**: A direct-open page cannot reliably execute background work after the tab closes and has no secure credential store. The UI can still show selection, timing and blocked support truthfully.

**Alternatives considered**:

- Save credentials in localStorage: rejected as insecure and explicitly forbidden.
- Implement ad hoc browser fetch calls: rejected because endpoints, auth and CORS behavior are unknown.
