# Data Model: рабочая база и массовые логи

## Workspace

Явно выбранная локальная папка; `schemaVersion`, `revision`, `createdAt`, `updatedAt`, `sourceSrSha256`, `integrityStatus`. В профиле Windows хранится только её абсолютный путь и версия указателя, не копия данных. База находится вне Git и не создаётся до выбора пользователя.

## ImportGeneration

`id`, `baseRevision`, `status` (`staging|completed|cancelled|failed`), `startedAt`, `finishedAt`, `totalFiles`, `processedFiles`, `totalBytes`, `processedBytes`, `sourceKind`. Staging текущей попытки живёт в памяти вкладки; только завершённый результат записывается как новая ревизия базы. При закрытии браузера до завершения попытку придётся повторить, но прежняя завершённая ревизия остаётся.

## SourceFile

`relativePath`, `format`, `deviceId`, `size`, `lastModified`, `prefixSha256`, `analysisDigest`, `analysisStatus`, optional `digestAlgorithm/contentDigest` для полностью прочитанного Huawei XML. Полное тело файла, учётные данные и непроверенный исходный текст запрещены. Для Polycom TGZ и неизвестного формата полный digest не заявляется: сохраняются метаданные и fingerprint префикса, событийный parser не выполняется.

## EventEvidence

`eventId` строится существующим правилом устройства/типа/локального времени; `kind`, `confidence`, `ruleVersion`, `deviceId`, `sourceCount`, ограниченный список `{relativePath,line,markerLines}`. SourceCount может быть больше числа хранимых примеров, чтобы показывать повторные выгрузки без многократного счёта события.

## SafeStateProjection

Версионированная проверенная проекция текущего SR и нормализованных JSON-опросов/проектов. `rawText`, исходные произвольные payload, пароли, токены и session-поля не включаются. Оригиналы остаются в выбранных пользователем папках с SHA-256 и provenance; при потребности в полном исходном тексте пользователь заново выбирает оригинал.

## State Transitions

`no_workspace → selected → authenticated_restore → active_revision`. Импорт: `active_revision → staging → committed(new_revision)` либо `staging → cancelled/failed` с сохранением прежней активной ревизии. Конкурентная запись с неверной `baseRevision` отклоняется; повреждённая БД не заменяется пустой.
