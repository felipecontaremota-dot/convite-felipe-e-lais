\set ON_ERROR_STOP on
-- Production-shaped historical records; only disposable databases use this fixture.
begin;
create schema messaging_test_fixture;
create table messaging_test_fixture.baseline(unit_id uuid,guest_id uuid,inbound_id uuid,general_id uuid,rule_message_id uuid);
insert into auth.users(id) values('dadadada-0000-4000-8000-000000000001'),('dadadada-0000-4000-8000-000000000002');
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','dadadada-0000-4000-8000-000000000001','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub='dadadada-0000-4000-8000-000000000001';
select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Messaging upgrade member"}') as created \gset
select (:'created'::jsonb)->>'invitation_id' as unitid,(:'created'::jsonb)->>'id' as guestid \gset
select jsonb_agg(g.id) as allids from guests g join invitations i on i.id=g.invitation_id where g.event_id='00000000-0000-4000-8000-000000000001' and i.active and i.archived_at is null \gset
select app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Upgrade general notice','recipient_guest_ids',:'allids'::jsonb,'channels',jsonb_build_array('IN_APP'),'create_announcement',true)) as general \gset
select app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Upgrade ambiguous notice','recipient_guest_ids',:'allids'::jsonb,'channels',jsonb_build_array('IN_APP'),'create_announcement',true));
select app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Upgrade ambiguous notice','recipient_guest_ids',:'allids'::jsonb,'channels',jsonb_build_array('IN_APP'),'create_announcement',true));
reset role;
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('00000000-0000-4000-8000-000000000001','dadadada-0000-4000-8000-000000000002',:'unitid',now());
set local role authenticated;
set local request.jwt.claim.sub='dadadada-0000-4000-8000-000000000002';
select app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'MESSAGE_SEND',jsonb_build_object('content','Upgrade shared read','sender_guest_id',:'guestid'));
reset role;
select id as inboundid from messages where content='Upgrade shared read' \gset
set local role authenticated;
set local request.jwt.claim.sub='dadadada-0000-4000-8000-000000000001';
select admin_action('00000000-0000-4000-8000-000000000001','MESSAGE_READ',jsonb_build_object('id',:'inboundid'));
reset role;
insert into message_threads(event_id,invitation_id) values('00000000-0000-4000-8000-000000000001',:'unitid') on conflict(event_id,invitation_id) do update set updated_at=now() returning id as threadid \gset
insert into notification_jobs(id,event_id,rule_id,guest_id,channel,idempotency_key,status,attempts) select 'dadadada-1000-4000-8000-000000000001',event_id,id,:'guestid','IN_APP','messaging-upgrade-rule','sent',1 from notification_rules where event_id='00000000-0000-4000-8000-000000000001' and days_before=30;
insert into messages(id,event_id,thread_id,invitation_id,recipient_guest_id,from_admin,content) select j.id,j.event_id,:'threadid',:'unitid',j.guest_id,true,r.title||E'\n'||r.body from notification_jobs j join notification_rules r on r.id=j.rule_id where j.id='dadadada-1000-4000-8000-000000000001';
insert into messaging_test_fixture.baseline values(:'unitid',:'guestid',:'inboundid',(:'general'::jsonb->>'id')::uuid,'dadadada-1000-4000-8000-000000000001');
commit;
