# Architecture Decision Records

ADR фиксируют значимые решения, их контекст, последствия и альтернативы.

## Реестр

- `ADR-0001-ai-agent-speckit-workflow.md` — workflow ИИ-агент + SpecKit.
- `ADR-0002-application-technology-stack.md` — отменённый Python/Django/PostgreSQL стек.
- `ADR-0003-browser-only-demo-stack.md` — исторический browser-only MVP, заменён ADR-0005 для рабочих данных.
- `ADR-0004-sr-inventory-xlsx-extension.md` — state v2, локальный XLSX и импорт polling history.
- `ADR-0005-secure-local-runtime.md` — исторический защищённый Windows loopback runtime, encrypted store и credential vault.
- `ADR-0006-portable-runtime-reference-catalog.md` — переносимый runtime и единый каталог интерфейса.
- `ADR-0007-direct-index-session-mode.md` — прямой файловый сеанс.
- `ADR-0008-batch-folder-file-only.md` — текущий file-only режим и импорт общей папки.
- `ADR-0009-scalable-import-pipeline.md` — индексированный пакетный импорт, cooperative yield, прогресс и отмена.
- `ADR-0010-equipment-sr-analysis.md` — единое оборудование, семь категорий и точные правила SR.
- `ADR-0011-extron-web-polling.md` — подтверждённый Extron dynamic-resource HTTPS contract.
- `ADR-0012-automatic-polling-plan.md` — plan v2, XLSX-пул и последовательная запись результатов.
- `ADR-0013-in-tool-polling.md` — исторический Node loopback API и browser ACK.
- `ADR-0014-python-runtime-migration.md` — актуальный Python 3.11+ standard-library runtime и удаление Node/PowerShell production path.

Новый ADR нужен при изменении trust boundary, bind address, способа хранения ключа/секретов, подключении внешнего сервиса, реального vendor transport или новой роли.
