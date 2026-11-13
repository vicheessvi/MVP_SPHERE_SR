# Контракт read-only HTTP Bar 300

Актуализация ADR-0054: для exact Box 300/600 применяется тот же узкий reader, но собственный numeric pre-auth код модели и post-auth identity gate обязательны; до реальных проверок их новые факты имеют `provisional_user_validation`. Код 18 и циклы ниже относятся только к Bar 300.

Только после pre-auth exact model 18 и post-auth exact модель + SN/MAC. Текущий bundle должен содержать config-группу `enable_http` и radio-форму с кодами `1=включить`, `2=выключить`. Узкий `WEB_GetCfgParamAPI` с единственным `CfgIDString=["enable_http"]` и текущим CSRF читает код. Строгое целое `1` → `enabled`; `0` или `2` → `disabled` (0 сверено администратором с меню). Другой код/ошибка → `unavailable`, отсутствие маркера → `protocol_required`. Источник: `WEB_GetCfgParamAPI:enable_http`. Никаких команд сохранения.
