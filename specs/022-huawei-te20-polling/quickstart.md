# Quickstart validation

1. Confirm TE20 resolves to its separate transport and TX50 stays offline.
2. Confirm exact TLS 1.1 is attached to every TE20 request and no TE30–TE60 request.
3. Confirm pre-auth drift sends no password and post-auth model mismatch fails.
4. Confirm all six resources form the standard JSON sections and secrets are absent.
5. Confirm TE20 never executes the HTTP/Telnet management action.
6. Run the full regression/security matrix and one controlled live production-routing poll.
