# Local preparation validation — 2026-10-13

Initial branch develop, initial HEAD/merge-base main b9e4ef011e27636446a4bb931ddb4ade8dba0c52, clean workspace. Develop was fetched from its existing remote branch. Main was not checked out for edits or moved.

- All nine migration contents preserved byte-for-byte; canonical manifest validated.
- Lint and TypeScript passed.
- Vitest: 197 tests, 18 files passed.
- Deno checks passed; 54 Function tests passed, providers mocked/no network permission for the Deno test command.
- Full isolated SQL suite passed, including clean baseline, production-shaped 007->008, clean/upgrade 009, real concurrent transactions (15 password scenarios for each catalog), and maintenance rehearsal.
- Expanded maintenance: INSERT/UPDATE/DELETE/TRUNCATE, zero rows, API login distinct from operator, effective anon/authenticated/service_role, ADMIN RPC, SECURITY DEFINER, dispatcher/Sheets claims, invitation reservation, old-client receipt rollback and idempotent retry after reopening; failed install rolls back, activation/deactivation/removal leave no residue. Pre-barrier claimed job is preserved as a STOP/reconciliation case, not erased or assumed failed.
- Web export and root route/404/PWA/private-cache/offline/390x844 validation passed.
- Explicit DEV build with synthetic publishable key passed; DEV URL/CNAME and no PROD URL in bundle verified. Nonsecret private-variable canary absent. All browser export requests to external origins intercepted/aborted, no hosted Supabase calls.
- Playwright: 82 passed (4.3m) with /usr/bin/chromium.
- Android and iOS Expo exports passed (JavaScript/assets exports, not signed native binaries).
- Baseline staging/envelopes generated only into /tmp; no link/push/deploy/dump against a hosted Supabase project.

Environment corrections: writable DENO_DIR=/tmp/wedding-deno, Expo telemetry disabled and __UNSAFE_EXPO_HOME_DIRECTORY=/tmp/wedding-expo. Initial browser run lacked Playwright's downloaded executable; rerun with installed Chromium passed. New harness uses TCP readiness to avoid PostgreSQL initialization socket restart races.

Limits: no hosted DEV/PROD tests; CLI remote history alignment not exercised remotely; production session_user separation and hard worker lifetime require confirmation before a production window. Snapshot procedure prepared/syntax-checked, no real backup taken or full restore claimed. DEV hosting/DNS/branch protections/secrets/Auth require separate authorization/manual configuration.
