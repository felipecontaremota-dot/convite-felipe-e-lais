\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_link(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'link responsible: %',msg;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'baddfabb-0000-4000-8000-000000000001'
\set user 'baddfabb-0000-4000-8000-000000000002'
\set fresh 'baddfabb-0000-4000-8000-000000000003'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'user',true),(:'fresh',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
select set_config('request.jwt.claim.sub',:'admin',true);
select admin_action(:'event','INVITATION_SAVE','{"name":"Link test family","pin":"4778","primary_name":"Actual responsible"}') as family \gset
select (:'family'::jsonb->>'id') as fid \gset
select primary_guest_id as responsible from invitations where id=:'fid' \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',1));
select admin_action(:'event','GUEST_CREATE','{"name":"Another family member","whatsapp":"62999991234"}') as member \gset
select (:'member'::jsonb->>'id') as mid \gset
select admin_action(:'event','FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'fid','target_version',(select version from invitations where id=:'fid'),'guests',(select jsonb_agg(jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version)) from guests g join invitations i on i.id=g.invitation_id where g.id=:'mid')));
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',(select version from invitations where id=:'fid')));
select sharing_code as code from invitation_access where invitation_id=:'fid' \gset
create temp table unchanged_guests as select * from guests where invitation_id=:'fid';
create temp table unchanged_rsvp as select * from rsvps where guest_id in (:'responsible'::uuid,:'mid'::uuid);
create temp table unchanged_contacts as select * from guest_contacts where guest_id in (:'responsible'::uuid,:'mid'::uuid);
create temp table unchanged_credentials as select * from invitation_access where invitation_id=:'fid';
set local role service_role;
select pg_temp.assert_link(not (identify_invitation(:'event',:'fresh',:'code','preview')->>'activated')::boolean,'preview does not authorize');
select pg_temp.assert_link(redeem_invitation_link(:'event',:'fresh',:'code','0000','wrong') is null,'wrong PIN rejected');
reset role;
select pg_temp.assert_link(not exists(select 1 from invitation_sessions where event_id=:'event' and user_id=:'fresh'),'preview/wrong PIN never bind');
set local role service_role;
select pg_temp.assert_link((redeem_invitation_link(:'event',:'user',:'code','4778','link')->>'linked')::boolean,'link verified');
reset role;
select pg_temp.assert_link((select profile_guest_id=:'responsible' from invitation_sessions where event_id=:'event' and user_id=:'user'),'registered primary persisted');
select set_config('request.jwt.claim.sub',:'user',true);
set local role authenticated;
select pg_temp.assert_link(app_snapshot(:'event')->'profile_confirmation'->>'guest_id'=:'responsible','snapshot sees responsible without selection');
select pg_temp.assert_link(app_snapshot(:'event')->'profile_confirmation'->>'confirmed_at' is null,'identity never confirms profile');
select app_mutate(:'event',gen_random_uuid(),'PROFILE_IDENTIFY',jsonb_build_object('guest_id',:'mid'));
reset role;
set local role service_role;
select identify_invitation(:'event',:'user',:'code','return');
select redeem_invitation_link(:'event',:'user',:'code','4778','repeat');
reset role;
select pg_temp.assert_link((select profile_guest_id=:'mid' from invitation_sessions where event_id=:'event' and user_id=:'user'),'explicit member selection preserved');
-- Existing verified sessions created before the change recover on their own link.
update invitation_sessions set profile_guest_id=null where event_id=:'event' and user_id=:'user';
set local role service_role;
select identify_invitation(:'event',:'user',:'code','old-session');
reset role;
select pg_temp.assert_link((select profile_guest_id=:'responsible' from invitation_sessions where event_id=:'event' and user_id=:'user'),'returning verified session recovered');
-- Missing or invalid primary: no first-member guess.
update invitations set primary_guest_id=null where id=:'fid';
update invitation_sessions set profile_guest_id=null where event_id=:'event' and user_id=:'user';
set local role service_role;
select identify_invitation(:'event',:'user',:'code','no-primary');
reset role;
select pg_temp.assert_link((select profile_guest_id is null from invitation_sessions where event_id=:'event' and user_id=:'user'),'no primary retains picker');
select set_config('request.jwt.claim.sub',:'admin',true);
select admin_action(:'event','GUEST_CREATE','{"name":"Outside unit","whatsapp":"62999999876"}') as outsider \gset
select (:'outsider'::jsonb->>'id') as oid \gset
update invitations set primary_guest_id=:'oid' where id=:'fid';
set local role service_role;
select identify_invitation(:'event',:'user',:'code','invalid-primary');
reset role;
select pg_temp.assert_link((select profile_guest_id is null from invitation_sessions where event_id=:'event' and user_id=:'user'),'primary outside unit rejected');
update invitations set primary_guest_id=:'responsible' where id=:'fid';
-- A stale identity from another invitation must never survive a new link binding.
update invitation_sessions set profile_guest_id=:'oid' where event_id=:'event' and user_id=:'user';
set local role service_role;
select redeem_invitation_link(:'event',:'user',:'code','4778','stale');
reset role;
select pg_temp.assert_link((select profile_guest_id=:'responsible' from invitation_sessions where event_id=:'event' and user_id=:'user'),'stale different-unit identity replaced');
-- Name+PIN stays a distinct flow: do not infer the primary there.
set local role service_role;
select pg_temp.assert_link((redeem_invitation_by_name(:'event',:'fresh','Actual responsible','4778','named')->>'linked')::boolean,'name and PIN preserved');
reset role;
select pg_temp.assert_link((select profile_guest_id is null from invitation_sessions where event_id=:'event' and user_id=:'fresh'),'name flow keeps individual identification');
-- Event isolation, inactive/archived invitations and unverified sessions.
set local role service_role;
select pg_temp.assert_link(identify_invitation('baddfabb-9999-4000-8000-000000000001',:'user',:'code','other-event') is null,'event isolation');
reset role;
update invitation_sessions set profile_guest_id=null,pin_verified_at=null where event_id=:'event' and user_id=:'user';
set local role service_role;
select identify_invitation(:'event',:'user',:'code','unverified');
reset role;
select pg_temp.assert_link((select profile_guest_id is null from invitation_sessions where event_id=:'event' and user_id=:'user'),'unverified session never inferred');
update invitations set active=false where id=:'fid';
set local role service_role;
select pg_temp.assert_link(redeem_invitation_link(:'event',:'fresh',:'code','4778','inactive') is null,'inactive rejected');
reset role;
update invitations set active=true,archived_at=now() where id=:'fid';
set local role service_role;
select pg_temp.assert_link(identify_invitation(:'event',:'fresh',:'code','archived') is null,'archived preview rejected');
select pg_temp.assert_link(redeem_invitation_link(:'event',:'fresh',:'code','4778','archived') is null,'archived redeem rejected');
reset role;
select pg_temp.assert_link(not exists((select * from unchanged_guests except select * from guests) union all (select * from guests where invitation_id=:'fid' except select * from unchanged_guests)),'guest identity, classification and profile markers unchanged');
select pg_temp.assert_link(not exists((select * from unchanged_rsvp except select * from rsvps) union all (select * from rsvps where guest_id in (:'responsible'::uuid,:'mid'::uuid) except select * from unchanged_rsvp)),'no automatic RSVP');
select pg_temp.assert_link(not exists((select * from unchanged_contacts except select * from guest_contacts) union all (select * from guest_contacts where guest_id in (:'responsible'::uuid,:'mid'::uuid) except select * from unchanged_contacts)),'contacts and consent unchanged');
select pg_temp.assert_link(not exists((select * from unchanged_credentials except select * from invitation_access) union all (select * from invitation_access where invitation_id=:'fid' except select * from unchanged_credentials)),'PIN, sharing code and QR credentials unchanged');
select pg_temp.assert_link(not has_function_privilege('authenticated','public.link_responsible_identity(uuid,uuid,uuid)','EXECUTE') and not has_function_privilege('anon','public.link_responsible_identity(uuid,uuid,uuid)','EXECUTE') and not has_function_privilege('service_role','public.link_responsible_identity(uuid,uuid,uuid)','EXECUTE'),'helper is private');
select pg_temp.assert_link(not has_function_privilege('authenticated','public.redeem_invitation_link(uuid,uuid,text,text,text)','EXECUTE') and has_function_privilege('service_role','public.redeem_invitation_link(uuid,uuid,text,text,text)','EXECUTE'),'existing service-only API preserved');
rollback;
\echo 'Link responsible identity: authorization, real primary, recovery, member preservation and no RSVP writes passed.'
