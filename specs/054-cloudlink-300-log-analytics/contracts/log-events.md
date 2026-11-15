# CloudLink 300 log analytics contract

Input is a user-selected XML log file named by exact IPv4 address. The file is accepted only when the current SR has exactly one device at that IP with exact Huawei Bar 300, Box 300 or Box 600 model and the XML starts with `LogModule`.

The parser scans bounded chunks, extracts validated `LOG_MOD_MC/System boot` and a successful `LOG_MOD_WEB` web-user `shut down terminal` command with valid device-local timestamps, and emits safe line-number markers. A command is a confirmed *normal web shutdown*, and the next boot after it is a `start_after_shutdown`, not a reboot. `reboot`/`restart` words alone have no confirmed-event semantics. A 60-minute or longer activity gap before a later unknown boot becomes an explicitly low-confidence suspected power loss, never a confirmed loss. Incomplete logs, clock anomalies, malformed timestamps and duplicate exports must not create false confirmed events.

Bar 300, Box 300 and Box 600 observations enter the same aggregate duration and heatmap views after separate administrator validation of the two Box models. Each model retains an exact model gate and model-specific rule version; new Box events carry `confirmed_user_validation`. The user confirmation does not invent a reboot marker or retroactively modify historical files. No setting is changed.
