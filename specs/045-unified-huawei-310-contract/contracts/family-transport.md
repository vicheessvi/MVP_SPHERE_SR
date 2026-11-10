# Contract: Huawei 310 family

Только точные Bar 310, Box 310 и Box 610 используют `huawei_310_rest_v1` / `huawei-310-rest-v1`. Модельный dispatcher выбирает descriptor до сети; далее неизменный guarded core проверяет pre-auth model до credentials, post-auth exact model и SN/ESN либо MAC перед настройками. HTTPS/443, session/account/token, фиксированные bounded ресурсы и read-only настройки остаются прежними. Opt-in HTTP-write не расширяется; Telnet не читается и не записывается.

Bar settings имеют проверенный статус; Box 310 и Box 610 — независимые provisional statuses. Неизвестные и суффиксные модели отвергаются. Исторические `huawei-bar310-rest-v1`, `huawei-box310-rest-v1`, `huawei-box610-rest-v1` остаются данными ранее сохранённых файлов, а не новыми маршрутами.

Администратор отдельно подтвердил названия и значения read-only полей обеих Box. Для новых JSON они `confirmed_user_validation`; старые provisional результаты не повышаются задним числом. HTTP write остаётся provisional и вне этого подтверждения.
