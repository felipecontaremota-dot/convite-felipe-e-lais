\set ON_ERROR_STOP on
-- Real commits reproduce a lost HTTP response followed by later recipient changes.
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'fafafafa-0000-4000-8000-000000000001'
\set mutation 'fafafafa-1000-4000-8000-000000000001'
begin;
insert into auth.users(id) values(:'admin');
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Retry A"}') as a \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Retry B"}') as b \gset
select (:'a'::jsonb)->>'id' as ga,(:'b'::jsonb)->>'id' as gb,(:'b'::jsonb)->>'invitation_id' as ib \gset
select jsonb_build_object('content','Committed retry regression','channels','["IN_APP","EMAIL"]'::jsonb,'recipient_guest_ids',jsonb_build_array(:'ga',:'gb')) as payload \gset
select app_mutate(:'event',:'mutation','MESSAGE_SEND_TO_GUESTS',:'payload'::jsonb) as sent \gset
select (:'sent'::jsonb)->>'id' as mid \gset
commit;
create function pg_temp.assert_retry(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
select pg_temp.assert_retry((select count(*)=1 from messages where content='Committed retry regression'),'first commit creates exactly one message');
select pg_temp.assert_retry((select count(*)=2 from message_recipients where message_id=:'mid'),'first commit creates both recipients');
select pg_temp.assert_retry((select count(*)=4 from notification_jobs where message_id=:'mid'),'first commit creates recipients x channels jobs');
select pg_temp.assert_retry((select count(*)=1 from mutation_receipts where event_id=:'event' and user_id=:'admin' and mutation_id=:'mutation'),'first commit persists receipt');
begin;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Unrelated pending retry job','recipient_guest_ids',jsonb_build_array(:'ga'),'channels','["EMAIL"]'::jsonb));
-- Simulate response loss: discard the first response and obtain the ID only from the retry.
select app_mutate(:'event',:'mutation','MESSAGE_SEND_TO_GUESTS',:'payload'::jsonb) as retry_result \gset
select pg_temp.assert_retry(:'retry_result'::jsonb=(:'sent'::jsonb||'{"duplicate":true}'::jsonb),'lost response retry restores committed result');
select (:'retry_result'::jsonb)->>'id' as retry_mid \gset
commit;
begin;
set local role service_role;
select pg_temp.assert_retry((select count(*)=4 and bool_and(message_id=:'mid') from claim_event_notifications(:'event',50,:'retry_mid')),'retry ID claims only original message jobs');
-- Complete this fixture's claimed batch so later isolation tests begin without leased jobs.
update notification_jobs set status='sent',locked_at=null where message_id=:'retry_mid';
commit;
select pg_temp.assert_retry(not exists(select 1 from notification_jobs j join messages m on m.id=j.message_id where m.content='Unrelated pending retry job' and j.status<>'pending'),'retry never touches unrelated jobs');
begin;
update invitations set active=false,version=version+1 where id=:'ib';
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select pg_temp.assert_retry(app_mutate(:'event',:'mutation','MESSAGE_SEND_TO_GUESTS',:'payload'::jsonb)=(:'sent'::jsonb||'{"duplicate":true}'::jsonb),'same committed mutation retries after recipient deactivation');
select pg_temp.assert_retry(app_mutate(:'event',:'mutation','MESSAGE_SEND_TO_GUESTS','{"recipient_guest_ids":"invalid","channels":"invalid","content":null}'::jsonb)=(:'sent'::jsonb||'{"duplicate":true}'::jsonb),'registered mutation ID bypasses altered payload validation');
commit;
select pg_temp.assert_retry((select count(*)=1 from messages where content='Committed retry regression'),'deactivation retries never recreate message');
select pg_temp.assert_retry((select count(*)=2 from message_recipients where message_id=:'mid'),'deactivation retries never duplicate recipients');
select pg_temp.assert_retry((select count(*)=4 from notification_jobs where message_id=:'mid'),'deactivation retries never duplicate outbox');
begin;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_DELETE',jsonb_build_object('guests',jsonb_build_array(jsonb_build_object('id',:'gb','version',1,'invitation_version',2))));
commit;
select pg_temp.assert_retry(not exists(select 1 from guests where id=:'gb'),'B deleted after original commit');
select coalesce(jsonb_agg(id order by id),'[]') as recipient_ids from message_recipients where message_id=:'mid' \gset
select coalesce(jsonb_agg(id order by id),'[]') as job_ids from notification_jobs where message_id=:'mid' \gset
begin;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select pg_temp.assert_retry(app_mutate(:'event',:'mutation','MESSAGE_SEND_TO_GUESTS',:'payload'::jsonb)=(:'sent'::jsonb||'{"duplicate":true}'::jsonb),'same committed mutation retries after recipient deletion without invalid recipient');
commit;
select pg_temp.assert_retry((select count(*)=1 from messages where content='Committed retry regression'),'deletion retry never creates second message');
select pg_temp.assert_retry((select coalesce(jsonb_agg(id order by id),'[]') from message_recipients where message_id=:'mid')=:'recipient_ids'::jsonb,'deletion retry preserves exact remaining recipient rows');
select pg_temp.assert_retry((select coalesce(jsonb_agg(id order by id),'[]') from notification_jobs where message_id=:'mid')=:'job_ids'::jsonb,'deletion retry preserves exact remaining outbox rows');
\echo Retry regression: committed receipt wins after recipient deactivation/deletion and altered payload; no duplicate messages/recipients/jobs.
