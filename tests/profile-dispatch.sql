\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_profile(value boolean,label text) returns void language plpgsql as $$begin if value is not true then raise exception 'profile dispatch: %',label;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'fefd0000-0000-4000-8000-000000000001'
insert into auth.users(id,is_anonymous) values(:'admin',false);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Isolated dispatch","whatsapp":"62999998216"}') as guest \gset
select (:'guest'::jsonb)->>'id' as gid \gset
select app_mutate(:'event',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'gid','consent_in_app',true,'consent_email',true,'consent_push',false,'consent_whatsapp',true));
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Job before opt-out','channels','["EMAIL"]'::jsonb,'recipient_guest_ids',jsonb_build_array(:'gid'))) as message \gset
select (:'message'::jsonb)->>'id' as mid \gset
set local role service_role;
select id as jid,attempts as attempt,locked_at as lease from claim_event_notifications(:'event',1,:'mid') \gset
select pg_temp.assert_profile((authorize_notification_attempt(:'event',:'jid',:'gid','EMAIL',:'attempt',:'lease',false)->>'authorized')::boolean,'SQL authorizes consenting job');
reset role;
select app_mutate(:'event',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'gid','communications_revoked',true,'consent_push',true));
select pg_temp.assert_profile((select communications_revoked and consent_email and not consent_push and consent_whatsapp from guest_contacts where guest_id=:'gid'),'global gate never grants push');
set local role service_role;
select pg_temp.assert_profile(not (authorize_notification_attempt(:'event',:'jid',:'gid','EMAIL',:'attempt',:'lease',true)->>'authorized')::boolean,'revocation before admission prevents provider');
reset role;
select pg_temp.assert_profile((select status='skipped' and delivery_started_at is null from notification_jobs where id=:'jid'),'preexisting queued job cancelled');
select app_mutate(:'event',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'gid','communications_revoked',false));
select pg_temp.assert_profile((select status='skipped' from notification_jobs where id=:'jid'),'reactivation never resurrects job');
-- A new explicit message is eligible after reactivation.
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','New explicit send','channels','["EMAIL"]'::jsonb,'recipient_guest_ids',jsonb_build_array(:'gid'))) as message2 \gset
select (:'message2'::jsonb)->>'id' as mid2 \gset
set local role service_role;
select id as jid2,attempts as attempt2,locked_at as lease2 from claim_event_notifications(:'event',1,:'mid2') \gset
select pg_temp.assert_profile(not (authorize_notification_attempt(:'event',:'jid2',:'gid','PUSH',:'attempt2',:'lease2',true)->>'authorized')::boolean,'channel cannot be replaced');
select pg_temp.assert_profile(not (authorize_notification_attempt(:'event',:'jid2',:'gid','EMAIL',999,:'lease2',true)->>'authorized')::boolean,'stale attempt cannot start');
select pg_temp.assert_profile((authorize_notification_attempt(:'event',:'jid2',:'gid','EMAIL',:'attempt2',:'lease2',true)->>'authorized')::boolean,'one provider admission');
select pg_temp.assert_profile(not (authorize_notification_attempt(:'event',:'jid2',:'gid','EMAIL',:'attempt2',:'lease2',true)->>'authorized')::boolean,'same lease never admits twice');
select pg_temp.assert_profile(not finish_notification_attempt(:'event',:'jid2',:'attempt2',:'lease2','failed','fixture'),'worker without admission cannot reset in-flight call');
reset role;
select app_mutate(:'event',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'gid','communications_revoked',true));
select pg_temp.assert_profile((select status='processing' and delivery_started_at is not null from notification_jobs where id=:'jid2'),'already admitted attempt retained');
set local role service_role;
select pg_temp.assert_profile(finish_notification_attempt(:'event',:'jid2',:'attempt2',:'lease2','uncertain','fixture',null,(select delivery_started_at from notification_jobs where id=:'jid2')),'uncertain outcome persisted');
select pg_temp.assert_profile(not finish_notification_attempt(:'event',:'jid2',:'attempt2',:'lease2','sent','fixture',null,(select delivery_started_at from notification_jobs where id=:'jid2')),'completion not duplicated');
select pg_temp.assert_profile(not exists(select 1 from claim_event_notifications(:'event',50,:'mid2')),'uncertain never automatically claimed');
reset role;
select pg_temp.assert_profile((select count(*)=1 from delivery_attempts where job_id=:'jid2' and status='uncertain'),'one sanitized uncertain attempt');
-- Missing contacts preserve only the historical IN_APP default.
delete from guest_contacts where guest_id=:'gid';
select pg_temp.assert_profile(internal_can_receive_communication(:'event',:'gid','IN_APP'),'missing contact default IN_APP');
select pg_temp.assert_profile(not internal_can_receive_communication(:'event',:'gid','EMAIL') and not internal_can_receive_communication(:'event',:'gid','PUSH') and not internal_can_receive_communication(:'event',:'gid','WHATSAPP'),'no implicit external consent');
-- All new/preserved functions have trusted ownership and fixed execution paths.
do $$declare f record;r text; expected boolean;begin
 for f in select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('app_mutate','app_snapshot','internal_mutation_core','internal_snapshot_core','internal_can_receive_communication','can_read_message','can_receive_announcements','authorize_notification_attempt','finish_notification_attempt','claim_notifications','claim_event_notifications') loop
  if f.proowner<>'postgres'::regrole or f.prosecdef is distinct from (f.proname<>'internal_can_receive_communication') or f.proconfig<>array['search_path=public, extensions, pg_temp'] then raise exception 'unsafe function %',f.proname;end if;
  if exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) where grantee=0 and privilege_type='EXECUTE') then raise exception 'PUBLIC exposed %',f.proname;end if;
  foreach r in array array['anon','authenticated','service_role'] loop
   expected=(r='authenticated' and f.proname in ('app_mutate','app_snapshot','can_read_message','can_receive_announcements')) or (r='service_role' and f.proname in ('app_mutate','app_snapshot','can_read_message','authorize_notification_attempt','finish_notification_attempt','claim_notifications','claim_event_notifications'));
   if has_function_privilege(r,f.oid,'EXECUTE')<>expected then raise exception 'ACL mismatch %/%',f.proname,r;end if;
  end loop;
 end loop;
 if to_regprocedure('app_mutate_v7(uuid,uuid,text,jsonb)') is not null or to_regprocedure('app_snapshot_v7(uuid)') is not null then raise exception 'numeric aliases introduced';end if;
end$$;
rollback;
