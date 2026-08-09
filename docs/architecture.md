# Архитектура

## Текущий статус

Принят однопользовательский защищённый локальный runtime для Windows. Решение описано в `docs/decisions/ADR-0005-secure-local-runtime.md`; прежний browser-only ADR-0003 больше не определяет рабочий режим.

## Компоненты

- `start.ps1` находит Node.js 20+ и запускает runtime.
- `server.js` слушает случайный порт только на `127.0.0.1`, создаёт одноразовую launch-сессию и обслуживает UI/API.
- `app.js` содержит state v3, импорт SR/результатов, чистую Dashboard-проекцию, аналитику и UI единственной роли.
- `runtime/secure-store.js` атомарно хранит зашифрованные объекты без прикладной квоты.
- `runtime/security.js` реализует AES-256-GCM и защиту мастер-ключа Windows DPAPI CurrentUser.
- `runtime/credential-vault.js` импортирует JSON/CSV и предоставляет секреты только внутреннему polling-коду.
- `runtime/model-catalog.js` маршрутизирует переданные производители/модели.
- `runtime/polling.js` проверяет explicit allowlist, выполняет bounded ping и fail-closed останавливается без подтверждённого протокола.
- `scripts/poll-devices.js` — CLI, формирующий безопасные per-IP результаты.
- `vendor/xlsx.full.min.js` — локально vendored SheetJS без CDN.

## Security boundary

```text
Browser tab (same origin)
        |
        | HttpOnly session + SameSite=Strict + Origin/CSRF
        v
127.0.0.1 random port (server.js)
        |                         |
        v                         v
encrypted state objects     separate credential vault
        \_________________________/
                    |
              AES-256-GCM key
                    |
          DPAPI CurrentUser envelope
```

Runtime не слушает LAN-интерфейсы, не включает CORS, CDN, telemetry или cloud API. CSP запрещает внешние script/connect источники. Launch token одноразовый, cookie недоступна JavaScript. Мутации требуют same-origin `Origin` и непредсказуемый CSRF token.

## Данные

State schema v3 мигрирует v1/v2, оставляет единственного пользователя `administrator` и хранится как encrypted object `mvpSphereSrState.v3`. Credential vault является отдельным encrypted object и не доступен через универсальный storage API.

Искусственного лимита 4 МиБ больше нет. Запись создаётся во временном файле, синхронизируется и атомарно заменяет предыдущий объект. Реальные границы — свободный диск, память процесса и ограничения файловой системы/ОС.

## UI

Рабочие маршруты: Dashboard, VCS, Controllers, Panels, Upload, Secure local storage. Legacy-модули аудита остались только как совместимая внутренняя предметная логика и fixtures; маршруты и навигация «Проекты аудита», «События», «Сопоставления», «Снимки» отсутствуют.

### Dashboard projection

`getDashboardSummary(state, filters, options)` — чистый селектор между persisted state и представлением. Он:

- выбирает детерминированный последний результат каждого устройства по `capturedAt` и `id`;
- вычисляет взаимоисключающий текущий polling-статус и не смешивает его с метриками выбранного периода;
- применяет единый scope категории, производителя, модели, локации, VIP и статуса;
- возвращает инвентарь, coverage, health, проблемы, VIP/локации, события, распределения и drill-down параметры;
- оставляет недоказанные authorization/reboot/GCPlus/freshness метрики равными `null`.

UI только форматирует эту проекцию. Переход из KPI передаёт фильтры в существующие списки VCS/Controllers/Panels; данные повторно не агрегируются в обработчиках представления. Презентационные списки ограничены, тогда как числовые итоги считаются по полному scope.

## Polling boundary

Ping — единственная подтверждённая реальная сетевая операция. Любой target должен быть валидным unicast IPv4 и присутствовать в явном плане. Модельный каталог не считается доказательством протокола: пока не получены vendor contracts, adapter возвращает `protocol_required` и не читает credentials.

## Ограничения защиты

Шифрование at rest и loopback boundary не защищают от компрометации текущего Windows-профиля, администратора ОС, malware в пользовательской сессии, чтения памяти процесса или самостоятельно сохранённого исходного plaintext credentials-файла.
