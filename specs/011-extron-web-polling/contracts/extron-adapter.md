# Contract: Extron web adapter

## Input

```js
pollExtronDevice(device, credential, {
  timeoutMs,
  request,       // injectable synthetic transport
  now
})
```

`device.ip` уже прошёл IPv4 allowlist validation. `device.allowInsecureTls` применяется только transport вызовам этого IP.

## Request sequence

1. `GET https://<ip>/www/index.html` с браузерными `Accept`, `Accept-Language`, `Referer` и `User-Agent`; ответ `401` с локальной страницей входа допустим.
2. `POST https://<ip>/api/login?rnd=<unix-ms>` с теми же браузерными заголовками, Basic authorization и пустым body.
3. `GET https://<ip>/www/main.js` с session cookie и теми же browser-origin headers.
4. `GET https://<ip>/api/swis/resource<dynamic-uri>` с той же cookie и browser-origin headers.

Resource URL строится exact concatenation; query запрещён. Redirect на другой host/IP запрещён.

## Bundle discovery

Adapter распознаёт только allowlisted semantic resource keys. Минимум один identity/status/LAN key должен быть подтверждён. URI обязан начинаться с `/` и не содержать scheme/host/traversal/query/hash.

## Output

Возвращается JSON-safe объект с `webBlocks` и safe diagnostics. Cookie, authorization, password, login body и полный response headers не возвращаются.

## Failure

- Нет credential: `credential_missing`.
- Login rejected: `authorization` / `login_failed`.
- Bundle не распознан: `unsupported_web_contract`.
- Неизвестная resource schema: safe diagnostic, без fabricated fields.
- Transport error: allowlisted error code, без raw message если он может содержать URL/secret.
