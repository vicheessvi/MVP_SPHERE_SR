# Data Model: автоматический опрос внутри инструмента

## LocalPollingSession

- `id`: криптографически случайный идентификатор HttpOnly cookie.
- `csrfToken`: криптографически случайный токен текущей сессии.
- `createdAt`: время создания.
- `credentialPool`: уникальные `{username, password}` только в памяти runtime.
- `credentialSha256`: отпечаток исходного XLSX.
- `activeJobId`: отсутствует либо ID единственного незавершённого job.

Переходы: `created → credentials_ready → job_active → cleared`. При terminal job credentials и SHA очищаются.

## OutputDirectoryGrant

- `rootHandle`: browser directory handle только в памяти вкладки.
- `displayName`: безопасное имя выбранной папки.
- `runHandle`: подпапка текущего запуска.
- `runFolderName`: `YYYY-MM-DD_HH-mm-ss`.

Не входит в основной state, plan или backup. Разрешение проверяется перед стартом и перед каждой записью.

## AutomaticPollingJob

- `id`, `planId`, `createdAt`, `scheduledAt`, `startedAt`, `finishedAt`.
- `allowInsecureTls`: boolean только текущего job.
- `status`: `scheduled | running | waiting_for_save | waiting_interval | completed | cancelled | failed`.
- `total`, `processed`, `successful`, `failed`, `unsupported`.
- `currentDevice`: безопасные IP/category/manufacturer/model.
- `pendingResultId`: максимум один.
- `safeError`: allowlisted safe code.
- `abortController`: runtime-only.

## PendingPollingResult

- `id`, `filename`, `payload`, `index`, `total`.
- `state`: `pending | delivered | saved | failed`.

Runtime не переходит к интервалу, пока состояние не станет `saved`. `failed` завершает job.

## PollingRunFolder

- Имя соответствует локальному времени `startedAt`.
- Один JSON на каждый обработанный элемент плана.
- Имя JSON: нормализованный IP или `unsupported-NNNN.json`.
- Payload проходит существующий `sanitizeResult` и содержит относительный `outputFile`.
