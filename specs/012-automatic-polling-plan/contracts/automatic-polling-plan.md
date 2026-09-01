# Contract: Automatic polling plan v2

Экспорт — UTF-8 JSON без секретов.

```json
{
  "schemaVersion": 2,
  "scheduledAt": "2026-09-01T10:00:00.000Z",
  "intervalSeconds": 10,
  "authenticationInputSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "selection": {
    "categories": ["controller"],
    "manufacturers": ["extron"],
    "models": ["ipcp pro 250xi"]
  },
  "selectionSummary": {
    "total": 1,
    "implemented": 1,
    "notImplemented": 0
  },
  "devices": [
    {
      "ip": "192.0.2.10",
      "category": "controller",
      "manufacturer": "Extron",
      "model": "IPCP Pro 250xi",
      "pollingSupported": true,
      "adapterKey": "controller/extron",
      "allowInsecureTls": false
    }
  ]
}
```

Runner MUST reject duplicate/invalid IP and any secret-like field. Unsupported devices remain in the array for accounting but MUST NOT cause network calls.
