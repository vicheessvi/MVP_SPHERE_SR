# Research

- **Decision**: exact TE20 only. **Rationale**: `enable_ssh` read and binary interpretation were previously matched with the device menu. **Alternative**: reuse for other Huawei models — rejected without evidence.
- **Decision**: reuse the fixed, marker-gated `WEB_SaveCfgParamAPI` single-binary-field contract already used by TE20. **Rationale**: no new transport or arbitrary payload. **Alternative**: SSH/Telnet direct command — rejected.
- **Decision**: Изначально запись считалась предварительной; позже администратор сообщил об успешной проверке включения и отключения SSH на рабочем ПК. **Rationale**: отключение SSH может убрать путь удалённого управления, поэтому точный выбор и подтверждение остаются обязательными.
