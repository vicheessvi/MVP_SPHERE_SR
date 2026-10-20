# Data model

## Recovery manifest

`kind`, `version`, `createdAt`, `status`, `allowInsecureTls`, non-secret `plan`, `savedIndices`, `saveFailures`, `nextIndex`, optional `requiresReview`. Credentials and their SHA-256 are prohibited. The plan preserves exact ordered targets and task opt-in. State: interrupted/running → completed, completed_with_errors, cancelled or interrupted. A completed manifest is not offered for recovery.

## Save failure event

`index`, safe `code=result_save_failed`. The plan identifies the target locally; no raw filesystem exception, path or IP list is returned in this event.

## Site Name

`siteName.status` is `read`, `unavailable` or `protocol_required`; `value` is a string only for confirmed reads, otherwise null. Source for read values is `huawei_mailbox_sitename`. `webBlocks.Device Info.Site Name` is populated only when read.
