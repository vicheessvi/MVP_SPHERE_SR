# Contract: XLSX credential pool

- First worksheet only.
- Required columns exactly by normalized Russian label: `Логин`, `Пароль`.
- Each non-empty row is one candidate pair.
- Empty rows are ignored; half-empty rows are rejected; exact duplicate pairs are counted and omitted.
- Additional columns are ignored and do not create scopes.
- Parser output separates non-serializable in-memory `credentials` from safe counters.
- No credential value may appear in UI, result JSON, plan, stdout/stderr or diagnostics.
