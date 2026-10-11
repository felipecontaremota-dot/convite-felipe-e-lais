\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'fefe0000-0000-4000-8000-000000000001'
\set device 'fefe0000-0000-4000-8000-000000000002'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'device',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
insert into announcements(event_id,title,content) values(:'event','Aviso geral','IN_APP também respeita revogação');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Perfil A","whatsapp":"62999990047"}') as a \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Perfil B","whatsapp":"62999990047"}') as b \gset
select (:'a'::jsonb)->>'id' as ga,(:'a'::jsonb)->>'invitation_id' as ia,(:'b'::jsonb)->>'id' as gb \gset
select sharing_code as codea from invitation_access where invitation_id=:'ia' \gset
select pg_temp.assert_true((select count(*)>0 from announcements where event_id=:'event'),'ADMIN retains direct announcement access');
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000001','MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Mensagem consentida','channels','["IN_APP","EMAIL","PUSH","WHATSAPP"]'::jsonb,'recipient_guest_ids',jsonb_build_array(:'ga'))) as sent \gset
select (:'sent'::jsonb)->>'id' as mid \gset
select set_config('profile.guest',:'ga',true);
reset role;
set local role service_role;
select redeem_invitation(:'event',:'device',:'codea','0047','test-address');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'device';
select pg_temp.assert_true(can_read_message(:'event',:'mid'),'normal IN_APP available');
select pg_temp.assert_true((select count(*)>0 from announcements where event_id=:'event'),'normal guest direct announcement access');
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000004','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','email','','whatsapp','62999999999','consent_in_app',true,'consent_push',true,'consent_email',true,'consent_whatsapp',true));
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000005','PUSH_REGISTER',jsonb_build_object('guest_id',:'ga','token','ExpoPushToken[test-profile-token]','platform','android'));
-- Global revocation preserves an authorized push channel but blocks registration.
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000006','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','email','','whatsapp','62999999999','communications_revoked',true));
select pg_temp.assert_true((select communications_revoked and consent_push from guest_contacts where guest_id=:'ga'),'push authorization preserved under global revocation');
select pg_temp.assert_true(not exists(select 1 from device_push_tokens where guest_id=:'ga' and active),'global revocation deactivates push token');
do $$begin
 perform app_mutate('00000000-0000-4000-8000-000000000001','fefe0000-1000-4000-8000-000000000008','PUSH_REGISTER',jsonb_build_object('guest_id',current_setting('profile.guest'),'token','ExpoPushToken[test-profile-token]','platform','android'));
 raise exception 'revoked push registration allowed';exception when others then if sqlerrm<>'push not allowed' then raise;end if;end$$;
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000007','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','email','','whatsapp','62999999999','communications_revoked',false));
-- A legacy channel authorization edit establishes the user's mixed permissions.
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000009','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','email','','whatsapp','62999999999','consent_in_app',true,'consent_push',false,'consent_email',true,'consent_whatsapp',true));
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000002','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','email','profile@example.test','whatsapp','(62) 9 9999-9999','communications_revoked',true,'consent_in_app',false,'consent_push',false,'consent_email',false,'consent_whatsapp',false));
select pg_temp.assert_true(not can_read_message(:'event',:'mid'),'revoked IN_APP unavailable');
-- An older client cannot reset the gate or overwrite remembered authorizations.
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000010','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','email','profile@example.test','whatsapp','62999999999','consent_in_app',true,'consent_push',true,'consent_email',true,'consent_whatsapp',true));
select pg_temp.assert_true((select communications_revoked and consent_in_app and consent_email and consent_whatsapp and not consent_push from guest_contacts where guest_id=:'ga'),'legacy update cannot bypass opt-out or grant a new channel');
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'announcements')=0,'general IN_APP notices suppressed for revoked access');
select pg_temp.assert_true((select count(*)=0 from announcements where event_id=:'event'),'RLS prevents direct Data API reads after revocation');
select pg_temp.assert_true(not exists(select 1 from device_push_tokens where guest_id=:'ga' and active),'revocation deactivates push tokens');
select pg_temp.assert_true(not exists(select 1 from messages where id=:'mid'),'RLS honors revoked IN_APP');
select pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(app_snapshot(:'event')->'messages') m where m->>'id'=:'mid'),'new snapshot honors revoked IN_APP');
select pg_temp.assert_true((select whatsapp='62999999999' and communications_revoked and consent_email and not consent_push and consent_whatsapp from guest_contacts where guest_id=:'ga'),'canonical phone and revoked channels');
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000003','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','email','profile@example.test','whatsapp','62999999999','communications_revoked',false,'consent_in_app',true,'consent_push',true,'consent_email',true,'consent_whatsapp',true));
select pg_temp.assert_true(can_read_message(:'event',:'mid'),'explicit reactivation restores IN_APP');
select pg_temp.assert_true((select not communications_revoked and consent_in_app and consent_email and consent_whatsapp and not consent_push from guest_contacts where guest_id=:'ga'),'exact prior permissions restored, never grants previously denied push');
-- Retry of the previous revocation must not revoke again after reactivation.
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000002','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','communications_revoked',true));
select pg_temp.assert_true((select not communications_revoked from guest_contacts where guest_id=:'ga'),'receipt retry does not apply revocation twice');
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'announcements')>0,'general IN_APP notices restored after reactivation');
select pg_temp.assert_true((select count(*) from announcements where event_id=:'event')=jsonb_array_length(app_snapshot(:'event')->'announcements'),'direct reads and snapshot restored together');
select pg_temp.assert_true(not exists(select 1 from device_push_tokens where guest_id=:'ga' and active),'reactivation does not silently restore device permission/token');
reset role;
select pg_temp.assert_true((select consent_in_app from guest_contacts where guest_id=:'gb'),'other guest permission unchanged');
select pg_temp.assert_true((select count(*)>=2 from audit_logs where entity='guest_contacts' and entity_id in (select id from guest_contacts where guest_id=:'ga')),'contact audit preserved');

-- Expand the fixture into a shared FAMILY without changing its existing session.
update invitations set kind='FAMILY' where id=:'ia';
\set gc 'fefe0000-3000-4000-8000-000000000001'
insert into guests(id,event_id,invitation_id,name) values(:'gc',:'event',:'ia','Perfil C familiar');
insert into guest_contacts(event_id,guest_id,consent_in_app) values(:'event',:'gc',true);
set local role authenticated;
set local request.jwt.claim.sub=:'device';
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000011','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','communications_revoked',true));
select pg_temp.assert_true((select count(*)>0 from announcements where event_id=:'event'),'shared FAMILY: authorized member preserves direct access despite another revoked member');
select pg_temp.assert_true((select count(*) from announcements where event_id=:'event')=jsonb_array_length(app_snapshot(:'event')->'announcements'),'shared FAMILY snapshot matches direct RLS');
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000012','CONTACT_UPDATE',jsonb_build_object('guest_id',:'gc','communications_revoked',true));
select pg_temp.assert_true((select count(*)=0 from announcements where event_id=:'event'),'shared FAMILY: all accessible members revoked blocks direct reads even with authorized people in other units');
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'announcements')=0,'shared FAMILY: all revoked blocks snapshot');
-- Administrative access must survive every guest revocation.
set local request.jwt.claim.sub=:'admin';
select pg_temp.assert_true((select count(*)>0 from announcements where event_id=:'event'),'ADMIN direct access unaffected by all family members revoking');
select pg_temp.assert_true((select count(*) from announcements where event_id=:'event')=jsonb_array_length(app_snapshot(:'event')->'announcements'),'ADMIN snapshot and direct access agree');
set local request.jwt.claim.sub=:'device';
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000013','CONTACT_UPDATE',jsonb_build_object('guest_id',:'gc','communications_revoked',false));
select pg_temp.assert_true((select count(*)>0 from announcements where event_id=:'event'),'shared FAMILY: reactivating one previously authorized member restores direct access');
select pg_temp.assert_true((select count(*) from announcements where event_id=:'event')=jsonb_array_length(app_snapshot(:'event')->'announcements'),'shared FAMILY reactivation restores snapshot consistently');
-- No global revocation is not sufficient when IN_APP itself was not authorized.
select app_mutate(:'event','fefe0000-1000-4000-8000-000000000014','CONTACT_UPDATE',jsonb_build_object('guest_id',:'gc','consent_in_app',false));
select pg_temp.assert_true((select count(*)=0 from announcements where event_id=:'event'),'shared FAMILY: IN_APP permission required in addition to no global revocation');
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'announcements')=0,'IN_APP channel denial consistently blocks snapshot');
reset role;
rollback;

\echo 'Profile consent: audited channels, snapshot/RLS, canonical phone, isolation, revocation/reactivation and push tokens passed.'
