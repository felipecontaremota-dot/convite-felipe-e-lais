-- READ ONLY. Functional permission checks must use legitimate sessions, never postgres impersonation in PROD.
begin transaction read only;
DO $check$
declare item text;
begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='guests' and column_name='profile_confirmed_at' and udt_name='timestamptz' and is_nullable='YES' and column_default is null) or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='invitation_sessions' and column_name='profile_guest_id' and udt_name='uuid') then raise exception 'STOP: confirmation fields missing';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.invitation_sessions'::regclass and conname='invitation_sessions_profile_guest_fkey' and convalidated and pg_get_constraintdef(oid)='FOREIGN KEY (event_id, profile_guest_id) REFERENCES guests(event_id, id) ON DELETE SET NULL (profile_guest_id)') then raise exception 'STOP: member FK missing';end if;
 foreach item in array array['public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)','public.profile_confirmation_snapshot_core(uuid)','public.internal_mutation_core(uuid,uuid,text,jsonb)','public.internal_snapshot_core(uuid)'] loop
  if to_regprocedure(item) is null then raise exception 'STOP: missing %',item;end if;
  if has_function_privilege('anon',item,'EXECUTE') or has_function_privilege('authenticated',item,'EXECUTE') or has_function_privilege('service_role',item,'EXECUTE') then raise exception 'STOP: core publicly callable';end if;
 end loop;
 if position('PROFILE_CONFIRM' in pg_get_functiondef('public.internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure))=0 or position('profile_confirmation' in pg_get_functiondef('public.internal_snapshot_core(uuid)'::regprocedure))=0 then raise exception 'STOP: confirmation operations missing';end if;
 if not exists(select 1 from pg_class where oid='public.guests'::regclass and relrowsecurity) or not exists(select 1 from pg_class where oid='public.guest_contacts'::regclass and relrowsecurity) or not exists(select 1 from pg_class where oid='public.invitation_sessions'::regclass and relrowsecurity) then raise exception 'STOP: RLS missing';end if;
 if not exists(select 1 from pg_proc where oid='public.internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and md5(replace(prosrc,E'\r',''))='e9bc0ea771d51c698fa40891551c4851') then raise exception 'STOP: confirmation wrapper source/config drift';end if;
 if not exists(select 1 from pg_proc where oid='public.internal_snapshot_core(uuid)'::regprocedure and proowner='postgres'::regrole and prosecdef and proconfig=array['search_path=pg_catalog'] and md5(replace(prosrc,E'\r',''))='744b2edbae77c47ba1cfba72371914ad') then raise exception 'STOP: confirmation wrapper source/config drift';end if;
end $check$;
select 'CONFIRMATION_STRUCTURES_READY: authenticated tests still required' status;
select oid::regprocedure::text signature,md5(replace(prosrc,E'\r','')) definition_hash,proowner::regrole owner,proacl,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('internal_mutation_core','internal_snapshot_core','profile_confirmation_mutation_core','profile_confirmation_snapshot_core');
select conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.invitation_sessions'::regclass and conname='invitation_sessions_profile_guest_fkey';
commit;
