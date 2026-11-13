# Контракт read-only SSH Bar 300

Актуализация ADR-0054: тот же узкий reader предварительно доступен exact Box 300/600 после их собственных model/identity gates и текущих bundle-маркеров; цикл ниже подтверждён лишь на Bar 300. Новые Box-факты имеют `provisional_user_validation`.

Только exact Bar 300 после существующих pre/post-auth model и identity gates. Текущий bundle должен содержать config-группу с `enable_ssh` и radio-форму `1=Включить`, `2=Выключить`. Узкий `WEB_GetCfgParamAPI` запрашивает только `CfgIDString=["enable_ssh"]` с текущим CSRF; соседние поля паролей и Telnet не запрашиваются. Строгое целое `1` → `enabled`, `0` или `2` → `disabled`. Администратор вручную проверил цикл `1=enabled → 0=disabled → 1=enabled` с повторным read-only подтверждением каждого состояния; 2 следует из формы. Неизвестный код/ошибка → `unavailable`, отсутствие маркера → `protocol_required`. Источник: `WEB_GetCfgParamAPI:enable_ssh`. Инструмент команд сохранения не отправляет.
