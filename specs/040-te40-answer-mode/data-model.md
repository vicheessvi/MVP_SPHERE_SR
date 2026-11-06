# Data Model

- Выбор режима: `null | automatic | manual`. `null` не создаёт write-задачу.
- План: один exact TE30/40/50/60, текущий SR SHA-256, режим выбора одного IP, один идентификатор write-задачи.
- Результат действия: `id`, `status`, `changed`, `writeAttempted`, `before?`, `after?`, `safeError?`; секреты исключены.
- Переходы: unknown → failed без записи; current=target → already_compliant; current≠target → одна запись → verified applied либо failed.
