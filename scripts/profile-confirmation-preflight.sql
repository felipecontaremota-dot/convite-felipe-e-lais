-- READ ONLY. Run immediately before the reviewed migration, not instead of a backup.
begin transaction read only;
DO $check$
declare item text;
begin
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261015033043') then raise exception 'STOP: confirmation already registered; inspect actual structure';end if;
 if current_user<>'postgres' then raise exception 'STOP: reviewed postgres owner required';end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'untrusted public schema writer';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and (table_name='guests' and column_name='profile_confirmed_at' or table_name='invitation_sessions' and column_name='profile_guest_id')) or to_regprocedure('public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)') is not null or to_regprocedure('public.profile_confirmation_snapshot_core(uuid)') is not null then raise exception 'profile confirmation partial or already installed';end if;
 if to_regprocedure('public.internal_mutation_core(uuid,uuid,text,jsonb)') is null or to_regprocedure('public.internal_snapshot_core(uuid)') is null or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='guest_contacts' and column_name='communications_revoked') then raise exception 'profile confirmation requires profile/consent baseline';end if;
 foreach item in array array['public.internal_mutation_core(uuid,uuid,text,jsonb)','public.internal_snapshot_core(uuid)'] loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(item) and proowner='postgres'::regrole and prosecdef and prorettype='jsonb'::regtype and proconfig=array['search_path=public, extensions, pg_temp']) or has_function_privilege('anon',item,'EXECUTE') or has_function_privilege('authenticated',item,'EXECUTE') or has_function_privilege('service_role',item,'EXECUTE') then raise exception 'profile baseline owner/config/ACL drift';end if;
 end loop;
 if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) or exists(select 1 from pg_class where oid in ('public.guests'::regclass,'public.guest_contacts'::regclass,'public.invitation_sessions'::regclass) and (not relrowsecurity or relowner in ('anon'::regrole,'authenticated'::regrole))) or exists(select 1 from pg_policies where schemaname='public' and tablename in ('guests','guest_contacts','invitation_sessions') and cmd<>'SELECT') then raise exception 'profile baseline RLS drift';end if;
 if position('MESSAGE_SEND_TO_GUESTS' in pg_get_functiondef('public.internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure))=0 or position('app_snapshot_v5' in pg_get_functiondef('public.internal_snapshot_core(uuid)'::regprocedure))=0 then raise exception 'profile baseline delegation drift';end if;

 -- Reviewed immutable profile delegation contracts, not nominal version names.
 if not exists(select 1 from pg_proc where oid='public.internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure and md5(replace(prosrc,E'\r','')) in ('ef2fd1b7f6dd0dd55090b4fa8336d227')) then raise exception 'profile baseline source drift';end if;
 if not exists(select 1 from pg_proc where oid='public.internal_snapshot_core(uuid)'::regprocedure and md5(replace(prosrc,E'\r','')) in ('20c1ef3917626d85a5a0da71c8365172')) then raise exception 'profile baseline source drift';end if;
 if not exists(select 1 from pg_class where oid='public.guests'::regclass and relrowsecurity) or not exists(select 1 from pg_class where oid='public.guest_contacts'::regclass and relrowsecurity) or not exists(select 1 from pg_class where oid='public.invitation_sessions'::regclass and relrowsecurity) then raise exception 'STOP: profile RLS missing';end if;
 if exists(select 1 from pg_policies where schemaname='public' and tablename in ('guests','guest_contacts','invitation_sessions') and cmd<>'SELECT') or exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolbypassrls or rolsuper)) then raise exception 'STOP: unexpected direct write/bypass';end if;
end $check$;
select 'READY_FOR_MIGRATION_GATE: review contracts, project and backup' status;
select version,name from supabase_migrations.schema_migrations order by version;
select oid::regprocedure::text signature,md5(replace(prosrc,E'\r','')) definition_hash,proowner::regrole owner,proacl,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('app_mutate','app_snapshot','internal_mutation_core','internal_snapshot_core','my_invitation','owns_guest','event_role');
select schemaname,tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and tablename in ('guests','guest_contacts','invitation_sessions');
commit;
