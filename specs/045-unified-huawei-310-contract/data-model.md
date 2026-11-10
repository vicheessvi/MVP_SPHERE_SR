# Data Model

- `Huawei310Contract`: единый `transport=huawei_310_rest_v1`, `contract=huawei-310-rest-v1`.
- `ModelDescriptor`: exact `Bar 310|Box 310|Box 610`, разрешённые alias, `settingsValidationStatus` и `managementValidationStatus`; не смешивать между моделями.
- `InventoryCapability`: прежний модельный `key` и `normalizerKey`, новый общий transport.
- `PollingResult`: новый общий contract ID, фактическая модель и собственный validation status; старые файлы не переписываются.
- `HistoricalResult`: прежний `adapterKey`/contract ID принимается только в рамках точного совпадения модели и IP; неизвестные contract ID не принимаются.
