# Sourced by scripts/test-db.sh; uses its disposable DB and run_sql adapter.
# Existing baseline SQL tests roll back their fixtures.
run_sql <<'SQL'
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111');
\set admin_user_id 11111111-1111-4111-8111-111111111111
SQL
run_sql < <(cat <<'SQL'
\set admin_user_id 11111111-1111-4111-8111-111111111111
begin;
SQL
cat scripts/rebuild-pr21/bootstrap-reviewed.sql
printf '\ncommit;\n'
cat tests/rebuild-catalog.sql)
run_sql < tests/fixtures/post-pr21/202610100007_guest_invitations.sql
run_sql < tests/fixtures/post-pr21/202610100008_guest_access.sql
run_sql < tests/rebuild-prepare.sql
# Cross-schema dependencies must block cleanup and roll back earlier DDL.
run_sql <<'SQL'
create table storage.external_guard(guest_id uuid references public.guests(id));
SQL
if run_sql < <(printf "begin; select set_config('wedding.rebuild_confirmation','DISCARD_TEST_DATA_REBUILD_PR21',true);\n"; cat scripts/rebuild-pr21/cleanup-reviewed.sql) > /tmp/rebuild-restrict-error.log 2>&1; then
 echo 'ERROR: cleanup accepted an external dependency' >&2; exit 1
fi
# Bash builtin: GitHub runners need not have ripgrep installed.
case "$(< /tmp/rebuild-restrict-error.log)" in
 *external_guard*) printf 'External dependency blocked cleanup as expected\n' ;;
 *) cat /tmp/rebuild-restrict-error.log; exit 1 ;;
esac
run_sql <<'SQL'
do $$begin
 if to_regclass('public.family_qr_credentials') is null or not exists(select 1 from public.guests) then raise exception 'Failed cleanup did not roll back';end if;
 if not exists(select 1 from pg_policies where tablename='family_qr_credentials') then raise exception 'Policies not restored after aborted cleanup';end if;
end $$;
drop table storage.external_guard;
SQL
run_sql < <(cat <<'SQL'
\set admin_user_id 11111111-1111-4111-8111-111111111111
begin;
select set_config('wedding.rebuild_confirmation','DISCARD_TEST_DATA_REBUILD_PR21',true);
SQL
cat scripts/rebuild-pr21/cleanup-reviewed.sql supabase/migrations/20261009000*.sql supabase/seed.sql scripts/rebuild-pr21/bootstrap-reviewed.sql
printf '\ncommit;\n'
printf "select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);\n"
cat tests/rebuild-verify.sql)
