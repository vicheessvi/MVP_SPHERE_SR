# Data Model

`te20SshMode` is `"" | "enable" | "disable"`; empty means no action. Fixed action IDs are `set_te20_ssh_enabled` and `set_te20_ssh_disabled`, mutually exclusive and not combinable with other writes. Result contains safe status, `before`, `after`, `writeAttempted`, and optional safe error; no credentials or raw response.
