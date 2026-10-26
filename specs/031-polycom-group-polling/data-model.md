# Data model: Polycom RealPresence Group polling

## Planned Group target

- `category = vcs`, `manufacturer = polycom`, exact normalized `model` in Group 300/310/500/700.
- Exact IPv4 target comes from the existing SR/plan allowlist, never from a redirect.
- Credentials are an ephemeral ordered pool and are never part of a plan or result.

## Model contract

- `model`: exact expected device response `RealPresence Group N`.
- `transport`: one shared HTTPS web core with four distinct registry keys.
- `validationStatus`: `confirmed_user_validation` for administrator-confirmed 310/500/700; `provisional_user_validation` for untested 300.
- `bundleMarkers`: login and information-resource markers observed in the current device web code.

## Polling snapshot

- Existing fields: `ip`, `capturedAt`, `ok`, `failedStage`, `safeError`, redacted attempt count, `vendorPolling`.
- Whitelisted identity: model, serial number and optional wired MAC. Stable identity requires serial or valid MAC, plus exact model.
- Whitelisted information: software version/build, hardware version, system name, state, bounded service statuses, device time and uptime. The numeric REST time/uptime units are not assumed until independently verified; output labels them as raw values.
- Presentation: `webBlocks.Device Info.Model`, `webBlocks.Device Info.Serial Number`, `webBlocks.Device Info.MAC Address`, `webBlocks.Firmware.Version` and bounded status/time block.
- Optional values absent or invalid become unavailable; no SR value is substituted.
- `rawResources` contains only selected safe fields; no unfiltered web response is persisted.

## State transitions

Planned → pre-auth vendor gate → authenticated → exact model and stable identity verified → bounded reads → redacted result → logout. Any gate failure yields an unsuccessful result and logout if a session exists. No path performs a configuration write.
