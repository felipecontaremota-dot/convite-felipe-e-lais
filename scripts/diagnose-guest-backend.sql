-- READ ONLY. Run in the correct project's SQL editor to check deployment.
-- Does not expose contacts, codes, passwords, credentials or session tokens.
select current_database(), current_user;
select n.nspname as schema_name, t.typname, e.enumlabel
from pg_enum e join pg_type t on t.oid=e.enumtypid join pg_namespace n on n.oid=t.typnamespace
where n.nspname='public' and t.typname='rsvp_status' order by e.enumsortorder;
select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
 pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 position('RSVP never issues/revokes' in p.prosrc)>0 as guest_mutation_007,
 position('guest_access_version' in p.prosrc)>0 as snapshot_008
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('app_mutate','app_mutate_v6','app_snapshot','identify_guest','current_guest','manages_guest_ticket','issue_ticket','issue_family_ticket')
order by p.proname;
select count(*) as ddl_cache_watchers from pg_event_trigger
where evtname like 'pgrst%' and evtenabled <> 'D';
