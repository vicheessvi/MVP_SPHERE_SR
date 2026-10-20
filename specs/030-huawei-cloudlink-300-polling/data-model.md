# Data model

## Exact 300-family contract

Fields: transport key, expected model label, expected pre-auth model code (Bar 300: 18; Box 300: 19; Box 600: 22), accepted exact SR aliases, observed bundle markers, validation status. Unknown suffixes are not eligible.

## Poll result

Existing compatible fields: `ip`, `capturedAt`, `ok`, `failedStage`, `loginAttempts`, `credentialAttempts`, `vendorPolling`, `webInterface`, `webBlocks`, `rawResources`, `siteName`, `readMode`, `diagnostics`. Credentials, cookies, CSRF and raw sensitive errors are excluded. `webBlocks.Device Info` holds exact model, serial and Site Name when read; Firmware, Device Status, LAN Settings and Capabilities use field-scoped evidence.

## Site name

`siteName.status` = `read` with string `value` and exact source `huawei_cfg_sitename`, or `protocol_required`/`unavailable` with null. A missing value never becomes the SR location name.
