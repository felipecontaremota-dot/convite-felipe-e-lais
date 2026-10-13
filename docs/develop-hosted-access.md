# Hosted DEV access prerequisites

Authorized target only: oxdalpfvahcgzvqyctkq. Production ref is rejected before any request. scripts/develop/target.mjs constructs fixed Management API/function paths; no arbitrary project or path. DevelopManagement requires a successful remote ID/region check before SQL, Auth configuration, key retrieval or secrets. API responses on errors are withheld, and redirects are refused. A token missing from environment aborts rather than falling back to another account/configuration.

Cloud environment settings must bind SUPABASE_ACCESS_TOKEN securely to api.supabase.com and SUPABASE_DEV_PROJECT_REF to the exact DEV ref. Do not send tokens in chat or commit them. Management access is required to configure Auth, secrets, SQL and Functions; a public publishable key is insufficient. Reuse no production credentials. No DB password is required for Management API queries; direct psql/snapshot access may later require a separate DEV-only connection credential.

Allow network destinations api.supabase.com and oxdalpfvahcgzvqyctkq.supabase.co. Never add production project endpoints for this task. The supplied CLI is pinned to 2.101.0; SUPABASE_HOME=/tmp/wedding-supabase-cli and SUPABASE_TELEMETRY_DISABLED=true avoid unwritable user-home storage and telemetry. No login/token store was created with a real credential.

After credentials are bound, run the guarded read-only preflight from a reviewed clean develop checkout:
`SUPABASE_DEV_PROJECT_REF=oxdalpfvahcgzvqyctkq node scripts/develop/preflight.mjs`
It verifies remote identity, connection role and aggregate baseline/history presence. Do not invoke unguarded CLI defaults or a previously linked workdir. deploy-functions.mjs pins project ref, verifies remote metadata before EACH deploy, preserves verify_jwt=false and suppresses raw CLI output. It is not a replacement for database/Auth/secrets checkpoints.

At preparation time, no Supabase credential/connector existed in this environment. The hosted installation has NOT been performed and no hosted result may be inferred from local tests. The next action is secure access provisioning, not another authorization for each DEV operation.
