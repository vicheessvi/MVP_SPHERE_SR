# Polycom Group read-only log contract

For exact Group 300/310/500/700 only: existing HTTPS/443 pre-auth Polycom bundle check, session login, exact post-auth model plus serial/MAC, current main bundle markers `createDownloadLogsClickHandler` and `window.open("/a_getsyslog.cgi","_self")`. Then one session-cookie GET to the exact path. No alternative path, HTTP, Telnet or management write.

Response: HTTP 200; Content-Disposition must indicate `.tgz`; Content-Length must be positive and within the bounded limit; Content-Type may be absent (observed) or a compatible gzip/octet-stream type; first bytes must be gzip magic. A bounded stream exposes the prefetched prefix and remaining bytes to the existing `on_log` callback as `<IP>.tgz`, `format=polycom_syslog_tgz_v1`; success requires browser ACK. Failure is isolated and redacted. No tar extraction occurs in the production pipeline.

The administrator separately confirmed successful collection on all four exact models. New successful results carry `confirmed_user_validation`; previously created provisional outputs keep their historical status. This does not waive current model, identity, bundle or TLS gates.

Existing Huawei callback `<IP>.xml` remains unchanged. Job accepts only exact `IP.xml` or exact `IP.tgz` with the corresponding allowlisted format; loopback responds with explicit `application/xml` or `application/gzip`; browser checks the name/MIME pair before writing. Imported `.tgz` files are matched by exact IP and Polycom model but remain metadata-only, not Huawei XML and not reboot/power events.
