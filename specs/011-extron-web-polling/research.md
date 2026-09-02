# Research: Локальный веб-опрос Extron

## Подтверждённый contract

На локальном Extron IPCP Pro 250 xi подтверждён следующий порядок:

1. `GET /www/index.html` с теми же `Accept`, `Accept-Language`, `Referer` и `User-Agent`, которые использует web-интерфейс устройства; `401` с локальной страницей входа является ожидаемым ответом до авторизации.
2. `POST /api/login?rnd=<timestamp>` с теми же браузерными заголовками, Basic authorization и пустым body.
3. Сохранение cookie `NortxeSession` только в памяти текущего процесса.
3. `GET /www/main.js` в той же session.
4. Извлечение resource URI из bundle по подтверждённым семантическим ключам.
5. `GET /api/swis/resource<uri>` без дополнительных query-параметров.

Для project resources добавление `?rnd=...` приводило к ошибке устройства; поэтому exact URL является частью обязательного contract, а не оптимизацией.

## Решение о поддержке моделей

**Decision**: Поддерживать не перечисление моделей, а поколение web contract.

**Rationale**: Session-bound URI исключают надёжную hardcoded таблицу. Контроллер или панель любой модели Extron поддерживается, если bundle содержит достаточные подтверждённые ключи, а ресурсы возвращают структурно ожидаемые данные.

**Alternative rejected**: Добавлять отдельный adapter на каждую модель. Это дублирует логику, быстро устаревает и создаёт ложную уверенность для прошивок с другим bundle.

## Решение о сетевом transport

**Decision**: Built-in Node `https.request`, sequential redirects запрещены, hostname всегда равен allowlisted IPv4, cookie jar только для одной device session.

**Rationale**: Нет внешних зависимостей и скрытых proxy/redirect переходов. Self-signed TLS разрешается только явным `allowInsecureTls` конкретного plan item или CLI flag.

## Решение о credentials

**Decision**: Использовать существующий `CredentialVault`/Windows DPAPI; optional `--credentials` импортирует Excel/JSON/CSV непосредственно в vault перед запуском. Запись может относиться к IP либо к типу и производителю с необязательной моделью.

**Rationale**: Браузерный `file://` runtime не может безопасно выполнять системный polling и не должен принимать secrets. Общий scope соответствует стандартным credentials марки/типа, а приоритет IP → модель → type/vendor сохраняет явные исключения. Vault не переносится через репозиторий, ciphertext привязан к Windows user/machine boundary.

## Решение о месте хранения результатов

**Decision**: Default root `%LOCALAPPDATA%\MVP_SPHERE_SR\poll-results`, подпапка запуска `YYYY-MM-DD_HH-mm-ss`, файл `<IP>.json`.

**Rationale**: Данные остаются локальными, не смешиваются с исходным кодом, не попадают в Git и совпадают с уже распознаваемым importer форматом времени папки. Пользователь может указать иной локальный `--out`.

**Alternative rejected**: Сохранять рядом с `index.html` — повышает риск случайного commit/архивирования. Downloads — менее предсказуемое и часто синхронизируемое внешними средствами место.

## Решение о форме результата

**Decision**: Сохранять legacy-compatible top-level поля и `webBlocks` (`Firmware`, `Project Info`, `Device Status`, `LAN Settings`, `GUI`) с безопасными diagnostics.

**Rationale**: Существующий importer уже анализирует такой итог опроса. Не нужен новый browser parser или server mode.

## Решение о ручной загрузке

**Decision**: Ничего не удалять из существующего File API workflow. Автоматический polling создаёт ещё один набор совместимых файлов, а не новый обязательный режим.

## Неразрешённые vendor-варианты

- Имена/структуры ключей bundle, не подтверждённые реальным ответом, не угадываются.
- HTTP-only поколения и SIS/SSH transport остаются `protocol_required` до отдельного подтверждённого contract.
- Timestamp обновления firmware сохраняется только при наличии явного значения; он не вычисляется из firmware version.
