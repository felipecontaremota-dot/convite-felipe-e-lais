\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'eeeeeeee-0000-4000-8000-000000000001'
\set device 'eeeeeeee-0000-4000-8000-000000000002'
\set other_device 'eeeeeeee-0000-4000-8000-000000000003'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'device',true),(:'other_device',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Pessoa destinatária","whatsapp":"62999990047"}') as a \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Outra destinatária"}') as b \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Não selecionada","whatsapp":"62999990047"}') as c \gset
select (:'a'::jsonb)->>'id' as ga,(:'a'::jsonb)->>'invitation_id' as ia,(:'b'::jsonb)->>'id' as gb,(:'c'::jsonb)->>'id' as gc,(:'c'::jsonb)->>'invitation_id' as ic \gset
select sharing_code as codea from invitation_access where invitation_id=:'ia' \gset
select sharing_code as codec from invitation_access where invitation_id=:'ic' \gset
select app_mutate(:'event','eeeeeeee-1000-4000-8000-000000000001','MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Somente selecionadas','channels','["IN_APP","EMAIL"]'::jsonb,'recipient_guest_ids',jsonb_build_array(:'ga',:'gb',:'ga'))) as sent \gset
select (:'sent'::jsonb)->>'id' as mid \gset
select pg_temp.assert_true((select count(*)=2 from message_recipients where message_id=:'mid'),'duplicates deduplicated');
select pg_temp.assert_true((select count(*)=4 from notification_jobs where message_id=:'mid'),'outbox exactly recipients x channels');
select pg_temp.assert_true(not exists(select 1 from announcements where content='Somente selecionadas'),'targeted message never announcement');
select pg_temp.assert_true(jsonb_array_length((select m->'recipient_guest_ids' from jsonb_array_elements(app_snapshot(:'event')->'messages') m where m->>'id'=:'mid'))=2,'admin snapshot retains recipient IDs');
select pg_temp.assert_true(app_mutate(:'event','eeeeeeee-1000-4000-8000-000000000001','MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Somente selecionadas','recipient_guest_ids',jsonb_build_array(:'ga',:'gb')))->>'duplicate'='true','idempotent retry');
select pg_temp.assert_true((select count(*)=2 from message_recipients where message_id=:'mid'),'retry never duplicates recipients');
reset role;
insert into events(id,title,starts_at,timezone) values('eeeeeeee-2000-4000-8000-000000000001','Outro evento',now(),'America/Sao_Paulo');
insert into invitations(id,event_id,name) values('eeeeeeee-2000-4000-8000-000000000002','eeeeeeee-2000-4000-8000-000000000001','Outra família');
insert into guests(id,event_id,invitation_id,name) values('eeeeeeee-2000-4000-8000-000000000003','eeeeeeee-2000-4000-8000-000000000001','eeeeeeee-2000-4000-8000-000000000002','Outro evento');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
create function pg_temp.reject(payload jsonb) returns void language plpgsql as $$begin
 perform app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',payload);
 raise exception 'accepted invalid recipients';
 exception when others then if sqlerrm not like 'invalid recipient%' then raise;end if;
end$$;
select pg_temp.reject(jsonb_build_object('content','Não publicar'));
select pg_temp.reject(jsonb_build_object('content','Não publicar','recipient_guest_ids','[]'::jsonb));
select pg_temp.reject(jsonb_build_object('content','Não publicar','recipient_guest_ids',jsonb_build_array(:'ga','eeeeeeee-2000-4000-8000-000000000003')));
select pg_temp.reject(jsonb_build_object('content','Não publicar','recipient_guest_ids',jsonb_build_array(:'ga','ffffffff-ffff-4fff-8fff-ffffffffffff')));
select pg_temp.reject(jsonb_build_object('content','Não publicar','recipient_guest_ids',(select jsonb_agg(:'ga'::text) from generate_series(1,501))));
select pg_temp.assert_true(not exists(select 1 from messages where content='Não publicar'),'invalid set aborts all message writes');
reset role;
-- The pre-005 mutation implementation fails closed for the new type, never broadcasts.
do $$begin
 begin
  perform app_mutate_v4('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS','{"content":"Never broadcast on old backend","recipient_guest_ids":["20000000-0000-4000-8000-000000000001"]}'::jsonb);
  raise exception 'old backend accepted new type';
 exception when others then if sqlerrm<>'unknown mutation' then raise;end if;end;
end$$;
select pg_temp.assert_true(not exists(select 1 from messages where content='Never broadcast on old backend'),'old backend fails closed');
set local role service_role;
select pg_temp.assert_true(redeem_invitation(:'event',:'device',:'codea','0047','msg-a'),'selected device active');
select pg_temp.assert_true(redeem_invitation(:'event',:'other_device',:'codec','0047','msg-c'),'unselected device active');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'device';
select pg_temp.assert_true((select count(*)=1 from messages where id=:'mid'),'selected recipient reads message with RLS');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(app_snapshot(:'event')->'messages') m where m->>'id'=:'mid'),'selected recipient snapshot');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(app_snapshot(:'event')->'messages') m where m ? 'recipient_guest_ids'),'guest never sees other recipient IDs');
select pg_temp.assert_true((select count(*)=1 from message_recipients where message_id=:'mid'),'RLS recipients only own access unit');
set local request.jwt.claim.sub=:'other_device';
select pg_temp.assert_true((select count(*)=0 from messages where id=:'mid'),'unselected guest cannot read null-invitation targeted message');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(app_snapshot(:'event')->'messages') m where m->>'id'=:'mid'),'unselected snapshot isolated');
select pg_temp.assert_true(not has_function_privilege('authenticated','app_mutate_v4(uuid,uuid,text,jsonb)','execute') and not has_function_privilege('authenticated','app_snapshot_v4(uuid)','execute'),'old functions cannot bypass new visibility');
rollback;
\echo Messages: atomic recipients, other-event rejection, deduplication, outbox, idempotency and RLS/snapshot isolation passed.
