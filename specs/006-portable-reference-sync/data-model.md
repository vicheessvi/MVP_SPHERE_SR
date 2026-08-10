# Data Model: Переносимый запуск и синхронизация Справочника

## PortableRuntimeManifest

- `schemaVersion`: positive integer, currently `1`.
- `runtime`: fixed product identifier (`node`).
- `version`: exact reviewed semantic version.
- `minimumMajor`: minimum compatible installed runtime major.
- `baseUrl`: HTTPS official release directory with exact version.
- `artifacts`: object keyed by normalized `x64` and `arm64`.
  - `filename`: basename only, no path separators.
  - `sha256`: exactly 64 lowercase hexadecimal characters.
  - `archiveRoot`: expected single top-level folder.

Validation: unknown architecture, non-HTTPS base URL, moving `latest` URL, malformed filename/hash, or inconsistent archive root fails before download.

## PortableRuntimeInstallation

- `manifestVersion`: manifest schema version.
- `runtimeVersion`: exact version verified at installation.
- `architecture`: `x64` or `arm64`.
- `archiveSha256`: pinned artifact hash.
- `verifiedAt`: informational local timestamp.
- `executableRelativePath`: normalized path within the installation.

Lifecycle: `absent → downloading → hash_verified → extracting → ready`. Any failure before `ready` removes staging; a ready prior version is not overwritten by partial work.

## ModuleDescriptor

- `route`: stable unique navigation identifier.
- `renderer`: identifier of an implemented local rendering strategy.
- `title`: non-empty Russian user-facing title shared by navigation and Reference.
- `summary`: concise user-purpose description.
- `details`: data source and behavior explanation.
- `keywords`: normalized search aliases.
- `order`: unique display order.
- `category`: optional raw inventory category for equipment routes.
- `contextHelp`: whether «О модуле» is available.
- `helpId`: deterministic `module-<route>` identifier.

Relationships: exactly one module descriptor produces one navigation item and one Reference module entry. Equipment descriptors may produce inventory route configuration.

## PresentationDictionary

- Named groups: categories, polling statuses, ping statuses, capabilities, run statuses, import outcomes and tooltips.
- Keys: immutable raw/internal codes.
- Values: non-empty Russian labels or explanations.

The dictionary changes presentation only. Raw SR/JSON and persisted enum values remain unchanged.

## ReferenceProjection

- `sections`: ordered immutable sections.
- Generated module section: derived from every ModuleDescriptor.
- Generated status section: derived from status descriptors linked to PresentationDictionary keys.
- Explicit sections: narrative terms whose meaning cannot be inferred.

## ConsistencyReport

- `ok`: true only when errors are empty.
- `errors`: deterministic safe messages containing catalog IDs, never operational data.
- `counts`: modules, generated module entries, status descriptors and reference entries.

Validation covers duplicate IDs/routes/order, missing Russian text, unknown renderer, missing help topic, orphan generated entry, missing required raw status mapping and unsafe external URL.
