# Contract: SR XLSX import

## Input

- Local `.xlsx` file selected by the user.
- First non-empty worksheet containing the expected header row.
- No upload/network transmission.

## Required headers

`Название комнаты`, `Адрес комнаты`, `VIP комната`, `Тип оборудования`, `Наименование`, `Модель`, `Тип модели`, `Производитель`, `IP`, `MAC`, `SIP URI`, `Инвентарный номер`, `Серийный номер`, `VIP оборудование`.

`Домен` is optional.

Header matching trims whitespace and is case-insensitive. Raw header text is retained in SRImport metadata.

## Row output

Each non-empty row produces either:

- a normalized Device candidate with raw mapped values; or
- one or more row-scoped InventoryIssues.

A row with invalid IP may still produce a Device when a stronger inventory/serial identifier exists. A row without any usable identity is rejected individually.

## Category rules

1. normalized `Тип модели == video conference` → `vcs`;
2. normalized `Тип оборудования == controller` → `controller`;
3. normalized `Тип модели == панель управления` → `panel`;
4. otherwise → `other`.

Raw values are never renamed. Normalized manufacturer aliases may map `huawey` to `huawei` only for matching/support metadata.

## Result

```text
{
  ok,
  outcome: processed | partial | failed | duplicate,
  state,
  srImportId,
  acceptedCount,
  issueCount,
  errors
}
```

The original state is unchanged when workbook parsing/header validation fails.
