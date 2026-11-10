# Data Model

- `PlanSelection`: exact один IP из актуальной SR, `huawei310AnswerMode=null|automatic|manual`; `null` не создаёт action.
- `ManagementAction`: `set_huawei_310_auto_answer_automatic|set_huawei_310_auto_answer_manual`, target code `1|0`, before/after, changed, writeAttempted, status и модельный validationStatus.
- `DeviceSettings.autoAnswer`: обычный read-only результат; action не подменяет другие поля и не хранит credentials.
- Неясный исход записи не возобновляется автоматически; видимый журнал восстановления и post-read отражают неопределённость.
