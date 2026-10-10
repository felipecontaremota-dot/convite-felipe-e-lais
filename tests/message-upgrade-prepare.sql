\set ON_ERROR_STOP on
-- This receipt is genuinely created by 005, before the result column exists.
insert into events(id,title,starts_at) values('dddddddd-0000-4000-8000-000000000007','Isolated upgrade regression','2026-12-15T19:00:00Z');
insert into auth.users(id) values('dddddddd-0000-4000-8000-000000000006');
insert into user_roles(event_id,user_id,role) values('dddddddd-0000-4000-8000-000000000007','dddddddd-0000-4000-8000-000000000006','ADMIN');
begin;
set local role authenticated;
set local request.jwt.claim.sub='dddddddd-0000-4000-8000-000000000006';
select admin_action('dddddddd-0000-4000-8000-000000000007','GUEST_CREATE','{"name":"Historical 005 recipient"}') as guest \gset
select app_mutate('dddddddd-0000-4000-8000-000000000007','dddddddd-1000-4000-8000-000000000006','MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Historical 005 message','recipient_guest_ids',jsonb_build_array((:'guest'::jsonb)->>'id'),'channels','["EMAIL"]'::jsonb));
commit;
