-- Synthetic upgrade fixture, before the incremental migration.
insert into auth.users(id,is_anonymous) values('ab200000-0000-4000-8000-000000000001',false),('ab200000-0000-4000-8000-000000000002',true);
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000001','ADMIN');
select set_config('request.jwt.claim.sub','ab200000-0000-4000-8000-000000000001',false);
create temp table name_backfill_unit as select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Pré-existente Unicode","whatsapp":"62999995719"}') result;
select redeem_invitation('00000000-0000-4000-8000-000000000001','ab200000-0000-4000-8000-000000000002',a.sharing_code,a.pin,'upgrade-fixture') from invitation_access a where a.invitation_id=(select (result->>'invitation_id')::uuid from name_backfill_unit);
create table public.name_backfill_evidence(table_name text primary key,rows jsonb);
do $$declare t record; data jsonb;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename<>'name_backfill_evidence' loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',t.tablename) into data;
  insert into name_backfill_evidence values(t.tablename,data);
 end loop;
end$$;
