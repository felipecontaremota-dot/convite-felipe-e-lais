begin;
create function pg_temp.assert_name(value boolean,label text) returns void language plpgsql as $$begin if value is not true then raise exception 'name entry: %',label;end if;end$$;
insert into auth.users(id,is_anonymous) values('ab100000-0000-4000-8000-000000000001',false),('ab100000-0000-4000-8000-000000000002',true),('ab100000-0000-4000-8000-000000000003',true);
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000001','ADMIN');
select set_config('request.jwt.claim.sub','ab100000-0000-4000-8000-000000000001',true);
create temp table name_units as
select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Laís Romão","whatsapp":"62999990047"}') result;
insert into name_units select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"LAIS ROMAO","whatsapp":"62999994778"}');
create function pg_temp.try_name(n text,p text,u uuid default 'ab100000-0000-4000-8000-000000000002') returns boolean language sql as $$
select coalesce((redeem_invitation_by_name('00000000-0000-4000-8000-000000000001',u,n,p,'fixture-origin')->>'linked')::boolean,false);$$;
select pg_temp.assert_name(pg_temp.try_name(' lais   romao ','0047'),'case accent whitespace leading zeros');
select pg_temp.assert_name(pg_temp.try_name(U&'Lai\0301s Roma\0303o','0047'),'decomposed unicode');
select pg_temp.assert_name(pg_temp.try_name('LAIS'||chr(160)||'ROMAO','0047'),'unicode whitespace');
select pg_temp.assert_name(not pg_temp.try_name('LAIS ROMAO','9999'),'wrong pin');
select pg_temp.assert_name(not pg_temp.try_name('Unknown name','0047'),'unknown name');
select pg_temp.assert_name(not pg_temp.try_name('LAIS'||chr(8203)||' ROMAO','0047'),'invisible denied');
select pg_temp.assert_name((select count(*) from audit_logs where actor='ab100000-0000-4000-8000-000000000002' and action='ACTIVATION')=1,'same binding idempotent');
select pg_temp.assert_name(pg_temp.try_name('LAIS ROMAO','4778'),'homonym different pin');
select pg_temp.assert_name((select invitation_id from invitation_sessions where user_id='ab100000-0000-4000-8000-000000000002')=(select (result->>'invitation_id')::uuid from name_units where (result->>'id')::uuid=(select id from guests where name='LAIS ROMAO')),'correct homonym binding');
-- Same normalized name and PIN in different units: both blocked, no arbitrary winner.
update invitation_access set pin='0047' where invitation_id in(select (result->>'invitation_id')::uuid from name_units);
select pg_temp.assert_name(not pg_temp.try_name('LAIS ROMAO','0047'),'ambiguous denied');
select pg_temp.assert_name((select count(*) from audit_logs where actor='ab100000-0000-4000-8000-000000000002' and action='ACTIVATION')=2,'invalid combination cannot switch the binding');
select pg_temp.assert_name(not has_function_privilege('service_role','redeem_invitation_password(uuid,uuid,text,text)','EXECUTE'),'password-only revoked');
select pg_temp.assert_name(not has_function_privilege('authenticated','redeem_invitation_by_name(uuid,uuid,text,text,text)','EXECUTE'),'public RPC denied');
select pg_temp.assert_name(not has_schema_privilege('authenticated','name_pin_private','USAGE'),'private index denied');
select pg_temp.assert_name(not has_schema_privilege('service_role','name_pin_private','USAGE'),'service index denied');
select pg_temp.assert_name(has_function_privilege('service_role','redeem_invitation_by_name(uuid,uuid,text,text,text)','EXECUTE'),'service RPC allowed');
-- Family: every member uses the UNIT PIN, duplicate aliases deduplicate.
create temp table name_family as select admin_action('00000000-0000-4000-8000-000000000001','INVITATION_SAVE','{"name":"Synthetic family","pin":"1862"}') result;
select admin_action('00000000-0000-4000-8000-000000000001','CODE_ROTATE',jsonb_build_object('id',result->>'id','version',1)) from name_family;
insert into guests(event_id,invitation_id,name) select '00000000-0000-4000-8000-000000000001',(result->>'id')::uuid,name from name_family cross join (values('Family first member'),('Family second member'),('FAMILY SECOND MEMBER')) n(name);
select pg_temp.assert_name(pg_temp.try_name('family first member','1862','ab100000-0000-4000-8000-000000000003'),'first member');
select pg_temp.assert_name(pg_temp.try_name('family second member','1862','ab100000-0000-4000-8000-000000000003'),'any member and same-unit duplicates');
select pg_temp.assert_name((select count(*) from name_pin_private.aliases where invitation_id=(select (result->>'id')::uuid from name_family))=2,'deduplicated family aliases');
-- Renames and moves immediately remove stale aliases.
update guests set name='Renamed member' where invitation_id=(select (result->>'id')::uuid from name_family) and name ilike 'Family second member';
select pg_temp.assert_name(not pg_temp.try_name('family second member','1862','ab100000-0000-4000-8000-000000000003'),'old name denied');
select pg_temp.assert_name(pg_temp.try_name('Renamed member','1862','ab100000-0000-4000-8000-000000000003'),'new name works');
-- Dedicated budgets avoid prior attempts influencing later lifecycle tests.
delete from name_pin_private.attempt_limits;
update invitations set archived_at=now() where id=(select (result->>'id')::uuid from name_family);
select pg_temp.assert_name(not pg_temp.try_name('Renamed member','1862'),'archived denied');
update invitations set archived_at=null,active=false where id=(select (result->>'id')::uuid from name_family);
select pg_temp.assert_name(not pg_temp.try_name('Renamed member','1862'),'inactive denied');
update invitations set active=true,code_hash=null where id=(select (result->>'id')::uuid from name_family);
select pg_temp.assert_name(not pg_temp.try_name('Renamed member','1862'),'blocked denied');
-- Legacy still distinguishes colliding named combinations by their individual code.
select pg_temp.assert_name(redeem_invitation('00000000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003',a.sharing_code,'0047','legacy-origin'),'legacy preserved') from invitation_access a where invitation_id in(select (result->>'invitation_id')::uuid from name_units);
-- Same name/PIN in another event does not collide with this event.
insert into events(id,title,starts_at,timezone) values('ab100000-0000-4000-8000-000000000010','Other event',now(),'America/Sao_Paulo');
insert into invitations(id,event_id,name,code_hash) values('ab100000-0000-4000-8000-000000000011','ab100000-0000-4000-8000-000000000010','Other',repeat('a',64));
insert into invitation_access(event_id,invitation_id,pin) values('ab100000-0000-4000-8000-000000000010','ab100000-0000-4000-8000-000000000011','0047');
insert into guests(event_id,invitation_id,name) values('ab100000-0000-4000-8000-000000000010','ab100000-0000-4000-8000-000000000011','LAIS ROMAO');
select pg_temp.assert_name((redeem_invitation_by_name('ab100000-0000-4000-8000-000000000010','ab100000-0000-4000-8000-000000000003','LAIS ROMAO','0047','other-origin')->>'linked')::boolean,'event scoped');
select pg_temp.assert_name(not pg_temp.try_name('LAIS ROMAO','0047'),'other event cannot rescue ambiguity');
-- Name budget applies even across sessions/origins; PIN guessing consumes it.
delete from name_pin_private.attempt_limits;
do $$begin for n in 1..16 loop perform pg_temp.try_name('Rate fixture',lpad(n::text,4,'0'));end loop;end$$;
select pg_temp.assert_name((select attempts from name_pin_private.attempt_limits where bucket like 'name:%')=16,'atomic name budget');
select pg_temp.assert_name(not name_pin_private.attempt_allowed('00000000-0000-4000-8000-000000000001','ab100000-0000-4000-8000-000000000003','new-origin','RATE FIXTURE'),'new UID cannot reset name limit');
rollback;
