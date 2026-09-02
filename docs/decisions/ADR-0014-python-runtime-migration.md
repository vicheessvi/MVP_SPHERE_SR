# ADR-0014: Python runtime для локального автоматического опроса

**Статус:** принято 2026-09-01

## Контекст

На целевом компьютере запрещены произвольные EXE, CMD/PowerShell launchers и установка Node.js, но установленный `python.exe` разрешён. Прямой `file://index.html` не может надёжно выполнить ping, обойти CORS устройства, управлять self-signed HTTPS и безопасно держать локальный polling job. Требуется сохранить весь интерфейс, ручную загрузку, plan v2, Extron contract, progress/cancel и запись JSON с ACK.

## Решение

1. Единственная production-точка полного режима — `START_MVP_SPHERE_SR.py` на Python 3.11+.
2. Python runtime использует только стандартную библиотеку и не требует `pip`, виртуального окружения или установки приложения.
3. Custom `ThreadingHTTPServer` слушает только случайный порт `127.0.0.1`, обслуживает точный static/API allowlist и сохраняет one-time session, Host/Origin/CSRF boundary feature 013.
4. Учётный XLSX разбирается ограниченным ZIP/XML reader: только первая таблица, без formulas/macros/external links. Exact bytes сверяются по SHA-256.
5. Polling job работает в одном worker thread, выполняет устройства последовательно и выдаёт один redacted result до browser ACK.
6. Extron adapter использует подтверждённый browser-compatible evidence contract: HTTPS/443, предварительный `/www/index.html`, браузерные origin headers, `/api/login`, `/www/main.js`, dynamic resource URI и exact `/api/swis/resource<uri>`.
7. Каталог transport/manufacturer/model вынесен в общий `runtime/device-catalog.json`; новые adapters регистрируются изолированно после evidence review.
8. Неиспользуемое `/api/storage/*`, DPAPI vault, Node/PowerShell runtime и CLI удалены. Browser/runtime state и secrets остаются только в памяти.
9. Прямой `index.html` сохраняет ручной режим без автоматической сети. Node.js остаётся только development/CI средством тестирования JavaScript.

## Последствия

- Скачанный репозиторий работает на разрешённом установленном Python 3.11+ из обычных, пробельных и кириллических путей.
- Автоматический опрос больше не зависит от политик запуска PowerShell, CMD, установки Node или скачивания runtime.
- Пользователь должен не закрывать процесс Python до завершения задания; первое открытие `.py` может потребовать выбора `python.exe`.
- Отсутствует внутреннее постоянное хранилище; после закрытия/reload state и secrets исчезают, а готовые JSON остаются в выбранной папке.
- File System Access API по-прежнему требует совместимый Chromium-браузер.

## Отклонённые варианты

- Browser-only automatic polling: не удовлетворяет CORS/TLS/ping и secret boundary.
- PyInstaller или другой EXE: запрещён политикой целевого компьютера.
- Bundled Python: не нужен после подтверждения установленного `python.exe` и увеличивает supply-chain surface.
- Flask/FastAPI/openpyxl: требуют `pip` и внешние зависимости.
- Сохранение двух production runtimes: создаёт две расходящиеся реализации security/API.
