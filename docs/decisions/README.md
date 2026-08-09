# Architecture Decision Records

ADR фиксируют значимые решения, их контекст, последствия и альтернативы.

## Реестр

- `ADR-0001-ai-agent-speckit-workflow.md` — workflow ИИ-агент + SpecKit.
- `ADR-0002-application-technology-stack.md` — отменённый Python/Django/PostgreSQL стек.
- `ADR-0003-browser-only-demo-stack.md` — исторический browser-only MVP, заменён ADR-0005 для рабочих данных.
- `ADR-0004-sr-inventory-xlsx-extension.md` — state v2, локальный XLSX и импорт polling history.
- `ADR-0005-secure-local-runtime.md` — текущий защищённый Windows loopback runtime, encrypted store и credential vault.

Новый ADR нужен при изменении trust boundary, bind address, способа хранения ключа/секретов, подключении внешнего сервиса, реального vendor transport или новой роли.
