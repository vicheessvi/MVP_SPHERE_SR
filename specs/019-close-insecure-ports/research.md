# Research: Huawei TE40 HTTP/Telnet management task

## Evidence

- Официальный Huawei HTTP API reference описывает web-CGI authentication flow через `/action.cgi`, `WEB_RequestSessionIDAPI`, `WEB_RequestCertificateAPI` и смену session ID: https://support.huawei.com/enterprise/zh/doc/EDOC1100074790/19b69006
- Статический bundle реального TE40 после подтверждённой авторизации содержит `WEB_GetCfgParamAPI`, `WEB_SaveCfgParamAPI`, `enabletelnet`, `enable_http` и форму security settings.
- В UI TE40 Telnet использует `1 = enable`, `0 = disable`; HTTP использует `0 = enable`, `1 = disable`. Обработчики предупреждают о небезопасных значениях `enabletelnet=1` и `enable_http=0`.
- UI сохраняет эти поля через `WEB_SaveCfgParamAPI` и повторно читает конфигурацию.
- Save-response реального firmware имеет `success=1` и пустую строку `data`; это допустимый envelope только для операции без возвращаемой структуры.

## Decisions

1. Изменять только exact TE40 и только через уже аутентифицированный HTTPS/443 session.
2. Не отправлять полный security form: минимальный payload содержит ровно `enabletelnet=0` и `enable_http=1`.
3. Не считать значения конфигурации доказательством закрытого порта; дополнительно проверять TCP/23, TCP/80 и TCP/443.
4. Не переносить write-contract на TE30/TE50/TE60 без отдельной проверки.

## Controlled result

Тестовый TE40 уже сообщил безопасные значения конфигурации. TCP/23 был закрыт, TCP/443 открыт, но TCP/80 принимал соединение и возвращал HTTP 200 без redirect. Повторное сохранение было принято firmware, однако доказательство закрытия TCP/80 не получено. Текущий алгоритм обязан вернуть `configuration_verification_failed` при таком результате.

## Open evidence

- Требуется подтверждённый vendor-механизм полного выключения TCP-listener 80 либо документированное условие применения (например, отдельный сервисный параметр или restart). В bundle отдельного HTTP listener config ID кроме `enable_http` не найдено; `httpsmode` относится к H.323/GK, а не web-server.
