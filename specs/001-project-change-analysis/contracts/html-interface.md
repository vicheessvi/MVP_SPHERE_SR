# Contract: Direct-open HTML Interface

## Runtime contract

- Точка входа — корневой `index.html`, открываемый двойным кликом через `file://`.
- `index.html` подключает только относительные `styles.css` и plain `app.js`.
- Network requests, external CDN, backend/API и module imports отсутствуют.
- Все screens рендерятся внутри одного root container из локального state.
- Product UI всегда показывает «локальный демонстрационный режим» и ссылку на ограничения данных.

## General UI rules

- Каждой screen state соответствует title и primary heading.
- Native forms имеют labels, validation messages и keyboard-reachable controls.
- Status/severity/confidence передаются текстом, а не только цветом.
- Projects, snapshots и events имеют pagination или ограниченный incremental rendering.
- Ошибка одного файла batch upload не скрывает результаты других файлов.
- Никакие raw secret values не вставляются в HTML или error messages.

## Demo role matrix

| Action | AV Engineer | Administrator |
|---|---:|---:|
| View projects/snapshots/events | Yes | Yes |
| Import snapshots | Yes | Yes |
| Manually map snapshot/project | Yes | Yes |
| Resolve device match | Yes | Yes |
| Assign baseline | Yes | Yes |
| Review/comment events | Yes | Yes |
| Export full local backup | Yes | Yes |
| Manage demo users | No | Yes |
| Configure/apply retention | No | Yes |
| Reset all local state | No | Yes, explicit confirmation |

Матрица управляет обычным UI и не является security boundary.

## Screens and actions

Screen selection хранится в transient `ui.route`; browser URL не используется как router.

### Login

- Local demo login/password form.
- Failed login не различает unknown и inactive user.
- Login screen содержит предупреждение, что credentials хранятся локально и предназначены только для demo.

### Dashboard

- Project count, snapshots, unresolved/critical changes, data-quality/security issues.
- Recent uploads and items requiring review.
- Empty state направляет к первому import.

### Projects

- Filterable project cards/list.
- Project detail: current normalized state, assets, baseline, capturedAt timeline, recent events.
- Manual create/link action доступен после snapshot без stable Project ID.

### Snapshot import

- Native multiple file input with supported format and size guidance.
- Before import user confirms sanitized/authorized data warning.
- Per-file outcome: duplicate, needs mapping, processed, partial, unsupported, failed, quota rejected.
- Snapshot detail показывает metadata, completeness, issues и comparisons.

### Manual project mapping

- Candidate projects and evidence.
- Existing Project selection or new logical Project.
- Filename/IP/MAC показываются как signals, не как guaranteed identity.

### Comparisons

- Previous comparison after import.
- Selected-date comparison form.
- Filterable event list: period, entity, category, type, severity, confidence, review status.
- Event detail: old/new, snapshots, rule, confidence, safe evidence paths and review history.

### Matching review

- Unresolved observations and candidate signals/conflicts.
- Actions: choose Asset, create new Asset, confirm replacement, leave unmatched.
- Ambiguous candidate никогда не pre-label как exact.

### Baseline

- Assign/replace/stop baseline with explicit confirmation.
- Active and historical assignments plus current drift.
- Expiration-pending warning blocks silent local retention deletion.

### Settings

- Demo user management for Administrator.
- Retention days and explicit apply action.
- Full JSON export/import.
- Storage usage estimate and quota recovery guidance.
- Reset demo data/all state with explicit destructive confirmation.
- Persistent security limitations and production migration warning.

## Backup contract

- Export uses Blob URL download with safe filename.
- Import uses native file input and reads one JSON backup.
- Current state remains unchanged until full validation and quota preflight succeed.
- Successful import adds a HistoryEntry.

## Error states

- Invalid JSON/schema: file-specific guidance without raw secret.
- Unsupported version: stored only if quota allows; no comparison.
- Ambiguous timestamp/project/match: explicit manual action.
- Quota exceeded: current state preserved; suggest backup, retention or reset.
- Corrupt saved state: do not silently overwrite it; offer download of raw stored value when possible and explicit reset.
- Missing/cleared storage: initialize clean demo state and explain possible causes.

## Direct-open acceptance

- Reload preserves state in the same browser profile and file path when browser storage permits.
- Application performs no `fetch`, XHR, WebSocket or remote resource request.
- Moving `index.html` or switching browser/profile may create a different storage context; UI documentation states this explicitly.
