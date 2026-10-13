#!/usr/bin/env bash
set -euo pipefail
# Manual only. No credentials in arguments; use a secure libpq service.
[[ $# == 3 ]] || { echo 'Usage: snapshot.sh <dev|production> <PGSERVICE> <private-directory>' >&2; exit 1; }
[[ "$1" == dev || "$1" == production ]] || exit 1
[[ "${ALLOW_LOGICAL_SNAPSHOT:-}" == "explicitly-authorized-$1" ]] || { echo 'Explicit snapshot authorization required' >&2; exit 1; }
repo=$(git rev-parse --show-toplevel)
output=$(realpath -m "$3")
[[ "$output" != "$repo" && "$output" != "$repo/"* && "$output" != */public && "$output" != */public/* ]] || exit 1
[[ ! -e "$output" ]] || { echo 'Refusing existing output directory' >&2; exit 1; }
umask 077
mkdir -p "$output"
# The operator must verify project/connection identity separately before authorizing.
# Explicit application schemas only; never clone managed Auth/Storage or secrets.
schemas=(--schema=public --schema=supabase_migrations)
for schema in ${SNAPSHOT_PRIVATE_SCHEMAS:-}; do
 [[ "$schema" =~ ^[a-z_][a-z0-9_]*$ && "$schema" != auth && "$schema" != storage && "$schema" != vault && "$schema" != extensions && "$schema" != deployment_guard ]] || exit 1
 schemas+=("--schema=$schema")
done
pg_dump "service=$2" --format=custom "${schemas[@]}" --file="$output/application.dump"
pg_restore --list "$output/application.dump" > "$output/catalog.txt"
sha256sum "$output/application.dump" > "$output/checksum.txt"
printf 'scope=public,supabase_migrations\nauth=false\nstorage=false\nsecrets=false\npitr=false\nenvironment=%s\n' "$1" > "$output/manifest.txt"
# No data or credentials printed. Catalog itself stays private.
printf 'private_schemas=%s\n' "${SNAPSHOT_PRIVATE_SCHEMAS:-none}" >> "$output/manifest.txt"
echo 'Snapshot captured outside repository; structural review and encrypted storage required.'
