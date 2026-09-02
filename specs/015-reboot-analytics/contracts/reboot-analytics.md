# Contract: reboot analytics

## `extractRebootObservation(result)`

Возвращает `{ eligible: true, observation }` только для parsed, точно сопоставленного результата с поддержанными `Device Status.Date` и uptime. Вычисляет `bootAtMs = observedAtMs − uptimeSeconds × 1000`. Иначе `{ eligible: false, reason }`. Не мутирует result.

## `deriveMinimumReboot(previous, current, device)`

- `{ status: "confirmed", event }`, если интервал текущего запуска целиком позже прошлого наблюдения;
- `{ status: "unknown", reason }` при неоднозначности;
- `{ status: "not_confirmed" }`, когда пара пригодна, но событие не доказано.

`event.minimumCount` всегда 1; `ruleVersion` всегда `extron-reboot-v2`. Основной индекс создаёт событие и для одного пригодного файла, а повторные boot timestamps в пределах пяти секунд объединяет.

## `buildRebootAnalysisIndex(state, options?)`

Строит полный индекс до фильтрации. Участвуют только актуальные SR devices и exact matched polling results. Группировка `O(n)`, сортировка `O(sum(n log n))`, scan `O(n)`.

## `getRebootAnalytics(state, filters?, options?)`

Один filtered event set питает KPI, distributions, leaders и таблицу. `options.now` и time-zone injection допускаются для тестов. Top-N применяется renderer, не selector.

## Presentation contract

- KPI: «Рассчитанные перезагрузки».
- Время: оценённый интервал, не ложная точная отметка.
- Локация/адрес: «по актуальной SR».
- `insufficient` отличается от достоверного нуля.
- Графики содержат точные значения и не полагаются только на цвет.
