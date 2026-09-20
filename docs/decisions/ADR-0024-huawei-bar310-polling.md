# ADR-0024: отдельный read-only HTTPS-опрос Huawei Bar 310

**Статус**: принято

**Дата**: 2026-09-19

**Эксплуатационное подтверждение**: 2026-09-20 пользователь подтвердил успешный автоматический опрос реального Huawei CloudLink Bar 310 через интегрированный алгоритм.

## Контекст

Пользователь предоставил доступ к одному Huawei Bar 310 и XLSX-пулу учётных данных, чтобы добавить модель в автоматический опрос. Перенос алгоритма TE40 по названию производителя был недопустим: реальный Bar 310 отдаёт React web-интерфейс и `/v1/...` API, тогда как TE30–TE60 используют legacy web-CGI actions.

Контролируемая read-only проверка подтвердила HTTPS/443, точную модель до credentials, последовательность session/account/session-change, заголовок `X-Access-Token` и пять достаточных GET-ресурсов. Официальная документация Huawei подтверждает отдельную продуктовую линейку Bar 310 и управление через web-интерфейс, но не заменяет проверку установленного firmware-контракта.

## Решение

1. Добавить отдельный transport `huawei_bar310_rest_v1` только для exact `Bar 310`, `CloudLink Bar 310` и существующего SR-написания `CloudLinc Bar 310`.
2. До credentials требовать exact `licenseEquipName == Bar 310` и все фиксированные path/header markers из единственного same-origin main bundle.
3. Использовать браузерную последовательность `POST /v1/login/session` → поочерёдный `POST /v1/login/account` → `POST /action.cgi?ActionID=WEB_ChangeSessionID`.
4. Хранить cookie и `X-Access-Token` только внутри adapter invocation; после входа выполнять best-effort `DELETE /v1/login/session`.
5. Разрешить только пять GET: version, specification, system time, license и device status. Post-auth успех требует exact Bar 310 и SN/ESN либо валидный MAC.
6. Не добавлять Bar 310 в write-capability закрытия HTTP/Telnet.
7. Не сохранять live transcript, адрес, credentials, MAC, serial или итоговый JSON в repository.

## Последствия

- Bar 310 получает совместимый результат `Device Info`, `Firmware`, `Device Status`, `LAN Settings`, `Capabilities` через собственный контракт.
- TE-family adapter и подтверждённые write-задачи не изменяются.
- Новые firmware/schema variants будут безопасно отклоняться до отдельного evidence review.
- Для локального самоподписанного сертификата по-прежнему требуется явное разрешение текущего запуска; HTTP fallback отсутствует.
- Текущий контракт `huawei_bar310_rest_v1` считается подтверждённым пользовательской эксплуатационной проверкой для Huawei CloudLink Bar 310; это подтверждение не распространяется автоматически на другие модели Huawei Bar или будущие несовместимые firmware-схемы.
