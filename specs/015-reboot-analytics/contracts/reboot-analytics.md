# Contract: reboot analytics

## `extractRebootObservation(result)`

Возвращает `{ eligible: true, observation }` только для parsed, точно сопоставленного результата с поддержанными временем и uptime. Иначе `{ eligible: false, reason }`. Не мутирует result.

## `deriveMinimumReboot(previous, current, device)`

- `{ status: "confirmed", event }`, если интервал текущего запуска целиком позже прошлого наблюдения;
- `{ status: "unknown", reason }` при неоднозначности;
- `{ status: "not_confirmed" }`, когда пара пригодна, но событие не доказано.

`event.minimumCount` всегда 1; `ruleVersion` всегда `reboot-min-v1`. Отсутствие подтверждения не объявляется доказанным отсутствием reboot.

## `buildRebootAnalysisIndex(state, options?)`

Строит полный индекс до фильтрации. Участвуют только актуальные SR devices и exact matched polling results. Группировка `O(n)`, сортировка `O(sum(n log n))`, scan `O(n)`.

## `getRebootAnalytics(state, filters?, options?)`

Один filtered event set питает KPI, distributions, leaders и таблицу. `options.now` и time-zone injection допускаются для тестов. Top-N применяется renderer, не selector.

## Presentation contract

- KPI: «Минимум подтверждённых перезагрузок».
- Время: оценённый интервал, не ложная точная отметка.
- Локация/адрес: «по актуальной SR».
- `insufficient` отличается от достоверного нуля.
- Графики содержат точные значения и не полагаются только на цвет.
