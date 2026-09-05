# Data Model: Адресный опрос и фильтр домена

## PollingPlanSelection

- `mode`: `filters | single_ip`; default `filters`.
- `domains`: массив нормализованных значений, `*` или `__not_specified__`; используется только массовой проекцией.
- `categories`: существующий массив категорий.
- `manufacturers`: существующий массив производителей.
- `models`: существующий массив моделей.
- `ipAddress`: строка формы только текущей вкладки; не включается в сохранённый plan selection.
- `scheduledAt`, `intervalSeconds`, `allowInsecureTls`: существующие настройки запуска.

Validation:

- Неизвестный `mode` нормализуется в `filters`.
- `*` взаимоисключает частные значения каждого массива.
- Выборы, отсутствующие среди актуальных options, удаляются каскадом.

## PollingIpResolution

- `status`: `empty | invalid | not_found | ambiguous | found`.
- `normalizedIp`: канонический IPv4 или `null`.
- `candidateCount`: количество точных current-SR совпадений.
- `device`: ссылка только при `found`.

Transitions:

```text
empty input -> empty
non-IPv4 -> invalid
valid + 0 current matches -> not_found
valid + >1 current matches -> ambiguous
valid + 1 current match -> found
SR re-import -> resolution recalculated from new current inventory
```

## DomainOption

- `value`: нормализованный домен или `__not_specified__`.
- `label`: первое исходное display-значение либо «Не указано».

Domain options are deduplicated after whitespace/case normalization and sorted by Russian display label.

## AutomaticPollingProjection

- `mode`
- `availableDomains`, `availableCategories`, `availableManufacturers`, `availableModels`
- normalized `selection`
- `ipResolution`
- `selectedDevices`, `supportedDevices`, `unsupportedDevices`

Rules:

- `filters`: selected = domains ∩ categories ∩ manufacturers ∩ models.
- `single_ip`: selected = `[device]` only for `ipResolution.status = found`.
- Supported/unsupported classification remains the existing adapter capability rule.

## PollingRun plan extension

Existing fields remain. `selection` adds:

- `mode` always;
- `domains` only as normalized filter metadata.

The raw input IP is not stored. `deviceIds` remains authoritative, and export still resolves current device data into plan v2 `devices[]`.
