\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_dispatch(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'acacacac-0000-4000-8000-000000000001'
insert into auth.users(id) values(:'admin');
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Dispatch regression A","email":"dispatch-a@example.test"}');
select admin_action(:'event','GUEST_CREATE','{"name":"Dispatch regression B","email":"dispatch-b@example.test"}');
do $$declare ids uuid[];n integer;chan jsonb;r jsonb;mid uuid;
begin
 select array_agg(id order by name) into ids from guests where name like 'Dispatch regression %';
 for n in 1..2 loop
  for chan in select value from (values('["IN_APP"]'::jsonb),('["EMAIL"]'::jsonb),('["IN_APP","EMAIL"]'::jsonb)) x(value) loop
   r=app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Dispatch regression '||n||chan,'recipient_guest_ids',to_jsonb(ids[1:n]),'channels',chan));
   mid=(r->>'id')::uuid;
   perform pg_temp.assert_dispatch((select count(*)=1 from messages where id=mid),'one persisted message');
   perform pg_temp.assert_dispatch((select count(*)=n from message_recipients where message_id=mid),'exact one/many recipients');
   perform pg_temp.assert_dispatch((select count(*)=n*jsonb_array_length(chan) from notification_jobs where message_id=mid),'correct IN_APP/EMAIL/combined outbox');
  end loop;
 end loop;
end$$;
select id as mid from messages where content='Dispatch regression 2["IN_APP", "EMAIL"]' \gset
reset role;
set local role service_role;
select pg_temp.assert_dispatch((select count(*)=4 and bool_and(event_id=:'event' and message_id=:'mid') from claim_event_notifications(:'event',50,:'mid')),'ADMIN claim isolates event and selected message');
select pg_temp.assert_dispatch(not exists(select 1 from notification_jobs where message_id<>:'mid' and status='processing'),'other messages are not claimed');
select pg_temp.assert_dispatch((select count(*)=0 from claim_event_notifications('acacacac-0000-4000-8000-000000000002',50)),'other event cannot claim this event jobs');
rollback;
\echo Messaging dispatch regression: one/many, IN_APP, EMAIL, both, message/event claim isolation passed.
