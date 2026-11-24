# Data model

Root selectedActions = global collect IDs + выбранные managementTasks.
Device binding — один action ID существующего семейства либо пустой массив.
Снимок не содержит credentials, raw SR/XLSX или методов vendor API.
Outcome допускает только action из binding конкретного индекса; notRequested
отдельно от applied/already_compliant. Job notRequested counter отдельно.
Recovery сохраняет root выбор и per-device bindings исходного плана, фильтрует
только устройства при продолжении; неизвестный write не повторяется.
