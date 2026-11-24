# Data model

power_off остаётся прежним типом. method/shutdownMethod — совместимый канал
web/remote_control либо unknown. shutdownInitiator — not_established, пока лог
не даёт проверенного явного источника. shutdownBasis=registered_terminal_shutdown,
shutdownRuleValidation=user_approved_semantics фиксируют принятое пользователем
правило, не новый live vendor test. Сырые строки/имена пользователей не хранятся.

Log registry: analysisRuleVersion — строка текущего ruleset для формата/модели;
старое отсутствие поля требует перепроверки поддержанного источника. Scan/marker
получают только bounded enums, время, строку и version, не произвольный текст.
Checkpoint identity включает версию; исходные файлы и опубликованные записи
до полного нового publish остаются неизменными.

_shutdownLink: version=1, eventId/at команды, previousKind=unknown_start и
previousGap. Только вычисленная межфайловая связь; новая более сильная запись
confirmed_reboot удаляет её, а поздний промежуточный startup восстанавливает
исходную unknown/gap классификацию. Семантика зеркалируется JS/Python тестами.
