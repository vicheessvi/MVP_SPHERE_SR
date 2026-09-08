# Data Model: Huawei TE20 polling

- Manifest key: `vcs/huawei/te20-legacy`
- Transport: `huawei_te20_web_cgi_v1`
- Contract: `huawei-te20-web-cgi-v1`
- TLS profile: exact TLS 1.1, local connection only
- Pre-auth fingerprint: login markers, `ucTerType=0`, `ucCustomType=0`, CSRF field
- Post-auth identity: exact TE20 plus serial or valid MAC
- Output: existing redacted Huawei web blocks and raw resource projection
- Management capabilities: none
