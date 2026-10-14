\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_chat(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
create function pg_temp.reject_chat(sql text) returns void language plpgsql as $$begin execute sql;raise exception 'unexpected success';exception when others then if sqlerrm='unexpected success' then raise;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'bababaab-0000-4000-8000-000000000001'
\set admin2 'bababaab-0000-4000-8000-000000000002'
\set usera 'bababaab-0000-4000-8000-000000000003'
\set usera2 'bababaab-0000-4000-8000-000000000004'
\set userb 'bababaab-0000-4000-8000-000000000005'
update public.events set notification_scheduling_enabled=true where id=:'event';
insert into auth.users(id) values(:'admin'),(:'admin2'),(:'usera'),(:'usera2'),(:'userb');
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN'),(:'event',:'admin2','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Chat A"}') as a \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Chat B"}') as b \gset
select (:'a'::jsonb)->>'id' as ga,(:'a'::jsonb)->>'invitation_id' as ia,(:'b'::jsonb)->>'id' as gb,(:'b'::jsonb)->>'invitation_id' as ib \gset
reset role;
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values(:'event',:'usera',:'ia',now()),(:'event',:'usera2',:'ia',now()),(:'event',:'userb',:'ib',now());
set local role authenticated;
set local request.jwt.claim.sub=:'usera';
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_SEND',jsonb_build_object('content','Private hello','sender_guest_id',:'ga')) as hello \gset
select (:'hello'::jsonb)->>'id' as inbound \gset
select pg_temp.reject_chat(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','MESSAGE_SEND',jsonb_build_object('content','spoof','sender_guest_id',:'gb')));
set local request.jwt.claim.sub=:'admin';
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_REPLY',jsonb_build_object('message_id',:'inbound','content','Private answer','channels',jsonb_build_array('IN_APP','EMAIL'))) as answer \gset
select (:'answer'::jsonb)->>'id' as reply \gset
select admin_action(:'event','MESSAGE_READ',jsonb_build_object('id',:'inbound'));
select pg_temp.assert_chat((select value->>'viewer_read_at' is not null from jsonb_array_elements(app_snapshot(:'event')->'messages') where value->>'id'=:'inbound'),'admin1 owns its read receipt');
set local request.jwt.claim.sub=:'admin2';
select pg_temp.assert_chat((select value->>'viewer_read_at' is null from jsonb_array_elements(app_snapshot(:'event')->'messages') where value->>'id'=:'inbound'),'admin2 is not marked read by admin1');
set local request.jwt.claim.sub=:'userb';
select pg_temp.assert_chat(not can_read_message(:'event',:'reply'),'other family cannot read reply');
select pg_temp.assert_chat(not exists(select 1 from messages where id=:'reply'),'RLS hides other family conversation');
select pg_temp.reject_chat(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','MESSAGE_READ',jsonb_build_object('id',:'reply')));
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','MESSAGE_DELETE',jsonb_build_object('id',:'reply')));
set local request.jwt.claim.sub=:'usera';
select pg_temp.assert_chat(can_read_message(:'event',:'reply'),'own unit receives response');
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_READ',jsonb_build_object('id',:'reply'));
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_READ',jsonb_build_object('id',:'reply'));
set local request.jwt.claim.sub=:'usera2';
select pg_temp.assert_chat((select value->>'viewer_read_at' is not null from jsonb_array_elements(app_snapshot(:'event')->'messages') where value->>'id'=:'reply'),'shared access unit persists read across devices');
select pg_temp.assert_chat((select count(*)=1 from message_reads where message_id=:'reply'),'repeated reads do not duplicate');
set local request.jwt.claim.sub=:'admin';
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','MESSAGE_DELETE',jsonb_build_object('id',:'inbound')));
reset role;
update notification_jobs set status='sent' where message_id=:'reply' and channel='EMAIL';
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','MESSAGE_DELETE',jsonb_build_object('id',:'reply'));
reset role;
select pg_temp.assert_chat((select deleted_at is not null from messages where id=:'reply'),'soft deletion retains message');
select pg_temp.assert_chat((select status='sent' from notification_jobs where message_id=:'reply' and channel='EMAIL'),'external delivered history is preserved');
select pg_temp.assert_chat((select status='skipped' from notification_jobs where message_id=:'reply' and channel='IN_APP'),'waiting delivery is cancelled');
select pg_temp.assert_chat(exists(select 1 from audit_logs where entity_id=:'reply' and action='MESSAGE_DELETE'),'deletion audit has no private content');
select pg_temp.assert_chat(exists(select 1 from message_reads where message_id=:'reply'),'deletion preserves receipts');
set local role authenticated;
set local request.jwt.claim.sub=:'usera';
select pg_temp.assert_chat(not can_read_message(:'event',:'reply'),'deleted message is no longer visible');
set local request.jwt.claim.sub=:'admin';
select gen_random_uuid() as sid \gset
select jsonb_build_object('id',:'sid','title','Scheduled title','body','Scheduled body','scheduled_at',clock_timestamp()+interval '1 hour','audience','INDIVIDUAL','recipient_guest_ids',jsonb_build_array(:'ga'),'channels',jsonb_build_array('IN_APP','EMAIL'),'active',true) as plan \gset
select admin_action(:'event','NOTIFICATION_SAVE',:'plan'::jsonb);
select pg_temp.assert_chat((admin_action(:'event','NOTIFICATION_SAVE',:'plan'::jsonb)->>'duplicate')::boolean,'creation retry is idempotent');
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','NOTIFICATION_SAVE',(:'plan'::jsonb)||jsonb_build_object('version',99)));
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','NOTIFICATION_SAVE',(:'plan'::jsonb)||jsonb_build_object('id',gen_random_uuid(),'scheduled_at',clock_timestamp()-interval '1 day')));
set local request.jwt.claim.sub=:'usera';
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','NOTIFICATION_SAVE',:'plan'::jsonb));
select pg_temp.assert_chat(not exists(select 1 from notification_schedules),'guest cannot read schedule targets');
reset role;
update notification_schedules set scheduled_at=clock_timestamp()-interval '1 second' where id=:'sid';
set local role service_role;
select schedule_notifications();
select schedule_notifications();
reset role;
select pg_temp.assert_chat((select count(*)=1 from messages where id=:'sid'),'scheduler creates one message');
select pg_temp.assert_chat((select count(*)=2 from notification_jobs where message_id=:'sid'),'scheduler creates recipients x channels once');
select pg_temp.assert_chat((select content=E'Scheduled title\nScheduled body' from messages where id=:'sid'),'legacy worker receives title and body');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','NOTIFICATION_SAVE',(:'plan'::jsonb)||jsonb_build_object('version',2)));
select gen_random_uuid() as cancelid \gset
select admin_action(:'event','NOTIFICATION_SAVE',(:'plan'::jsonb)||jsonb_build_object('id',:'cancelid'));
select admin_action(:'event','NOTIFICATION_CANCEL',jsonb_build_object('id',:'cancelid','version',1));
reset role;
select pg_temp.assert_chat((select status='cancelled' from notification_schedules where id=:'cancelid'),'future notification cancels without history loss');
select pg_temp.assert_chat(not has_function_privilege('authenticated','public.messaging_mutation_core(uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('anon','public.app_mutate(uuid,uuid,text,jsonb)','EXECUTE'),'private cores and anonymous RPC execution are denied');

set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','NOTIFICATION_CANCEL',jsonb_build_object('id',:'sid','version',2));
reset role;
select pg_temp.assert_chat((select status='cancelled' from notification_schedules where id=:'sid'),'materialized but unadmitted notification can cancel');
select pg_temp.assert_chat((select bool_and(status='skipped') from notification_jobs where message_id=:'sid'),'cancelled notification skips only its jobs');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select jsonb_agg(g.id) as allids from guests g join invitations i on i.id=g.invitation_id where g.event_id=:'event' and i.active and i.archived_at is null \gset
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','General deletable notice','recipient_guest_ids',:'allids'::jsonb,'channels',jsonb_build_array('IN_APP'),'create_announcement',true,'audience','GENERAL')) as general \gset
select (:'general'::jsonb)->>'id' as generalid \gset
select admin_action(:'event','MESSAGE_DELETE',jsonb_build_object('id',:'generalid'));
reset role;
select pg_temp.assert_chat((select deleted_at is not null from announcements where message_id=:'generalid'),'general deletion removes only linked announcement');
set local role authenticated;
set local request.jwt.claim.sub=:'usera';
select pg_temp.assert_chat(not exists(select 1 from announcements where message_id=:'generalid'),'announcement RLS rejects deleted broadcast');

reset role;
insert into public.events(id,title,starts_at) values('bababaab-9000-4000-8000-000000000001','Other event',now()+interval '1 month');
insert into public.user_roles(event_id,user_id,role) values('bababaab-9000-4000-8000-000000000001',:'admin','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select pg_temp.reject_chat(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)','bababaab-9000-4000-8000-000000000001','MESSAGE_REPLY',jsonb_build_object('message_id',:'inbound','content','cross event')));
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)','bababaab-9000-4000-8000-000000000001','MESSAGE_DELETE',jsonb_build_object('id',:'inbound')));
reset role;
update public.events set notification_scheduling_enabled=false where id=:'event';
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','NOTIFICATION_SAVE',(:'plan'::jsonb)||jsonb_build_object('id',gen_random_uuid())));
reset role;
update public.events set notification_scheduling_enabled=true where id=:'event';
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','NOTIFICATION_SAVE',(:'plan'::jsonb)||jsonb_build_object('id',gen_random_uuid(),'body',repeat('x',3500),'channels',jsonb_build_array('PUSH'))));
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','NOTIFICATION_SAVE',(:'plan'::jsonb)||jsonb_build_object('id',gen_random_uuid(),'body',repeat('x',1200),'channels',jsonb_build_array('WHATSAPP'))));
reset role;
insert into user_roles(event_id,user_id,role) values(:'event',:'userb','CEREMONIALIST');
set local role authenticated;
set local request.jwt.claim.sub=:'userb';
select pg_temp.reject_chat(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','MESSAGE_REPLY',jsonb_build_object('message_id',:'inbound','content','not allowed')));
select pg_temp.reject_chat(format('select admin_action(%L,%L,%L::jsonb)',:'event','NOTIFICATION_SAVE',(:'plan'::jsonb)||jsonb_build_object('id',gen_random_uuid())));
select pg_temp.assert_chat(app_snapshot(:'event')->'messages'='[]'::jsonb,'cerimonial cannot inspect conversations');
reset role;
select pg_temp.assert_chat((select bool_and(relrowsecurity) from pg_class where oid in ('public.message_reads'::regclass,'public.notification_schedules'::regclass)),'all new exposed tables enforce RLS');
select pg_temp.assert_chat(not has_table_privilege('authenticated','public.message_reads','INSERT') and not has_table_privilege('authenticated','public.notification_schedules','UPDATE'),'clients cannot bypass guarded RPC writes');
rollback;
\echo Messaging security, read scopes, isolated conversations, deletion, scheduling and retries passed.
