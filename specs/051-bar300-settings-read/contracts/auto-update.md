# Контракт read-only возможности обновления Bar 300

Актуализация ADR-0054: тот же узкий reader доступен exact Box 300/600 только после собственных model/identity gates и текущих bundle-маркеров. Администратор сверил их значения с меню; новые Box-факты имеют `confirmed_user_validation`, исторические provisional JSON не переписываются. Живое подтверждение ручного кода ниже относится лишь к Bar 300; старую фразу о запрете наследования заменяет это уточнение.

Только exact Bar 300 после numeric pre-auth model и post-auth model/identity gates. Текущий bundle должен одновременно содержать `cloudsetPanelObjRequest` с `cloudType`, форму `SelCloudType`, её ручной пункт `value:Q` и подтверждённую кодовую схему `Y=2,K=5,J=6,Q=7,Z=8,$=10,ee=11`. Узкий `WEB_GetCfgParamAPI` запрашивает только `CfgIDString=["cloudType"]` с текущим CSRF; соседние `cloudCfgType`, `HwCloudName`, регистрационные логины и пароли не запрашиваются.

Строгое целое `7` → `disabled` («Руководство» в локализации снимка означает «Вручную»); другой код из текущего списка `{2,5,6,8,10,11}` → `enabled` по подтверждённому администратором правилу. Неизвестный код/ошибка → `unavailable`, отсутствующий bundle-маркер → `protocol_required`. Живое чтение Bar 300 с пунктом «Вручную» вернуло 7; остальные коды проверены синтетически без изменения устройства.

В JSON фиксируются `source=WEB_GetCfgParamAPI:cloudType`, `serverTypeCode`, `basis=server_type_audit_rule`, `ruleVersion=bar300-cloud-type-audit-v1`, `meaning=firmware_update_capability`. Это доказательство возможности обновления прошивки по пользовательскому правилу, но не факт выполненного обновления. Box 300/600 и REST-правило Bar 310 не наследуются. Команд записи нет.
