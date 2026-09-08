# ADR-0022: Отдельный read-only transport Huawei TE20

**Статус**: принято и подтверждено controlled live poll
**Дата**: 2026-09-08

TE20 использует те же web-CGI login/resource actions, что TE30–TE60, но принимает только TLS 1.1 и до входа возвращает числовую legacy-схему без текстовой модели. Поэтому TE20 не включается в общий transport: он получает отдельный adapter key и exact TLS profile.

До credentials проверяются exact plan target, login bundle и подтверждённая legacy-схема. Сразу после входа обязательны exact TE20 и serial либо MAC. Читаются только шесть существующих ресурсов. Любой drift завершается fail-closed. Capability закрытия HTTP/Telnet остаётся только у TE30/TE40/TE50/TE60.

Последствие: устаревший TLS разрешён только внутри соединения exact TE20 и только при явном per-run certificate opt-in. HTTP fallback, новые зависимости и постоянное хранение не добавляются.
