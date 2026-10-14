# Data Model

## Reboot detail row

`eventId`, `deviceId`, `locationId`, `estimatedAt`, `deviceName`, `ip`, `mac`, `vip`, `locationName`, `address`; строится только из существующего события и актуальной SR. Для рейтингов `eventCount` и `uniqueDeviceCount` считаются отдельно.

## Version observation

`deviceId`, `resultId`, `capturedAt`, `version`, `previousVersion`, `comparison` (`first` / `unchanged` / `changed`), `locationName`, `address`. История сортируется по времени; отсутствие версии не порождает строку и не заменяет предыдущую версию.

## Connection error row

`deviceId`, `kind` (`authorization_error` / `network_unreachable`), `count`, `lastAt`, `deviceName`, `ip`, `mac`, `locationName`, `address`. Иные статусы не включаются. Одно устройство может присутствовать в обеих таблицах, если в разные опросы случались разные ошибки.
