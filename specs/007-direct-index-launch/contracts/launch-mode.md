# Contract: Режим запуска

## Static file

1. `index.html` загружает `runtime-config.js` до остальных application scripts.
2. Локальный `runtime-config.js` выставляет file marker только при протоколе `file:`.
3. `app.js` принимает файловый режим только при совпадении marker и протокола.
4. Persistence adapter — новый пустой in-memory store на каждую загрузку страницы.
5. Запросы `/api/storage/*` и `/api/credentials/*` не выполняются.

## Secure loopback

1. `server.js` продолжает отдавать динамический `/runtime-config.js` с secure marker и CSRF token.
2. `app.js` выбирает только server storage adapter.
3. Существующие session cookie, origin/CSRF checks, AES-256-GCM, DPAPI и vault не меняются.

## Invalid context

HTTP/HTTPS без secure marker и file marker MUST показать блокирующий экран и MUST NOT создавать browser storage fallback.
