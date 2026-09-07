# Data Model: Huawei TE family management capability

## Capability

- `id`: `disable_insecure_management_services`
- `category`: `vcs`
- `manufacturer`: `huawei`
- `models`: exact `TE30`, `TE40`, `TE50`, `TE60`
- `transport`: `huawei_te_web_cgi_v1`

## Preconditions

- exact model agreement before and after login;
- confirmed serial or valid MAC;
- exact management markers in current bundle;
- both current config values parsed as binary integers.

## Result

Existing `managementActions[]` schema is unchanged: safe status, `changed`, `writeAttempted`, menu states before/after, and optional safe error. Secrets and raw responses remain forbidden.
