#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then
 database="wedding_test_${GITHUB_RUN_ID:-0}_${GITHUB_RUN_ATTEMPT:-0}_$$_${RANDOM}"
 cleanup() { sudo -u postgres dropdb --if-exists "$database"; }
 sudo systemctl start postgresql.service
 sudo -u postgres createdb "$database"
 trap cleanup EXIT
 run_sql() { sudo -u postgres psql -d "$database" -v ON_ERROR_STOP=1; }
else
 container="wedding-test-$RANDOM-$$"
 cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
 trap cleanup EXIT
 docker run --name "$container" -e POSTGRES_PASSWORD=isolated-test-only -d postgres:17-alpine >/dev/null
 for attempt in {1..30}; do if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi; sleep 1; done
 run_sql() { docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1; }
fi
for source in tests/db-bootstrap.sql supabase/migrations/*.sql supabase/seed.sql tests/database.sql tests/access-database.sql tests/access-units.sql tests/message-recipients.sql tests/message-retry.sql tests/invitation-deliveries.sql tests/message-dispatch.sql tests/message-announcements.sql tests/invitation-retry.sql; do
 if [[ "$source" == supabase/migrations/202610090004_access_units.sql ]]; then
  run_sql < tests/access-upgrade-prepare.sql
 fi
 if [[ "$source" == supabase/migrations/202610090006_invitation_deliveries.sql ]]; then
  run_sql < tests/message-upgrade-prepare.sql
 fi
 if [[ "$source" == supabase/migrations/202610100007_guest_invitations.sql ]]; then
  run_sql < tests/guest-upgrade-prepare.sql
 fi
 if [[ "$source" == supabase/migrations/202610100008_guest_access.sql ]]; then
  run_sql < tests/guest-access-upgrade-prepare.sql
 fi
 if [[ "$source" == supabase/migrations/202610100009_restore_pr21_contracts.sql ]]; then
  run_sql < tests/rollback-upgrade-prepare.sql
 fi
 run_sql < "$source"
 if [[ "$source" == supabase/migrations/202610100009_restore_pr21_contracts.sql ]]; then
  run_sql < tests/rollback-upgrade-verify.sql
  run_sql < tests/rollback-database.sql
 fi
 if [[ "$source" == supabase/migrations/202610100008_guest_access.sql ]]; then
  run_sql < tests/guest-access-upgrade-verify.sql
 fi
 if [[ "$source" == supabase/migrations/202610100007_guest_invitations.sql ]]; then
  run_sql < tests/guest-upgrade-verify.sql
 fi
 if [[ "$source" == supabase/migrations/202610090006_invitation_deliveries.sql ]]; then
  run_sql < tests/message-upgrade-verify.sql
 fi
 if [[ "$source" == supabase/migrations/202610090004_access_units.sql ]]; then
  run_sql < tests/access-upgrade-verify.sql
 fi
done
