# Data Model: Dashboard

## DashboardFilter

- `period`: `latest_run | today | 7d | 30d | custom | all`
- `dateFrom`, `dateTo`: optional ISO/date boundaries for custom period
- `category`: `vcs | controller | panel | empty`
- `manufacturer`, `model`, `locationId`: normalized/scoped strings
- `vip`: `true | false | empty`
- `pollStatus`: `success | failed | not_polled | unsupported | unknown | empty`

Validation: invalid custom range returns `valid:false` and a safe user message; filters never mutate state.

## CurrentDeviceState

- `device`, `location`
- `capabilityStatus`: `supported | unsupported | unknown`
- `latestResult`: nullable
- `operationalStatus`: `SUCCESS | FAILED | NOT_POLLED | UNSUPPORTED | UNKNOWN`
- `hasCurrentPingFailure`, `hasChanges`, `isVip`, `isProblem`

Exactly one CurrentDeviceState exists per current SR device in controlled categories.

## PeriodScope

- `from`, `to`, `label`, `kind`
- `results`, `changes`, `issues` constrained by timestamps
- `pingFailureDeviceIds`, `failedDeviceIds`, `changedDeviceIds`

`latest_run` uses the latest run and its linked results; other periods use timestamp boundaries.

## DashboardSummary

- `valid`, `errors`, `filters`, `period`
- `context.sr`, `context.latestRun`, `context.lastPollingAt`
- `inventory.total/byCategory/locations/vipDevices/vipLocations`
- `coverage.everPolled/notPolled/success/failed/unsupported/unknown/inLatestRun`
- `health.normal/error/warning/noData/unsupported/unknown`
- `problems.currentPingFailures/currentFailures/unmatched/dataErrors`
- `periodMetrics.results/failures/pingFailures/changedDevices/changes/dataErrors`
- `changes.changedDevices/total/recent/newInLatestSr/missingFromLatestSr`
- `vip.devices/locations/problems/noData`
- `locations[]`
- `latestProblems[]`, `recentChanges[]`
- `distributions.categories/manufacturers/models`
- `freshness.latestTimestamp/noData/outdated`
- `blockedAnalytics.authorization/reboots/gcPlus/freshnessThreshold`

## DashboardProblem

Safe projection only:

- `timestamp`, `kind`, `scope`, `severity`
- `deviceId`, `category`, `locationId`
- `location`, `device`, `ip`
- `description`

Raw JSON, exception stack and secrets are forbidden.

## AttentionLocation

- `locationId`, `name`, `address`, `vip`
- `totalDevices`, `problemDevices`, `pingFailures`, `failures`, `changedDevices`, `noData`

Sorted by problem devices, then VIP, then normalized name.
