# Research: TE20 auto-update disable

- **Decision**: Использовать только exact TE20 и существующий HTTPS/443 CGI-контракт. **Rationale**: Поле `isenableautoupgrade` уже читается после проверки модели и идентичности и значение `0` было сопоставлено администратором с отключённым автообновлением. **Alternative**: Применить к TE30–TE60 или CloudLink — отклонено без модельного evidence review.
- **Decision**: Отдельный фиксированный action ID без произвольного target payload. **Rationale**: У клиента только выбор «Не менять»/«Отключить»; сервер может проверить точный allowlist.
- **Decision**: Контракт записи `WEB_SaveCfgParamAPI` — только `CfgItemInt` с одним `isenableautoupgrade=0` после marker, binary pre-read и exact post-read. **Rationale**: Это существующий подтверждённый путь записи на TE20 для других бинарных настроек; конкретная write-проверка автообновления остаётся provisional до контролируемого теста.
- **Decision**: Не менять подключённый терминал при разработке. **Rationale**: Пользователь запросил функциональность, но не целевое изменение текущего устройства.
