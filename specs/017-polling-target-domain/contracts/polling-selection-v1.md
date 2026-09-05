# UI Contract: Polling selection v1

## Pure selector input

```json
{
  "mode": "filters",
  "domains": ["*"],
  "categories": ["*"],
  "manufacturers": ["*"],
  "models": ["*"]
}
```

or, for current-session lookup:

```json
{
  "mode": "single_ip",
  "ipAddress": "192.0.2.10"
}
```

All addresses in examples are documentation ranges. The second form's `ipAddress` is UI input and MUST NOT be copied to the persisted `selection` object.

## Pure selector output

```json
{
  "mode": "single_ip",
  "availableDomains": ["<options from current SR>"],
  "availableCategories": ["<options constrained by saved filter selections>"],
  "availableManufacturers": ["<options constrained by saved filter selections>"],
  "availableModels": ["<options constrained by saved filter selections>"],
  "selection": {
    "mode": "single_ip",
    "domains": ["*"],
    "categories": ["*"],
    "manufacturers": ["*"],
    "models": ["*"]
  },
  "ipResolution": {
    "status": "found",
    "normalizedIp": "192.0.2.10",
    "candidateCount": 1,
    "device": "<existing inventory object>"
  },
  "selectedDevices": ["<same inventory object>"],
  "supportedDevices": [],
  "unsupportedDevices": []
}
```

For `empty`, `invalid`, `not_found` and `ambiguous`, `device` is null and `selectedDevices` is empty.

The available filter arrays remain calculated while `single_ip` is active so switching back to `filters` restores still-valid selections. They are hidden in the address UI and never affect its one-device result.

## Persisted plan selection

```json
{
  "mode": "single_ip",
  "domains": ["*"],
  "categories": ["*"],
  "manufacturers": ["*"],
  "models": ["*"]
}
```

The existing plan fields, credential SHA-256, `deviceIds`, `selectionSummary` and exported plan v2 remain unchanged. No credentials or raw IP-input field are added.

## UI behavior

- Mode choice is always visible.
- Filter mode renders the four choice groups.
- Single-IP mode renders one `IP-адрес` input and an `aria-live` result below.
- A found card shows device/location/domain/capability data with safe HTML escaping.
- The shared schedule, interval, TLS permission and start button remain below both modes.
