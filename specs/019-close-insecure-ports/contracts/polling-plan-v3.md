# Contract: polling plan v3

```json
{
  "schemaVersion": 3,
  "scheduledAt": "ISO-8601",
  "intervalSeconds": 0,
  "authenticationInputSha256": "64 lowercase hex",
  "targetSource": "port_closure_list",
  "targetSourceSha256": "64 lowercase hex",
  "managementTasks": ["disable_insecure_management_services"],
  "devices": [
    {
      "ip": "exact unique IPv4 from the dedicated port-closure list",
      "category": "vcs",
      "manufacturer": "Huawei",
      "model": "TE40",
      "pollingSupported": true,
      "adapterKey": "vcs/huawei/te-family",
      "allowInsecureTls": false
    }
  ]
}
```

- `managementTasks` MUST быть пустым либо содержать только зарегистрированные уникальные ID.
- Runtime принимает только schema v3. Старый v2 отклоняется, чтобы write-intent нельзя было молча потерять.
- План не содержит credentials или session values.
- Для management task цели MUST происходить из отдельного атомарно проверенного списка, а не из основной SR; raw XLSX rows в plan запрещены.
