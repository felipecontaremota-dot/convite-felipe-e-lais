#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
scratch=$(mktemp -d /tmp/wedding-maintenance.XXXXXX)
if [[ "${GITHUB_ACTIONS:-false}" == true ]]; then
 database="maintenance_${GITHUB_RUN_ID:-0}_$$_${RANDOM}"
 sudo systemctl start postgresql.service
 sudo -u postgres createdb "$database"
 cleanup() { sudo -u postgres dropdb --if-exists "$database"; rm -rf "$scratch"; }
 sql() { sudo -u postgres psql -X -q -d "$database" -v ON_ERROR_STOP=1 "$@"; }
 bootstrap() { sed '/^create role /d' tests/db-bootstrap.sql | sql; }
else
 container="maintenance-$RANDOM-$$"
 cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$scratch"; }
 docker run --name "$container" -e POSTGRES_PASSWORD=isolated-test-only -d postgres:17-alpine >/dev/null
 for attempt in {1..30}; do if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
 sql() { docker exec -i "$container" psql -h 127.0.0.1 -X -q -U postgres -v ON_ERROR_STOP=1 "$@"; }
 bootstrap() { sql < tests/db-bootstrap.sql; }
fi
trap cleanup EXIT
bootstrap
sql <<'SQL'
CREATE SCHEMA supabase_migrations;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text,created_by text,idempotency_key text UNIQUE,rollback text[]);
SQL
node scripts/operations/envelopes.mjs "$scratch/envelopes"
for file in "$scratch"/envelopes/*.sql; do
 [[ "$file" == *profile_consent.sql || "$file" == *password_entry.sql ]] && continue
 sql < "$file"
done
sql < supabase/seed.sql
# Existing upgrade fixture is synthetic, with unique credentials for 009.
sql < tests/password-upgrade-prepare.sql > "$scratch/fixtures.log"
sql <<'SQL'
CREATE SCHEMA operations_evidence;
ALTER TABLE password_upgrade_evidence SET SCHEMA operations_evidence;
ALTER TABLE password_upgrade_counts SET SCHEMA operations_evidence;
ALTER TABLE password_upgrade_rows SET SCHEMA operations_evidence;
ALTER TABLE password_upgrade_functions SET SCHEMA operations_evidence;
SQL
sql <<'SQL'
CREATE TABLE operations_evidence.preclaimed AS SELECT id,status,attempts,locked_at FROM public.claim_notifications(1);
DO $$ BEGIN IF (SELECT count(*) FROM operations_evidence.preclaimed)<>1 THEN RAISE EXCEPTION 'pre-barrier claim not exercised'; END IF; END $$;
UPDATE operations_evidence.password_upgrade_rows SET rows=(SELECT jsonb_agg(to_jsonb(j) ORDER BY to_jsonb(j)::text) FROM public.notification_jobs j) WHERE table_name='notification_jobs';
SELECT count(*) FROM public.claim_notifications(0);
SELECT count(*) FROM public.claim_sheet_jobs(0);
SQL
if sql -v operator_login=authenticated < scripts/operations/install-maintenance.sql > "$scratch/invalid-install.log" 2>&1; then echo 'Untrusted operator accepted' >&2; exit 1; fi
sql <<'SQL'
DO $$ BEGIN IF to_regnamespace('deployment_guard') IS NOT NULL THEN RAISE EXCEPTION 'failed install left residue'; END IF; END $$;
SQL
sql -v operator_login=postgres < scripts/operations/install-maintenance.sql
sql < tests/operations/blocked.sql
sql < "$scratch"/envelopes/*profile_consent.sql
# Validate the only row additions allowed by 008, then capture its RPC catalog for 009.
sql <<'SQL'
DO $$ DECLARE t record; data jsonb; BEGIN
 FOR t IN SELECT * FROM operations_evidence.password_upgrade_rows LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) - %L ORDER BY (to_jsonb(r) - %L)::text), ''[]''::jsonb) FROM public.%I r',
    CASE t.table_name WHEN 'guest_contacts' THEN 'communications_revoked' WHEN 'notification_jobs' THEN 'delivery_started_at' ELSE '__absent__' END,
    CASE t.table_name WHEN 'guest_contacts' THEN 'communications_revoked' WHEN 'notification_jobs' THEN 'delivery_started_at' ELSE '__absent__' END,t.table_name) INTO data;
  IF data IS DISTINCT FROM t.rows THEN RAISE EXCEPTION '008 changed existing row values'; END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text), ''[]''::jsonb) FROM public.%I r',t.table_name) INTO data;
  UPDATE operations_evidence.password_upgrade_rows SET rows=data WHERE table_name=t.table_name;
 END LOOP;
END $$;
TRUNCATE operations_evidence.password_upgrade_functions;
INSERT INTO operations_evidence.password_upgrade_functions
SELECT p.oid,pg_get_functiondef(p.oid),p.proacl,p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prokind='f' AND p.proname<>'create_individual_access';
SQL
sql < "$scratch"/envelopes/*password_entry.sql
sql <<'SQL'
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM operations_evidence.preclaimed p JOIN public.notification_jobs j ON j.id=p.id WHERE j.status='processing' AND j.locked_at=p.locked_at AND j.attempts=p.attempts) THEN RAISE EXCEPTION 'pre-claim state lost; ambiguous outcomes must STOP release'; END IF;
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>9 THEN RAISE EXCEPTION 'history not atomic/canonical'; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='guest_contacts' AND column_name='communications_revoked') THEN RAISE EXCEPTION '008 absent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM deployment_guard.inventory WHERE table_oid='password_entry_private.attempt_limits'::regclass) THEN RAISE EXCEPTION 'private registry outside barrier'; END IF;
END $$;
SQL
DENO_DIR="${DENO_DIR:-/tmp/wedding-deno}" node_modules/.bin/deno test --config supabase/functions/deno.json --allow-env supabase/functions/_shared/maintenance.test.ts
sql < scripts/operations/deactivate-maintenance.sql
sql < scripts/operations/activate-maintenance.sql
sql < scripts/operations/remove-maintenance.sql
sql <<'SQL'
DO $$ BEGIN
 IF to_regnamespace('deployment_guard') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='deployment_write_guard') THEN RAISE EXCEPTION 'maintenance residue'; END IF;
END $$;
SQL
{ echo 'SET search_path=public,operations_evidence;'; cat tests/password-upgrade-verify.sql; } | sql
sql <<'SQL'
SET SESSION AUTHORIZATION maintenance_api;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','ffcd0000-0000-4000-8000-000000000001',false);
DO $$ DECLARE gid uuid; first_result jsonb; retry_result jsonb; BEGIN
 SELECT id INTO gid FROM public.guests WHERE name='Preexisting individual';
 first_result=public.app_mutate('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000099','RSVP_UPDATE',jsonb_build_object('guest_id',gid,'status','CONFIRMED'));
 retry_result=public.app_mutate('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000099','RSVP_UPDATE',jsonb_build_object('guest_id',gid,'status','CONFIRMED'));
 IF first_result->>'ok'<>'true' OR retry_result->>'duplicate'<>'true' THEN RAISE EXCEPTION 'old queue retry not idempotent after reopening'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
SQL
sql < tests/profile-consent.sql > "$scratch/profile.log"
sql < tests/profile-dispatch.sql > "$scratch/dispatch.log"
sql < tests/password-entry.sql > "$scratch/password.log"
printf '%s\n' 'Maintenance: synthetic baseline -> barrier -> 008 -> 009 -> removal; API roles/definer/zero rows and canonical history passed.'
