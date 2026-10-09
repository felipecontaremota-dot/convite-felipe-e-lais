#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="wedding-test-$RANDOM-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --name "$container" -e POSTGRES_PASSWORD=isolated-test-only -d postgres:17-alpine >/dev/null
for attempt in {1..30}; do if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
for source in tests/db-bootstrap.sql supabase/migrations/*.sql supabase/seed.sql tests/database.sql tests/access-database.sql tests/access-units.sql; do
 if [[ "$source" == supabase/migrations/202610090004_access_units.sql ]]; then
  docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < tests/access-upgrade-prepare.sql
 fi
 docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < "$source"
 if [[ "$source" == supabase/migrations/202610090004_access_units.sql ]]; then
  docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1 < tests/access-upgrade-verify.sql
 fi
done
