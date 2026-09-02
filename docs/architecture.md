# Архитектура

## Актуальная среда выполнения

MVP_SPHERE_SR имеет один интерфейс и два явно разделённых локальных режима:

- `START_MVP_SPHERE_SR.py` — полный режим автоматического опроса на установленном Python 3.11+;
- `index.html` через `file://` — ручной импорт SR/JSON и аналитика без сетевых полномочий.

Python-runtime использует только стандартную библиотеку. Node.js не входит в production path и остаётся инструментом проверки JavaScript при разработке.

```text
START_MVP_SPHERE_SR.py
        |
        +-- Python ThreadingHTTPServer (127.0.0.1, random port)
        |       +-- one-time token -> HttpOnly session + CSRF
        |       +-- XLSX -> bounded parser -> in-memory credential pool
        |       +-- plan v2 -> immutable exact-IP allowlist
        |       +-- ping -> confirmed Python adapter -> redacted result
        |       +-- pending result <-> browser save ACK
        |
        +-- browser UI -> selected folder/YYYY-MM-DD_HH-mm-ss/IP.json

index.html (file://) -> volatile browser state -> manual import/analytics only
```

## Python-компоненты

- `mvp_runtime/launcher.py` проверяет Python 3.11+ и обязательные ресурсы, создаёт случайный loopback-порт и открывает одноразовый URL.
- `mvp_runtime/server.py` обслуживает только точный allowlist локальных файлов и API credentials/jobs/status/result/ACK/cancel. Generic directory serving и `/api/storage/*` отсутствуют.
- `mvp_runtime/credentials.py` ограниченно читает первую таблицу XLSX через ZIP/XML, отвергает macros/external links/unsafe XML и не вычисляет формулы.
- `mvp_runtime/catalog.py` читает общий `runtime/device-catalog.json` и fail-closed определяет manifest.
- `mvp_runtime/polling.py` нормализует unicast IPv4, создаёт allowlist ровно из плана, выполняет последовательный ping/dispatch/interval и содержит additive adapter registry.
- `mvp_runtime/polling_job.py` управляет schedule, отменой, counters и одним pending result; следующий шаг невозможен до ACK.
- `mvp_runtime/adapters/extron.py` реализует только подтверждённый Extron HTTPS dynamic-resource contract.
- `mvp_runtime/redaction.py` рекурсивно запрещает secrets в plan и удаляет Authorization/cookie/credential material из результата.

## Browser-компоненты

- `runtime-config.js` подтверждает статический ручной режим; Python-server динамически отдаёт marker/CSRF для полного режима.
- `app.js` использует непостоянный memory adapter, загружает SR/дерево JSON, строит Dashboard/таблицы и сохраняет pending JSON через File System Access API.
- `runtime/credential-pool.js` проверяет XLSX в браузере до передачи исходных bytes Python-runtime; пары не попадают в UI state.
- `product-catalog.js` — единый browser/CommonJS-источник модулей, Справочника и русских presentation labels.
- `runtime/device-catalog.json` — единый межъязыковой источник производителей, моделей и protocol status.

## Security boundary

- Bind только `127.0.0.1`, случайный порт, exact Host `127.0.0.1|localhost`.
- Начальный token используется один раз; cookie — `HttpOnly; SameSite=Strict`; mutation требует exact Origin и CSRF.
- Статические пути и API заданы точным allowlist; traversal и неизвестные маршруты возвращают 404.
- Browser state, folder handle, credential pool, session и jobs не сериализуются.
- XLSX ограничен 10 MiB; ZIP/XML имеют отдельные limits. Secret-bearing планы отвергаются рекурсивно.
- Network target должен быть точным допустимым IPv4 из текущего плана. Похожий, исторический или отличающийся последним октетом IP не разрешается.
- Extron использует HTTPS/443. Unverified TLS context создаётся только для текущего задания при явном согласии; HTTP fallback и глобальное отключение проверки отсутствуют.
- Каждый результат проходит redaction до browser API. Runtime ждёт успешной записи и только затем начинает интервал.
- Terminal status очищает session credentials и внутреннюю копию задания.

## Данные и сопоставление

State schema v3 остаётся в памяти каждой страницы. Все строки актуальной SR участвуют в inventory. Новый результат связывается только с текущим IP актуальной SR; `ipHistory`, похожие имена и соседние адреса не назначают `deviceId`. Подтверждённый внутренний IP и категория проверяются до привязки. Конфликт сохраняется как отдельная диагностируемая запись.

Массовый импорт использует bounded parallel reading, cooperative yield, progress throttling и временные indexes. Dashboard и таблицы считают один актуальный inventory scope; отсутствие polling JSON не удаляет устройство. Модуль перезагрузок строит непостоянный индекс полных per-device histories: правило `reboot-min-v1` подтверждает только нижнюю границу событий по соседним наблюдениям uptime, а неизвестные и конфликтные данные сохраняет вне счётчика.

## Расширение адаптеров

Новый transport добавляется только после evidence review: производитель/категория в общем каталоге, подтверждённые endpoint и auth flow, TLS/port, bounded response schema, safe errors, synthetic tests и redaction tests. Job/server/browser API при добавлении адаптера не изменяются. Неизвестный manifest остаётся `protocol_required` или `unsupported` без network attempt.

## Ограничения

Приложение не защищает память от администратора ОС, malware или компрометации текущего Windows-профиля. Доступность автоматического режима зависит от установленного Python 3.11+ и разрешённого запуска `python.exe`. File System Access API требует совместимый Chromium-браузер.
