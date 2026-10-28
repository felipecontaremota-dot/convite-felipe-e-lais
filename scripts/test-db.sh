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
for source in tests/db-bootstrap.sql $(find supabase/migrations -maxdepth 1 -type f -name '*.sql' ! -name '20261013230000_production_consolidation.sql' | sort) supabase/seed.sql tests/database.sql tests/access-database.sql tests/access-units.sql tests/message-recipients.sql tests/message-retry.sql tests/invitation-deliveries.sql tests/message-dispatch.sql tests/message-announcements.sql tests/invitation-retry.sql tests/profile-consent.sql tests/password-entry.sql tests/password-allocation.sql; do
 if [[ "$source" == *wedding_planning.sql || "$source" == *notification_soft_delete.sql || "$source" == *notification_scheduler.sql || "$source" == *general_notifications.sql || "$source" == supabase/migrations/20261013204105_name_pin_access.sql || "$source" == *replace_ticket_compare_and_swap.sql || "$source" == *checkin_history_actor_role.sql || "$source" == *checkin_reversal_history.sql || "$source" == *ceremonial_portal.sql || "$source" == *admin_guest_rsvp_sending.sql || "$source" == *link_responsible_identity.sql || "$source" == *messaging_conversations.sql ]]; then continue; fi
 if [[ "$source" == supabase/migrations/202610090004_access_units.sql ]]; then
  run_sql < tests/access-upgrade-prepare.sql
 fi
 if [[ "$source" == supabase/migrations/202610090006_invitation_deliveries.sql ]]; then
  run_sql < tests/message-upgrade-prepare.sql
 fi
 run_sql < "$source"
 if [[ "$source" == supabase/migrations/202610090006_invitation_deliveries.sql ]]; then
  run_sql < tests/message-upgrade-verify.sql
 fi
 if [[ "$source" == supabase/migrations/202610090004_access_units.sql ]]; then
  run_sql < tests/access-upgrade-verify.sql
 fi
done

# Preserve the historical 009 assertions above; validate the new final behavior separately.
run_sql < tests/name-backfill-prepare.sql
run_sql < supabase/migrations/20261013204105_name_pin_access.sql
run_sql < tests/name-backfill-verify.sql
run_sql < tests/name-normalization.sql
run_sql < tests/name-pin-access.sql
if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then python3 tests/name-pin-concurrency.py --database "$database";
else python3 tests/name-pin-concurrency.py --container "$container"; fi

# Dedicated production-shaped 007 -> 008 upgrade, separate from clean install.
if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then
 profile_database="${database}_profile"
 original_database="$database"
 cleanup() { sudo -u postgres dropdb --if-exists "$original_database"; sudo -u postgres dropdb --if-exists "$profile_database"; }
 sudo -u postgres createdb "$profile_database"
 database="$profile_database"
else
 docker exec "$container" createdb -U postgres profile_upgrade
 run_sql() { docker exec -i "$container" psql -h 127.0.0.1 -U postgres -d profile_upgrade -v ON_ERROR_STOP=1; }
fi
sed '/^create role /d' tests/db-bootstrap.sql | run_sql
for migration in supabase/migrations/20261009000*.sql supabase/migrations/202610110007_home_greeting.sql; do run_sql < "$migration"; done
run_sql < tests/profile-upgrade-prepare.sql
run_sql < supabase/migrations/202610110008_profile_consent.sql
run_sql < tests/profile-upgrade-verify.sql
# The new login also upgrades a 007/008 database without installing retired 009.
run_sql < supabase/seed.sql
run_sql < tests/name-backfill-prepare.sql
run_sql < supabase/migrations/20261013204105_name_pin_access.sql
run_sql < tests/name-backfill-verify.sql
run_sql < tests/name-normalization.sql
run_sql < tests/name-pin-access.sql
if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then
 database="$original_database"
 sudo -u postgres dropdb "$profile_database"
else
 docker exec "$container" dropdb -U postgres profile_upgrade
 run_sql() { docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1; }
fi

# Separate historical baseline DB from the full current-migrations database.
if [[ "${GITHUB_ACTIONS:-false}" == "true" ]]; then
 rebuild_database="${database}_baseline"
 sudo -u postgres createdb "$rebuild_database"
 original_database="$database"
 cleanup() { sudo -u postgres dropdb --if-exists "$original_database"; sudo -u postgres dropdb --if-exists "$rebuild_database"; }
 database="$rebuild_database"
 source scripts/rebuild-pr21/test-rebuild.sh
 run_sql < tests/name-backfill-prepare.sql
 run_sql < supabase/migrations/20261013204105_name_pin_access.sql
 run_sql < tests/name-backfill-verify.sql
 run_sql < tests/name-normalization.sql
 run_sql < tests/name-pin-access.sql
 database="$original_database"
else
 docker exec "$container" createdb -U postgres rebuild_baseline
 run_sql() { docker exec -i "$container" psql -h 127.0.0.1 -U postgres -d rebuild_baseline -v ON_ERROR_STOP=1; }
 source scripts/rebuild-pr21/test-rebuild.sh
 run_sql < tests/name-backfill-prepare.sql
 run_sql < supabase/migrations/20261013204105_name_pin_access.sql
 run_sql < tests/name-backfill-verify.sql
 run_sql < tests/name-normalization.sql
 run_sql < tests/name-pin-access.sql
 run_sql() { docker exec -i "$container" psql -h 127.0.0.1 -U postgres -v ON_ERROR_STOP=1; }
fi

# Independent clean-008 and production-shaped upgrade catalogs, plus concurrent sessions.
bash scripts/test-profile-db.sh

# Independent 009 install/upgrade and real concurrent transactions.
bash scripts/test-password-db.sh

# Messaging extension is tested after historical contracts, never against production.
run_sql < tests/messaging-upgrade-prepare.sql
run_sql < supabase/migrations/20261014171048_messaging_conversations.sql
run_sql < tests/messaging-upgrade-verify.sql
run_sql < tests/messaging-conversations.sql

# Manual PROD compatibility is validated in independent pre-name/PIN and current baselines.
bash scripts/test-messaging-prod.sh

# First-login confirmation is also exercised with the latest public wrappers.
run_sql < tests/profile-confirmation.sql
run_sql < scripts/profile-confirmation-postflight.sql

# Dedicated upgrade with a guest and a verified session created BEFORE the new schema.
npx --no-install tsx scripts/test-profile-confirmation.ts

# Additive wedding party lifecycle; fixtures use canonical access-unit creation.
run_sql < tests/wedding-party.sql
run_sql < scripts/wedding-party-postflight.sql

# Link-only responsible identity, after the historical name/PIN wrappers above.
run_sql < supabase/migrations/20261021003009_link_responsible_identity.sql
run_sql < tests/link-responsible-identity.sql

# Independent incremental upgrade with historical individual email receipts.
npx --no-install tsx scripts/test-admin-guest-status.ts

npx tsx scripts/test-ceremonial.ts

npx tsx scripts/test-ticket-replacement.ts

npx tsx scripts/test-party-content.ts

npx tsx scripts/test-notifications.ts

npx tsx scripts/test-notification-delete.ts

npx tsx scripts/test-planning.ts
