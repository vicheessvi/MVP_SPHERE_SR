# Contract: Huawei TE40 disable insecure management services

## Preconditions

1. Exact target IP входит в plan allowlist.
2. Pre-auth и post-auth модель совпадает с TE40.
3. Идентичность подтверждена serial или валидным MAC.
4. Bundle содержит exact action/config markers.

## Operations

1. `WEB_GetCfgParamAPI` для `enabletelnet`, `enable_http`.
2. Если конфигурация и TCP-состояние не соответствуют цели, один `WEB_SaveCfgParamAPI` с:
   - `enabletelnet = 0`;
   - `enable_http = 1`.
3. Повторный `WEB_GetCfgParamAPI` по той же HTTPS-сессии.
4. TCP verification: 23 closed, 80 closed, 443 open.

Любой другой config ID запрещён. Успех save-envelope без успешной post-verification не является успехом операции.
