# Research: автоматический опрос внутри инструмента

## Decision 1: loopback runtime вместо browser polling

- **Decision**: использовать существующий `server.js`, привязанный к `127.0.0.1`, как единственного сетевого исполнителя.
- **Rationale**: file-page не может выполнять ICMP ping, запускать процесс и читать cross-origin web API устройств; Node adapter уже подтверждён тестами.
- **Alternatives considered**: прямой browser fetch отклонён из-за CORS/self-signed TLS; отдельный установленный Windows service отклонён как лишняя постоянная поверхность атаки; Electron отклонён как несоразмерная новая платформа.

## Decision 2: браузер записывает выбранную папку

- **Decision**: корень выбирается `showDirectoryPicker`; handle живёт только в памяти вкладки. Runtime выдаёт один redacted JSON и ждёт ACK после его записи.
- **Rationale**: браузер не раскрывает абсолютный путь, но может записывать в явно разрешённый каталог. ACK сохраняет порядок `poll → write → interval`.
- **Alternatives considered**: текстовый абсолютный путь подвержен ошибкам и расширяет права runtime; native folder dialog требует отдельного PowerShell/COM процесса; выдача ZIP в конце теряет результаты при сбое.

## Decision 3: XLSX в памяти loopback session

- **Decision**: UI передаёт бинарный XLSX защищённому same-origin endpoint; runtime проверяет схему и SHA-256 и держит пары только в объекте текущей сессии до завершения job.
- **Rationale**: план остаётся без секретов, а browser не отправляет пары по устройствам многократно.
- **Alternatives considered**: DPAPI vault отклонён как постоянный fallback и непереносимый state; credentials в plan запрещены; временный файл создаёт лишнюю копию секрета.

## Decision 4: HTTPS с per-job self-signed bypass

- **Decision**: Extron использует только HTTPS/443. Флаг `allowInsecureTls` передаётся только job и не меняет `NODE_TLS_REJECT_UNAUTHORIZED`.
- **Rationale**: трафик остаётся зашифрованным; пользователь подтвердил, что доверенный сертификат пока недоступен.
- **Alternatives considered**: HTTP отклонён из-за Basic credentials в незашифрованном канале; глобальное отключение TLS verification отклонено как небезопасное.

## Decision 5: один job на сессию и pull/ACK contract

- **Decision**: сессия имеет не более одного активного job. UI опрашивает безопасный status, забирает pending result отдельным GET и подтверждает запись POST ACK.
- **Rationale**: исключает смешивание credential pool и результатов разных планов, ограничивает память и обеспечивает backpressure.
- **Alternatives considered**: WebSocket/SSE усложняют reconnect и CSP; возврат полного массива в одном response не обеспечивает немедленную запись.
