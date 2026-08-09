# Contract: polling adapter registry

## Purpose

Describe real polling capability without inventing transport or credentials.

## Descriptor

```text
{
  key,
  category,
  manufacturerNormalized,
  modelMatcher?,
  support: supported | not_implemented,
  transport: string | null,
  normalizerKey,
  credentialMode: not_configured | transient | os_backed
}
```

## Runtime interface for a future real adapter

```text
supports(device) -> boolean
poll(device, transientCredentialContext, signal) -> raw result
normalize(raw result) -> normalized result
```

Requirements:

- `poll` MUST NOT exist or be invoked for `not_implemented` descriptors.
- credentials MUST NOT be persisted, logged or included in returned raw result.
- adapters MUST return evidence sufficient to create PollingResult.
- category/manufacturer/model matching MUST be separate from transport/auth.
- registering an adapter MUST NOT require changes to inventory, history, change or analytics core.

## First-slice registry

- `controller/extron`: `not_implemented` (missing protocol/auth documentation).
- `panel/extron`: `not_implemented` (missing TLP protocol/auth examples).
- All other pairs: `not_implemented` or `unknown`.

No network request is part of this feature implementation.
