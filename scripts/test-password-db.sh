#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${GITHUB_ACTIONS:-false}" == true ]]; then
 scratch=$(mktemp -d /tmp/password-preflight.XXXXXX)
 prefix="password_${GITHUB_RUN_ID:-0}_$$_${RANDOM}"
 cleanup() { for scenario in clean upgrade; do sudo -u postgres dropdb --if-exists "${prefix}_${scenario}"; done; rm -rf "$scratch"; }
 sudo systemctl start postgresql.service
 sql() { sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$database"; }
 create_db() { sudo -u postgres createdb "$1"; }
else
 scratch=$(mktemp -d /tmp/password-preflight.XXXXXX)
 container="password-compare-$RANDOM-$$"; prefix=password
 cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$scratch"; }
 trap cleanup EXIT
 docker run --name "$container" -e POSTGRES_PASSWORD=isolated-test-only -d postgres:17-alpine >/dev/null
 for attempt in {1..30}; do if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
 sql() { docker exec -i "$container" psql -h 127.0.0.1 -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database"; }
 create_db() { docker exec "$container" createdb -h 127.0.0.1 -U postgres "$1"; }
fi
trap cleanup EXIT
for scenario in clean upgrade; do
 database="${prefix}_${scenario}"; create_db "$database"
 if [[ "$scenario" == clean && "${GITHUB_ACTIONS:-false}" != true ]]; then sql < tests/db-bootstrap.sql >/dev/null;
 else sed '/^create role /d' tests/db-bootstrap.sql | sql >/dev/null; fi
 for migration in supabase/migrations/20261009000*.sql supabase/migrations/202610110007_home_greeting.sql; do sql < "$migration" >/dev/null; done
 sql < supabase/seed.sql >/dev/null
 if [[ "$scenario" == clean ]]; then sql < supabase/migrations/202610110008_profile_consent.sql >/dev/null; fi
 # A legacy collision must abort installation, with only aggregate diagnostics.
 sql <<'SQL' >/dev/null
insert into invitations(id,event_id,name,code_hash) values
('ffcb0000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Preflight fixture',repeat('b',64)),
('ffcb0000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','Preflight fixture',repeat('c',64));
insert into invitation_access(event_id,invitation_id,pin) values
('00000000-0000-4000-8000-000000000001','ffcb0000-0000-4000-8000-000000000001','9762'),
('00000000-0000-4000-8000-000000000001','ffcb0000-0000-4000-8000-000000000002','9762');
SQL
 if sql < supabase/migrations/202610120009_password_entry.sql > "$scratch/preflight" 2>&1; then echo 'Preflight incorrectly accepted duplicate credentials' >&2; exit 1; fi
 grep -Fq 'password entry preflight: 1 collision groups in 1 events; credentials unchanged' "$scratch/preflight"
 sql <<'SQL' >/dev/null
do $$begin
 if exists(select 1 from pg_namespace where nspname='password_entry_private') or
 (select count(*) from invitation_access where invitation_id in ('ffcb0000-0000-4000-8000-000000000001','ffcb0000-0000-4000-8000-000000000002') and pin='9762')<>2 then raise exception 'preflight changed credentials';end if;
end$$;
delete from invitations where id in ('ffcb0000-0000-4000-8000-000000000001','ffcb0000-0000-4000-8000-000000000002');
SQL
 sql < tests/password-upgrade-prepare.sql >/dev/null
 sql < supabase/migrations/202610120009_password_entry.sql >/dev/null
 sql < tests/password-upgrade-verify.sql >/dev/null
 sql < tests/password-entry.sql >/dev/null
 sql < tests/password-allocation.sql >/dev/null
 sql < tests/password-final-catalog.sql > "$scratch/$scenario.json"
 if [[ "${GITHUB_ACTIONS:-false}" == true ]]; then python3 tests/password-concurrency.py --database "$database";
 else python3 tests/password-concurrency.py --container "$container" --database "$database"; fi
done
cmp "$scratch/clean.json" "$scratch/upgrade.json"
echo 'Password 009: clean with 008 and upgrade without 008, preserved credentials and independent-connection concurrency passed.'
