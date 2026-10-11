\set ON_ERROR_STOP on
reset role;
do $$begin if to_regclass('family_qr_credentials') is not null then raise exception 'fixture must start at 008';end if;end$$;
-- Establish a real pre-009 arrival so preservation is checked with nonempty checkins.
select gc as existing_arrival_guest from profile_upgrade_context \gset
set role authenticated;
set request.jwt.claim.sub='fefe0000-2000-4000-8000-000000000010';
select app_mutate('fefe0000-2000-4000-8000-000000000003','fefe0009-2000-4000-8000-000000000001','CHECKIN_CREATE',jsonb_build_object('guest_id',:'existing_arrival_guest','method','MANUAL'));
reset role;
create table family_upgrade_rows(table_name text primary key,original jsonb not null);
do $$declare t record;rows jsonb;begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='event_id' loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from %I x where event_id=$1',t.table_name) into rows using 'fefe0000-2000-4000-8000-000000000003'::uuid;
  insert into family_upgrade_rows values(t.table_name,rows);
 end loop;
end$$;
create table family_upgrade_acl as select p.proname,p.proargnames,p.proargtypes,p.prorettype,p.prosrc,p.oid,r.rolname,has_function_privilege(r.rolname,p.oid,'EXECUTE') allowed from pg_proc p cross join pg_roles r where p.oid in ('app_mutate(uuid,uuid,text,jsonb)'::regprocedure,'app_snapshot(uuid)'::regprocedure) and r.rolname in ('anon','authenticated','service_role');
create table family_upgrade_snapshot(actor uuid primary key,original jsonb);
grant select,insert on family_upgrade_snapshot to authenticated;
set role authenticated;
do $$declare actor uuid;begin
 foreach actor in array array['fefe0000-2000-4000-8000-000000000010'::uuid,'fefe0000-2000-4000-8000-000000000011'::uuid,'fefe0000-2000-4000-8000-000000000012'::uuid] loop
  perform set_config('request.jwt.claim.sub',actor::text,false);
  insert into family_upgrade_snapshot values(actor,app_snapshot('fefe0000-2000-4000-8000-000000000003'));
 end loop;
end$$;
reset role;
