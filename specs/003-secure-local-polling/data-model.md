# Data Model: secure local polling runtime

## EncryptedObjectEnvelope

`version`, `algorithm`, `iv`, `tag`, `ciphertext`, `plaintextSha256`, `updatedAt`. AAD binds the logical object key and envelope version. Atomic write uses a temporary sibling followed by rename.

## CredentialRecord

`ipNormalized`, `username`, `password`, optional `manufacturer`, optional `deviceType`, `importedAt`. Stored only inside `credentials.vault.enc`; never serialized into application state or returned by read API.

## CredentialVaultSummary

`recordCount`, `sourceSha256`, `importedAt`, masked IP list. Safe for UI/state; contains no username/password.

## SecureRuntimeSession

Ephemeral `sessionId`, `csrfToken`, `createdAt`; exists only in server memory and expires with process termination.

## PollingAdapterManifest

`key`, `category`, `manufacturerNormalized`, `manufacturerAliases`, `knownModels`, `protocolStatus`, `credentialMode`, `transport`. `transport` is `ping` for reachability and null for undocumented vendor polling.

## PollingProbeResult

`ip`, `capturedAt`, `adapterKey`, `ok`, `failedStage`, `ping`, `vendorPolling`, `safeError`. It never contains credentials or raw command lines.

## State migration v2 → v3

- users are projected to exactly one active `user-administrator` with role `administrator` and display name Administrator МЦТП;
- currentUserId remains null in persisted state;
- legacy audit arrays remain only for compatibility/backup but have no routes;
- storage size limits are not applied by secure runtime.
