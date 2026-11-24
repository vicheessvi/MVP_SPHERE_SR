# Research

Текущий TE20 принимает Shut down только LOG_MOD_WEB/RC, TE-family — только
Terminal powered off. Серия 310 требует Web либо кнопку пульта в 10-секундном
окне; серия 300 — только LOG_MOD_WEB + web user. Поэтому другая команда
контроллера не всегда формирует событие. В репозитории нет исходных TGZ/XML
образцов. Пользователь подтвердил семантику, но точные строки ещё запрошены.

Registry reuse использует path/size/mtime/prefix/format/device без версии правил;
checkpoint scope — log-import-v1/SR/fullRecheck. Простая правка regex оставит
прежние пропуски при инкрементальном импорте. Существующая fullRecheck проверяет
полноту путей и сохраняет per-file scans до ACK, publication atomic.

begin(logs*) создаёт новый staging token, поэтому незавершённый staging старой
версии не переиспользуется. Подтверждённые scans восстанавливаются из отдельного
checkpoint namespace; новый ruleset обязан быть частью этого namespace.
