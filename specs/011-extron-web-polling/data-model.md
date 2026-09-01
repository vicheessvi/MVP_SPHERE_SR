# Data Model: Локальный веб-опрос Extron

## PollingPlan

- `devices[]`: непустой массив уникальных plan items.
- Дубликаты или невалидные/запрещённые IPv4 отклоняют plan до сетевых запросов.

## PollingPlanItem

- `ip`: обязательный IPv4.
- `category`: `controller` или `panel` для Extron adapter.
- `manufacturer`: `Extron` (case/space normalized).
- `model`: необязательная информационная строка; не является allowlist.
- `allowInsecureTls`: необязательный boolean, действует только на этот IP.

## CredentialEntry

- `scope`: `ip`, `device_model` или `device_type`.
- `ipNormalized` либо `category+manufacturerNormalized(+modelNormalized)` вместе с `username/password` внутри DPAPI-encrypted vault.
- Resolver: exact IP → точная модель/type/vendor → общий type/vendor; duplicate scope отклоняется при импорте.
- После lookup plaintext существует только в памяти device poll.
- В результат допускается только username успешной записи; password запрещён.

## ExtronSession

- `ip`, `cookie`, `resourceMap`, `startedAt`.
- Жизненный цикл: login → bundle → resources → уничтожение ссылок.
- Не сериализуется.

## PollingResult

- `ip`, `ok`, `failedStage`, `capturedAt`.
- `ping`: `ok`, `durationMs`.
- `loginAttempts`: безопасные статусы без headers/body/password.
- `successfulCredential`: только `username` либо `null`.
- `webInterface`: protocol evidence и boolean insecure TLS.
- `webBlocks`: нормализованные блоки firmware/project/status/LAN/GUI.
- `diagnostics`: allowlisted error codes/counts.
- `outputFile`: имя итогового файла или безопасный относительный marker; абсолютный путь не обязателен для аналитики.

## PollingRunFolder

- Root: `%LOCALAPPDATA%\MVP_SPHERE_SR\poll-results` или явный `--out`.
- Capture directory: `YYYY-MM-DD_HH-mm-ss`.
- Children: `<normalized-ip>.json`.
- Запись: `<ip>.json.<pid>.tmp` → atomic rename.

## State transitions

`planned → ping_failed | credential_missing | login_failed | bundle_failed | unsupported_web_contract | resource_partial | completed`

`resource_partial` может давать `ok: true`, если минимальный подтверждённый identity/LAN contract получен; отсутствующие поля маркируются diagnostics, а не пустыми выдуманными значениями.
