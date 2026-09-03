# ADR-0016: Подтверждённый локальный опрос Huawei TE40

**Статус**: Принято

**Дата**: 2026-09-03

## Контекст

Терминалы Huawei присутствуют в выгрузке SR, но оставались `protocol_required`, поскольку название производителя и модели не подтверждает безопасный transport. На локальном Huawei TE40 воспроизводимо проверены штатный HTTPS-вход, требуемый browser/XHR context, cookie-сессия, CSRF-токен и ограниченный набор read-only CGI actions. Bare-запрос с корректной парой отклонялся, а полный web flow принимал ту же пару из XLSX.

Реальные IP, credentials, cookie, CSRF, MAC, serial и тела ответов не сохраняются в репозитории. Evidence фиксируется только как контракт, схема и синтетические тесты.

## Решение

1. Добавить отдельный transport `huawei_te40_web_cgi_v1` только для точной модели Huawei TE40.
2. Использовать HTTPS/443 и точный IP плана. Недоверенный сертификат и legacy TLS разрешать только при явном `allowInsecureTls` текущего задания; HTTP fallback запрещён.
3. До credentials проверять статический login bundle по четырём точным marker. Затем воспроизводить `WEB_GetLoginInfo` → `Web_RequestSessionID` → `Web_RequestCertificate` → `WEB_ChangeSessionID` с ephemeral cookie и XHR headers.
4. Не завершать чужую активную web-сессию. При `AlreadyLogin = 1` возвращать безопасный статус.
5. После входа проверять authenticated bundle и вызывать только шесть подтверждённых read-only actions: ESN, system MAC, version, terminal specs, local time и DHCP info.
6. Валидировать outer envelope и inner schema, ограничивать timeout/размер, не сохранять raw headers/bodies и никогда не возвращать credentials, cookie или CSRF.
7. Разделить Huawei catalog на поддерживаемый TE40 manifest и fail-closed fallback остальных моделей. Resolver выбирает exact model entry раньше vendor fallback.
8. Существующие Extron adapter, job/ACK, loopback API и ручной импорт не дублировать и не менять по смыслу.

## Последствия

- TE40 участвует в существующем массовом автоматическом плане.
- Другие Huawei модели не получают сетевой transport без отдельного evidence review.
- Старый firmware с другим bundle/schema будет безопасно отклонён до добавления новой версии контракта.
- Пользовательская Справка должна отражать поддержку TE40 и явное локальное TLS-исключение.

## Проверка

- Синтетические contract tests для успеха, порядка входа, cookie/CSRF, auth failure, active session, unknown contract, TLS/timeout, bounded response, partial resources и redaction.
- Catalog tests для exact-model-first и no-network fallback.
- Полная Python/frontend/reference regression и secret/private-data scan до commit.
