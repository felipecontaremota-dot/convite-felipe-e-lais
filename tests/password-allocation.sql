begin;
create function pg_temp.assert_allocation(value boolean,label text) returns void language plpgsql as $$begin if value is not true then raise exception 'allocation: %',label;end if;end$$;
create temp table automatic_credentials as
select public.create_individual_access('00000000-0000-4000-8000-000000000001','Initial preference','62999998631') id;
select pg_temp.assert_allocation((select pin='8631' from invitation_access where invitation_id=(select id from automatic_credentials)),'WhatsApp suffix preferred');
create temp table previous_credentials as select i.*,a.pin,a.sharing_code from invitations i join invitation_access a on a.invitation_id=i.id where i.id=(select id from automatic_credentials);
insert into automatic_credentials select public.create_individual_access('00000000-0000-4000-8000-000000000001','Occupied suffix','62999998631');
insert into automatic_credentials select public.create_individual_access('00000000-0000-4000-8000-000000000001','No WhatsApp',null);
select pg_temp.assert_allocation((select count(distinct a.pin)=3 from invitation_access a join automatic_credentials c on c.id=a.invitation_id),'automatic credentials unique');
select pg_temp.assert_allocation(not exists(select 1 from previous_credentials p join invitations i on i.id=p.id join invitation_access a on a.invitation_id=i.id where p.pin<>a.pin or p.sharing_code<>a.sharing_code or p.code_hash<>i.code_hash),'issued credentials never rotate');
do $$begin
 begin
  update invitation_access set pin='8631' where invitation_id=(select id from automatic_credentials where id<>(select id from previous_credentials) limit 1);
  raise exception 'explicit duplicate accepted';
 exception when sqlstate 'P0001' then if sqlerrm<>'invitation password conflict' then raise;end if;end;
end$$;
select pg_temp.assert_allocation(not exists(select 1 from password_entry_private.resolution group by event_id,fingerprint having count(*)>1),'structural uniqueness');
select pg_temp.assert_allocation(not has_schema_privilege('authenticated','password_entry_private','USAGE') and not has_schema_privilege('service_role','password_entry_private','USAGE'),'registry inaccessible');
rollback;
-- Exhaust the finite four-digit domain in a separate event, without weakening UNIQUE.
begin;
insert into events(id,title,starts_at,timezone) values('ffca0000-0000-4000-8000-000000000001','Capacity fixture',now(),'America/Sao_Paulo');
create temp table capacity_ids as select gen_random_uuid() id,lpad(n::text,4,'0') pin from generate_series(0,9999) n;
insert into invitations(id,event_id,name,code_hash)
select id,'ffca0000-0000-4000-8000-000000000001','Capacity fixture',encode(extensions.digest(id::text,'sha256'),'hex') from capacity_ids;
insert into invitation_access(event_id,invitation_id,pin)
select 'ffca0000-0000-4000-8000-000000000001',id,pin from capacity_ids;
do $$begin
 begin
  perform create_individual_access('ffca0000-0000-4000-8000-000000000001','No capacity',null);
  raise exception 'exhausted domain accepted allocation';
 exception when sqlstate 'P0001' then
  if sqlerrm<>'initial invitation password allocation exhausted' then raise;end if;
 end;
 if (select count(*) from invitations where event_id='ffca0000-0000-4000-8000-000000000001')<>10000
 or (select count(*) from invitation_access where event_id='ffca0000-0000-4000-8000-000000000001')<>10000
 or (select count(*) from password_entry_private.resolution where event_id='ffca0000-0000-4000-8000-000000000001')<>10000 then raise exception 'allocation exhaustion left partial records';end if;
end$$;
rollback;
begin;
do $$declare api_role text;begin
 foreach api_role in array array['anon','authenticated','service_role'] loop
  execute format('set local role %I',api_role);
  begin
   execute 'select secret from password_entry_private.derivation_key';
   raise exception 'API role read private derivation key';
  exception when insufficient_privilege then null;end;
  begin
   execute 'select fingerprint from password_entry_private.resolution';
   raise exception 'API role read private registry';
  exception when insufficient_privilege then null;end;
  execute 'reset role';
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='password_entry_private'
 and (pg_get_userbyid(p.proowner)<>'postgres' or p.proconfig is distinct from array['search_path=pg_catalog']::text[]
 or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))) then raise exception 'unsafe private function ACL/owner/search path';end if;
end$$;
rollback;
