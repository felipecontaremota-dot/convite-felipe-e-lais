#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${REBUILD_DATABASE_URL:?Provide a database connection securely; never paste it in chat}"
: "${REBUILD_ADMIN_USER_ID:?Confirm the existing non-anonymous Auth UUID}"
[[ "${REBUILD_CONFIRMATION:-}" == DISCARD_TEST_DATA_REBUILD_PR21 ]] || { echo 'Explicit discard confirmation required' >&2; exit 1; }
# No db push, schema_migrations write, remote deploy or hidden cleanup.
files=(scripts/rebuild-pr21/cleanup-reviewed.sql
 supabase/migrations/202610090001_foundation.sql
 supabase/migrations/202610090002_operations.sql
 supabase/migrations/202610090003_access_families.sql
 supabase/migrations/202610090004_access_units.sql
 supabase/migrations/202610090005_message_recipients.sql
 supabase/migrations/202610090006_invitation_deliveries.sql
 supabase/seed.sql scripts/rebuild-pr21/bootstrap-reviewed.sql)
args=()
for file in "${files[@]}"; do args+=(--file="$file"); done
# A private libpq service file avoids exposing the password-bearing URL in argv.
service_file=$(python3 - <<'PYTHON'
import os, tempfile
from urllib.parse import urlsplit, unquote, parse_qsl
url = urlsplit(os.environ['REBUILD_DATABASE_URL'])
if url.scheme not in ('postgres', 'postgresql') or not url.hostname or not url.path.strip('/'):
    raise SystemExit('Provide a valid PostgreSQL URI')
values = dict(parse_qsl(url.query))
values.update(host=url.hostname, port=str(url.port or 5432), dbname=unquote(url.path[1:]))
if url.username is not None: values['user'] = unquote(url.username)
if url.password is not None: values['password'] = unquote(url.password)
if any('\n' in key or '\r' in key or '=' in key or '\n' in value or '\r' in value for key, value in values.items()):
    raise SystemExit('Unsupported newline in connection parameters')
fd, path = tempfile.mkstemp(prefix='wedding-rebuild-', suffix='.conf')
with os.fdopen(fd, 'w') as file:
    file.write('[wedding_rebuild]\n')
    for key, value in values.items(): file.write(key + '=' + value + '\n')
print(path)
PYTHON
)
trap 'rm -f "$service_file"' EXIT
PGSERVICEFILE="$service_file" PGSERVICE=wedding_rebuild psql -X --set=ON_ERROR_STOP=1 --single-transaction \
 --set=admin_user_id="$REBUILD_ADMIN_USER_ID" \
 --command="select set_config('wedding.rebuild_confirmation','DISCARD_TEST_DATA_REBUILD_PR21',true)" "${args[@]}"
