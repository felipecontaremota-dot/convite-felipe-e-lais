#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
scratch=$(mktemp -d /tmp/profile-comparison.XXXXXX)
if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then
 prefix="profile_compare_${GITHUB_RUN_ID:-0}_$$_${RANDOM}"
 cleanup() { sudo -u postgres dropdb --if-exists "${prefix}_clean"; sudo -u postgres dropdb --if-exists "${prefix}_upgrade"; rm -rf "$scratch"; }
 sudo systemctl start postgresql.service
 sql() { sudo -u postgres psql -X -qAt -v ON_ERROR_STOP=1 -d "$database"; }
 create_db() { sudo -u postgres createdb "$1"; }
else
 container="profile-comparison-$RANDOM-$$"
 prefix=profile
 cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; rm -rf "$scratch"; }
 trap cleanup EXIT
 docker run --name "$container" -e POSTGRES_PASSWORD=isolated-test-only -d postgres:17-alpine >/dev/null
 for attempt in {1..30}; do if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
 sql() { docker exec -i "$container" psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d "$database"; }
 create_db() { docker exec "$container" createdb -U postgres "$1"; }
fi
trap cleanup EXIT
for scenario in clean upgrade; do
 database="${prefix}_${scenario}"
 create_db "$database"
 if [[ "$scenario" == clean && "${GITHUB_ACTIONS:-false}" != true ]]; then sql < tests/db-bootstrap.sql >/dev/null;
 else sed '/^create role /d' tests/db-bootstrap.sql | sql >/dev/null; fi
 for migration in supabase/migrations/20261009000*.sql supabase/migrations/202610110007_home_greeting.sql; do sql < "$migration" >/dev/null; done
 if [[ "$scenario" == upgrade ]]; then sql < tests/profile-upgrade-prepare.sql >/dev/null; fi
 sql < supabase/migrations/202610110008_profile_consent.sql >/dev/null
 if [[ "$scenario" == upgrade ]]; then sql < tests/profile-upgrade-verify.sql >/dev/null; fi
 sql < supabase/seed.sql >/dev/null
 sql < tests/profile-consent.sql >/dev/null
 sql < tests/profile-dispatch.sql >/dev/null
 sql < tests/profile-final-catalog.sql > "$scratch/$scenario.json"
 if [[ "${GITHUB_ACTIONS:-false}" == true ]]; then python3 tests/profile-concurrency.py --database "$database";
 else python3 tests/profile-concurrency.py --container "$container" --database "$database"; fi
done
cmp "$scratch/clean.json" "$scratch/upgrade.json"
echo 'Profile 008: clean install and production-shaped upgrade have identical final catalogs; independent-connection concurrency passed.'
