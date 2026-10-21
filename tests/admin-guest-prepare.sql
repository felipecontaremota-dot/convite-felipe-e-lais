\set ON_ERROR_STOP on
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'aabbffaa-0000-4000-8000-000000000001'
\set user 'aabbffaa-0000-4000-8000-000000000002'
\set staff 'aabbffaa-0000-4000-8000-000000000003'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'user',true),(:'staff',false);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN'),(:'event',:'staff','CEREMONIALIST');
select set_config('request.jwt.claim.sub',:'admin',false);
select admin_action(:'event','INVITATION_SAVE','{"name":"Administrative control family","pin":"4477","primary_name":"Control responsible"}') as unit \gset
select (:'unit'::jsonb->>'id') as iid \gset
select primary_guest_id as first from invitations where id=:'iid' \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'iid','version',1));
select admin_action(:'event','GUEST_CREATE','{"name":"Control other member","email":"control@example.test","whatsapp":"62999994477"}') as member \gset
select (:'member'::jsonb->>'id') as companion \gset
select admin_action(:'event','FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'iid','target_version',2,'guests',(select jsonb_agg(jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version)) from guests g join invitations i on i.id=g.invitation_id where g.id=:'companion')));
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at,profile_guest_id) values(:'event',:'user',:'iid',now(),:'first');
update guests set profile_confirmed_at=now() where id=:'first';
update rsvps set dietary='Sem lactose',note='Nota preservada' where guest_id=:'first';
-- A real terminal receipt is evidence for exactly its recipient, not their family.
insert into invitation_deliveries(event_id,invitation_id,guest_id,request_id,recipient_email,status,sent_at)
values(:'event',:'iid',:'first',gen_random_uuid(),'control@example.test','sent',now()) returning id,request_id \gset delivery_
insert into invitation_delivery_members(event_id,request_id,guest_id,delivery_id) values(:'event',:'delivery_request_id',:'first',:'delivery_id');
update invitations set sent_at=now(),first_activated_at=now() where id=:'iid';
create table test_admin_guest_fixture as select :'event'::uuid event,:'admin'::uuid admin,:'user'::uuid actor,:'staff'::uuid staff,:'iid'::uuid invitation,:'first'::uuid first,:'companion'::uuid companion,:'delivery_id'::uuid delivery,:'delivery_request_id'::uuid request;
