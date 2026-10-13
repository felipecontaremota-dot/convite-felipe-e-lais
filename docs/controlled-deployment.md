# Controlled deployment artifacts — manual authorization only

## Maintenance

Operational SQL is under scripts/operations, deliberately outside supabase/migrations. Never auto-install it on a hosted project. install-maintenance.sql requires psql `-v operator_login=<verified direct LOGIN>`. It creates a private schema, active flag, statement triggers and explicit inventory in one transaction, with fail-fast lock timeout. An unknown public table aborts installation. No PUBLIC/API access to private control/helpers. No JWT/header/configurable session flag bypass.

The guard compares session_user, NOT current_user (SECURITY DEFINER would otherwise bypass). Operator candidate postgres is used only in disposable tests; production must prove its API login differs and that no untrusted role inherits that login. The test API LOGIN is maintenance_api with effective anon/authenticated/service_role. A direct connection sharing the allowlisted operator login is trusted: protect that credential, do not share it with automation. Pure reads and already-committed duplicate fast paths may return without a write; the guard blocks fresh writes/claims, not every read-only RPC response. Pure reads remain possible; Auth signups in managed auth are not blocked, but activation/binding and domain writes are. The guard does not block showing a QR already stored on a device.

Installation protects public domain tables, receipts, rate limits, jobs and reservation outboxes. Envelope 009 adds guards on the new private tables BEFORE its COMMIT, avoiding an exposed interval. Raw CLI application of 009 while a production guard is active is not the tested controlled-window path: use the reviewed envelope.

activate-maintenance.sql and deactivate-maintenance.sql require the same operator connection; removal drops only inventoried triggers and known helpers/tables, without CASCADE. No generic ADMIN/service bypass. Do not reopen automatically after failed checkpoint. Smoke while active must use isolated connection/session simulation with mock providers; do not grant a global JWT exception. Hosted browser smoke requires its own reviewed limited-access procedure or happens during explicitly authorized reopening.

## Drain

config/operations.json centralizes the Free worker lifetime (150s rehearsal assumption) and 30s observation margin. Before ANY hosted use, confirm the current hard worker lifetime in official limits and mark confirmation in the operational record; this parameter is not proof of production runtime. The 30s margin covers bounded timestamp/observation uncertainty, not provider latency or a replacement for a hard lifetime. If uncertainty exceeds it, increase the reviewed margin or STOP.

T0 is receipt of the committed barrier. New statements, including zero-row claims, fail before providers. Wait at least configured lifetime + margin from T0, verify the barrier and inspect sanitized invocation metadata. Do not rely on the 20s timeout of a single external HTTP request; dispatcher/send-invitations/Sheets have loops. A pre-barrier claimed request may still finish its external call and be unable to persist its result: keep it uncertain/pending; never retry with a new identity or convert to failed by assumption. Unknown active runtime/drain guarantee means STOP. Run checkpoint-readonly.sql: ANY old processing job, attempted pending invitation, or held delivery lock requires STOP and an individually authorized reconciliation. A legacy pre-barrier dispatch has no new admission marker: never let it be reclaimed automatically after the window merely because its lease expired. The synthetic rehearsal deliberately retains a preclaimed job and asserts that state is not erased; this is a risk test, not permission to reopen with ambiguous production jobs. Inspect exact deployed old bundles as well as current code. Temporary 503 entry-point deployments are an optional separately reviewed fallback, not part of this release.

No pg_cron/GitHub scheduler is known; external absence is not proven. WORKER_SECRET presence is not evidence of an active worker. Worker smoke is not harmless: schedule_notifications creates jobs.

## Envelopes and atomic history

`node scripts/operations/envelopes.mjs /tmp/wedding-release-envelopes` creates artifacts OFFLINE outside checkout. Checksum mismatch aborts. Each file contains one transaction and the intact migration body, then INSERT(version,name) into supabase_migrations.schema_migrations. No ON CONFLICT, no repair, no db push in production. Nullable statements/created_by/idempotency_key/rollback remain NULL; no fake CLI parsing or down migration. Protected source files remain untouched. Review generated artifacts before any execution. Never use --single-transaction around an existing BEGIN/COMMIT envelope.

Future manual application: psql using a protected libpq service, -X -v ON_ERROR_STOP=1 -f approved-file. Connection identity must be independently verified; these artifacts do not determine a hosted project's identity from its database name. In case of unknown COMMIT outcome, inspect schema/history read-only before retrying.

## Snapshot

snapshot.sh is manual and requires explicit environment-specific authorization. Store custom-format dump, catalog, checksum and manifest outside Git/public output, restrictive permissions, protected disk and encrypted retention. Include public and supabase_migrations, plus reviewed private application schemas via SNAPSHOT_PRIVATE_SCHEMAS. Managed Auth/Storage/Vault and secrets are excluded. Do not include deployment_guard as a recoverable application schema. Preserve Function bundles separately. Do not print catalog or data in CI/logs.

Validate exit status, archive catalog, expected objects, checksum and aggregate row counts. The script captures originals with grants/ownership; structural inspection is not a proven full restore. Domain FKs retain Auth UUID dependencies. This is manual recovery support/roll-forward evidence, NOT PITR or a full Supabase clone. Do not restore blindly over production.

## Future release order

Separate authorizations: maintenance -> drain -> snapshot -> baseline checkpoint -> 008 -> checkpoint -> 009 -> checkpoint -> dispatch deploy -> redeem deploy -> controlled smoke -> reopening -> removal. Keep verify_jwt=false; handler authentication remains mandatory. Do not deploy send-invitations/sync-sheets as an incidental release. With APP_ENV=development their providers are disabled; production integrations remain unchanged. Failed transaction rolls back; committed migration prefers roll-forward. Never regenerate HMAC/PIN/link as recovery.
