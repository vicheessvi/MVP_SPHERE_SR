# Plan v4

Session/admin/Origin/CSRF/credential digest обязательны. collectJson и collectLogs
явные boolean, managementTasks явный список известных IDs. selectedActions
совпадает с единственным набором флагов/IDs; отсутствующие/лишние/противоречивые
значения отклоняются. Ни одной задачи → reject до сети. Изменяемые параметры
требуют своего action, null/Не менять не создаёт write.

device_list: digest 64 hex, targetSourceSheets непустые уникальные bounded строки,
sourceTargetIps непустая уникальная нормализованная allowlist; каждый devices.ip
принадлежит ей. Дубликат IP в selected targets → reject. Source без списка/
листов не переходит на SR. Каталог/текущие модельные write constraints сохраняются.

Job snapshot неизменяем. JSON=false отключает обычные reads, но не обязательную
модель/identity/auth и narrow pre/post выбранной записи. Служебный ACK/journal
не превращается в файл JSON-опроса. Невыбранный log export/write запрещён.
