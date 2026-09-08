# Quickstart validation

1. Run the complete Python unit suite and syntax/import checks.
2. Run JavaScript regression tests, syntax checks and the reference validator.
3. Confirm the catalog grants the management action to exact TE20 while preserving its separate `huawei_te20_web_cgi_v1` transport.
4. Confirm TX50, unknown Huawei models and other manufacturers remain unsupported.
5. Confirm a synthetic TE20 action performs one minimal save and two configuration reads when needed.
6. Confirm an already-safe TE20 performs no save.
7. Confirm model/identity mismatch, missing markers, schema drift, authorization error, transport error and failed post-read never produce success and do not leak secrets.
8. Launch the normal application, load the separate management target XLSX plus the credential XLSX, select exact TE20 by filters or IP, explicitly enable the task, and verify the redacted JSON result.

Controlled live evidence for step 8 was obtained on 2026-09-08. Real device addresses, credentials, MAC, serial and raw responses must not be added to Git or test fixtures.
