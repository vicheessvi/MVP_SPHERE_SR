# Verification

1. Run `python -m unittest discover -s python_tests`, `node tests.js`, `node scripts/validate-reference.js` and syntax/compile checks.
2. Start the Python tool, import current SR, enter credentials in the session and select a separate log folder.
3. For exact Group 310, run «только логи»: expect one `<IP>.tgz` in a timestamp folder and no device JSON; open the original archive with a local archive viewer.
4. Run JSON + logs and confirm both outputs are independent. Simulate log-save failure and verify subsequent devices continue.
5. Import the log folder: expect exact IP/model metadata and no event analytics; unknown/mismatched archive is excluded.
6. Group 300/500/700 have been tested separately by the administrator; repeat after firmware/schema changes. Old HTTPS-incompatible Group 300 still gets no HTTP fallback.
