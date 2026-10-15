#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="messaging-compat-$RANDOM-$$"
database="messaging_compat_${GITHUB_RUN_ID:-0}_$$_${RANDOM}"
if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then
 sudo systemctl start postgresql.service
 cleanup() { sudo -u postgres dropdb --if-exists "$database"; }
 sql() { sudo -u postgres psql -d "$database" -v ON_ERROR_STOP=1; }
else
 cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
 docker run --name "$container" -e POSTGRES_PASSWORD=isolated-test-only -d postgres:17-alpine >/dev/null
 for attempt in {1..30}; do if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
 sql() { docker exec -i "$container" psql -h 127.0.0.1 -U postgres -d "$database" -v ON_ERROR_STOP=1; }
fi
trap cleanup EXIT
for baseline in profile name confirmation; do
 if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then sudo -u postgres createdb "$database"; else docker exec "$container" createdb -h 127.0.0.1 -U postgres "$database"; fi
 sed -E 's/create role ([a-z_]+) ([^;]+);/DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=\x27\1\x27) THEN CREATE ROLE \1 \2; END IF; END$$;/' tests/db-bootstrap.sql | sql
 for migration in supabase/migrations/20261009000*.sql supabase/migrations/202610110007_home_greeting.sql supabase/migrations/202610110008_profile_consent.sql supabase/migrations/202610120009_password_entry.sql; do sql < "$migration"; done
 if [[ "$baseline" != profile ]]; then sql < supabase/migrations/20261013204105_name_pin_access.sql; fi
 if [[ "$baseline" == confirmation ]]; then sql < supabase/migrations/20261015033043_profile_confirmation.sql; fi
 sql < supabase/seed.sql
 sql <<'SQL'
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
insert into supabase_migrations.schema_migrations values('20261013172239','20261013125226_profile_consent',null),('20261013172244','20261013125227_password_entry',null);
SQL
 sql < tests/profile-consent.sql
 if [[ "$baseline" == profile ]]; then sql < tests/password-entry.sql; else sql < tests/name-pin-access.sql; fi
 # PROD has default table DML grants, but exact SELECT-only RLS denies direct writes.
 sql <<'SQL'
grant select,insert,update,delete on messages,announcements,notification_jobs,message_recipients to authenticated,anon;
SQL
 sql < tests/messaging-upgrade-prepare.sql
 sql < tests/messaging-prod-preserve-prepare.sql
 sql < tests/messaging-prod-direct-write.sql
 sql < scripts/messaging-prod/preflight-readonly.sql
 if [[ "$baseline" == profile ]]; then
  if sql < supabase/migrations/20261014171048_messaging_conversations.sql > /tmp/messaging-original-guard-$$.log 2>&1; then echo 'ERROR: original accepted absent name/PIN marker'; exit 1; fi
 fi
 # A partial install must fail before schema changes.
 sql <<'SQL'
alter table messages add column deleted_at timestamptz;
SQL
 if sql < scripts/messaging-prod/install.sql > /tmp/messaging-partial-$$.log 2>&1; then echo 'ERROR: partial schema accepted';exit 1; fi
 sql <<'SQL'
alter table messages drop column deleted_at;
SQL
 sql < scripts/messaging-prod/install.sql
 sql < scripts/messaging-prod/verify-readonly.sql
 # Policy drift cannot be accepted as equivalent merely because functions exist.
 if { printf 'begin; alter policy own_message_reads on public.message_reads using(true);\n'; sed -n '/^DO \$verify\$/,/^END \$verify\$;/p' scripts/messaging-prod/verify-readonly.sql; } | sql > /tmp/messaging-policy-$$.log 2>&1; then echo 'ERROR: broad policy accepted';exit 1; fi
 sql < scripts/messaging-prod/verify-readonly.sql
 sql < tests/messaging-prod-preserve-verify.sql
 sql < tests/messaging-prod-direct-write.sql
 sql < tests/messaging-upgrade-verify.sql
 sql < tests/messaging-conversations.sql
 sql < tests/profile-consent.sql
 if [[ "$baseline" == profile ]]; then sql < tests/password-entry.sql; else sql < tests/name-pin-access.sql; fi
 sql < tests/messaging-prod-functional.sql
 if sql < scripts/messaging-prod/install.sql > /tmp/messaging-repeat-$$.log 2>&1; then echo 'ERROR: second installation accepted';exit 1; fi
 # Original cannot be applied on top; no DDL survives this failure.
 if sql < supabase/migrations/20261014171048_messaging_conversations.sql > /tmp/messaging-original-repeat-$$.log 2>&1; then echo 'ERROR: original reapplied';exit 1; fi
 sql < scripts/messaging-prod/register-equivalent.sql
 sql < scripts/messaging-prod/register-equivalent.sql
 sql < scripts/messaging-prod/disable-new-actions.sql
 sql < tests/messaging-prod-disabled.sql
 sql < scripts/messaging-prod/enable-new-actions.sql
 sql < scripts/messaging-prod/verify-readonly.sql
 if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then sudo -u postgres dropdb "$database"; else docker exec "$container" dropdb -h 127.0.0.1 -U postgres "$database"; fi
 echo "Messaging compatibility baseline $baseline passed: upgrade, preservation, RLS, partial/repeat guards and safe disable."
done
