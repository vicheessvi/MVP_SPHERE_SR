# Contract: DashboardSummary selector

## Input

`getDashboardSummary(state, filters?, options?)`

- `state` must satisfy current state v3 shape.
- `filters` follows `DashboardFilter`.
- `options.limit` is presentation-only and defaults to 8.
- `options.now` is optional deterministic test time.

## Output guarantees

1. Function does not mutate input.
2. Current inventory includes only current SR devices in `vcs/controller/panel`.
3. At most one latest result contributes per device.
4. `UNSUPPORTED` is mutually exclusive with `FAILED` and `NOT_POLLED`.
5. Current ping failures and period ping failures are distinct fields.
6. `authorization`, `reboots`, `gcPlus`, `outdated` are `null` until reliable rules/configuration exist.
7. Lists never exceed `options.limit`; counts use the complete scope.
8. Returned text fields are safe summaries and contain no raw payload or credentials.
9. Invalid filter ranges produce `valid:false` without throwing.

## Metric semantics

- `inventory.total`: current controlled SR devices after inventory filters.
- `coverage.everPolled`: scoped devices with at least one matched polling result.
- `coverage.notPolled`: supported scoped devices without history.
- `coverage.success/failed`: scoped devices whose latest result has that status.
- `coverage.unsupported`: scoped devices without implemented transport.
- `problems.currentPingFailures`: unique scoped devices whose latest result has `pingStatus=failed`.
- `changes.changedDevices`: unique scoped devices with active change records.
- `changes.total`: active change record count.
- `periodMetrics.*`: events/results whose event time belongs to the selected period.
