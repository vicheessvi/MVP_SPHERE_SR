# Data model

targetSource: sr/device_list (legacy port_closure_list). targetSourceSheets: явные имена,
targetSourceSha256: исходный файл, sourceTargetIps: нормализованная исходная allowlist.
devices: зафиксированная выбранная часть, не динамический lookup по последней SR.
selectedActions: json/logs + exact management IDs, соответствует флагам/параметрам.
Никаких raw rows, паролей или workbook в plan/recovery/runtime status.

Сеансовый targetWorkbook содержит листы до подтверждения; pending choice блокирует
список как источник. После подтверждения остаётся нормализованная проекция и
поля исходной таблицы только для прежнего локального audit export. БД не заменяется.
