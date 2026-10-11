select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Existing guest before Home upgrade"}'::jsonb);
create table rebuild_test.home_existing as select id,to_jsonb(g) as row from public.guests g;
create table rebuild_test.home_access as select to_jsonb(a) as row from public.invitation_access a;
create table rebuild_test.home_functions as
 select p.proname,pg_get_function_identity_arguments(p.oid) as signature,pg_get_functiondef(p.oid) as definition,p.proacl::text as acl,pg_get_userbyid(p.proowner) as owner
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';
