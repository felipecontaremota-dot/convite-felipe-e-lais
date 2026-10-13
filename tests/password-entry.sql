begin;
create function pg_temp.assert_password(value boolean,label text) returns void language plpgsql as $$begin if value is not true then raise exception 'password entry: %',label;end if;end$$;
insert into auth.users(id,is_anonymous) values('eeeeeeee-0000-4000-8000-000000000001',false),('eeeeeeee-0000-4000-8000-000000000002',true),('eeeeeeee-0000-4000-8000-000000000003',true);
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000001','ADMIN');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
create temp table password_fixture as select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Entrada exclusiva","whatsapp":"62999994017"}') result;
create temp table password_other as select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Outro acesso","whatsapp":"62999994018"}') result;
grant select on password_fixture,password_other to service_role;
create temp table password_before as select i.id,i.code_hash,a.pin,a.sharing_code from invitations i join invitation_access a on a.invitation_id=i.id where i.id in ((select (result->>'invitation_id')::uuid from password_fixture),(select (result->>'invitation_id')::uuid from password_other));
select pg_temp.assert_password(not has_function_privilege('authenticated','redeem_invitation_password(uuid,uuid,text,text)','EXECUTE'),'no direct guest RPC');
select pg_temp.assert_password(not has_function_privilege('anon','redeem_invitation_password(uuid,uuid,text,text)','EXECUTE'),'no anon RPC');
select pg_temp.assert_password(has_function_privilege('service_role','redeem_invitation_password(uuid,uuid,text,text)','EXECUTE'),'service RPC');
set local role service_role;
select pg_temp.assert_password(not redeem_invitation_password('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','9999','fixture-ip'),'unknown PIN');
select pg_temp.assert_password(not redeem_invitation_password('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000001','4017','fixture-ip'),'staff denied');
select pg_temp.assert_password(redeem_invitation_password('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','4017','fixture-ip'),'valid PIN');
reset role;
select pg_temp.assert_password((select invitation_id from invitation_sessions where user_id='eeeeeeee-0000-4000-8000-000000000002')=(select (result->>'invitation_id')::uuid from password_fixture),'correct access bound');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000002',true);
select pg_temp.assert_password(app_snapshot('00000000-0000-4000-8000-000000000001')->>'role'='GUEST','guest role');
select pg_temp.assert_password(jsonb_array_length(app_snapshot('00000000-0000-4000-8000-000000000001')->'guests')=1,'other guests isolated');
-- Structural collisions fail atomically before any guest can observe ambiguity.
do $$begin
 begin
  update invitation_access set pin='4017' where invitation_id=(select (result->>'invitation_id')::uuid from password_other);
  raise exception 'duplicate PIN accepted';
 exception when sqlstate 'P0001' then
  if sqlerrm<>'invitation password conflict' then raise;end if;
 end;
end $$;
select pg_temp.assert_password(not exists(select 1 from invitation_sessions where user_id='eeeeeeee-0000-4000-8000-000000000003'),'rejected write never binds');
-- Exclusive links remain usable without changing issued credentials.
set local role service_role;
select pg_temp.assert_password(redeem_invitation('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003',(select sharing_code from invitation_access where invitation_id=(select (result->>'invitation_id')::uuid from password_fixture)),'4017','link-fixture'),'exclusive link preserved');
reset role;
update invitation_access set pin='4018' where invitation_id=(select (result->>'invitation_id')::uuid from password_other);
update invitations set active=false where id=(select (result->>'invitation_id')::uuid from password_fixture);
set local role service_role;
select pg_temp.assert_password(not redeem_invitation_password('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003','4017','fixture-ip'),'inactive denied');
reset role;
update invitations set active=true,code_hash=null where id=(select (result->>'invitation_id')::uuid from password_fixture);
set local role service_role;
select pg_temp.assert_password(not redeem_invitation_password('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003','4017','fixture-ip'),'blocked link not bypassed');
reset role;
update invitations i set code_hash=b.code_hash from password_before b where i.id=b.id;
-- Different guessed PINs still share the IP quota (even with new users).
do $$begin for n in 1..31 loop perform redeem_invitation_password('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003',lpad(n::text,4,'0'),'rate-fixture');end loop;end$$;
select pg_temp.assert_password(not redeem_invitation_password('00000000-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','4018','rate-fixture'),'IP limit cannot be bypassed with new user or guess');
select pg_temp.assert_password(not exists(select 1 from password_before b join invitations i on i.id=b.id join invitation_access a on a.invitation_id=i.id where b.pin<>a.pin or b.code_hash<>i.code_hash or b.sharing_code<>a.sharing_code),'no credential rotation');
rollback;
