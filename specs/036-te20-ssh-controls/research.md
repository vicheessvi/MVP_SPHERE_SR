# Research

- **Decision**: exact TE20 only. **Rationale**: `enable_ssh` read and binary interpretation were previously matched with the device menu. **Alternative**: reuse for other Huawei models — rejected without evidence.
- **Decision**: reuse the fixed, marker-gated `WEB_SaveCfgParamAPI` single-binary-field contract already used by TE20. **Rationale**: no new transport or arbitrary payload. **Alternative**: SSH/Telnet direct command — rejected.
- **Decision**: live write remains provisional until administrator selects a precise target state and confirms a controlled test. **Rationale**: disabling SSH can remove a management route.
