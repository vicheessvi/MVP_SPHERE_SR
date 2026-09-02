# Data Model: Аналитика перезагрузок устройств

## RebootObservation

- `resultId`, `deviceId` — ссылки на результат и точное SR-устройство.
- `observedAt`, `observedAtSource` (`payload_uptime_observed_at`, `payload_captured_at` или ограниченный legacy source), `timeUncertaintyMs`.
- `uptimeSeconds`, `uptimeSource`, `uptimeUncertaintySeconds`.
- `evidencePaths`, `confidence`.

Невалидный результат имеет reason: `unmatched`, `missing_time`, `missing_uptime`, `conflicting_uptime`, `ambiguous_timestamp` или `historical_device`.

## RebootEvent

- `id`: детерминированная пара result ids.
- `deviceId`, `deviceName`, `category`, `manufacturer`, `model`, `ip`.
- `locationId`, `locationName`, `address` — текущая SR.
- `previousResultId`, `currentResultId`, `previousObservedAt`, `currentObservedAt`.
- `occurredFrom`, `occurredTo`, `estimatedAt` (midpoint только для сортировки/графика).
- `minimumCount: 1`, `uptimeBeforeSeconds`, `uptimeAfterSeconds`.
- `ruleVersion: reboot-min-v1`, `confidence`, `observationSources`, `evidencePaths`.

## RebootCoverage

`currentDevices`, `pollingResults`, `eligibleObservations`, `devicesWithObservations`, `devicesWithComparablePairs`, `excludedResults`, `unknownPairs`, `excludedByReason`.

## RebootFilters

`period` (`all`, `today`, `7d`, `30d`, `custom`), `dateFrom`, `dateTo`, `category`, `manufacturer`, `model`, `location`, `address`.

## RebootAnalytics

`events`, `summary`, `byDate`, `byHour`, `byDevice`, `byLocation`, `byAddress`, `leaders`, `filterOptions`, `emptyState`.

## State transitions

Импорт изменяет только существующий session state. Reboot index вычисляется заново или кэшируется непостоянно. Raw input, imported results и state schema аналитикой не мутируются.
