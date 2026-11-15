# Data model

- `Scan`: `{ok, markers, coverage, bootGaps}`. Only safe marker kind, device-local time and line number are retained; no raw line text.
- `Marker`: `system_boot` for validated exact `LOG_MOD_MC` message; `web_shutdown_command` for a validated successful `LOG_MOD_WEB` action. Reboot action marker is not established.
- `Event`: `unknown_start`, `power_off`, `start_after_shutdown`; `confirmed_reboot` is reserved until a distinguishing reboot marker is established. Includes device/SR context, source path and line, rule version, local-time basis and validation status.
- `SilenceGap`: last activity before a boot, first activity at/near boot, duration, known-action flag, implausible-clock flag. Selector may turn `unknown_start` into `suspected_power_loss` at the configured 60-minute threshold; low confidence only.
- `Index`: one for Bar 300, another for Box 300/600; both tied to current SR SHA-256. Box events carry separate exact-model rule versions and `confirmed_user_validation` for new imports. Cross-file dedup key is device ID, event family and device-local timestamp.

Compatibility: prior JSON results and log files remain unchanged. Existing TE/310 events and UI data structures remain supported.
