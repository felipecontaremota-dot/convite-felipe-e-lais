\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_rollback(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
select pg_temp.assert_rollback(not exists(select 1 from pg_trigger where tgname in ('family_head_integrity','family_head_membership')),'post-21 triggers retired');
select pg_temp.assert_rollback((select bool_and(prosecdef and proconfig @> array['search_path=public, extensions, pg_temp']) from pg_proc where oid in ('app_snapshot(uuid)'::regprocedure,'app_mutate(uuid,uuid,text,jsonb)'::regprocedure,'admin_action(uuid,text,jsonb)'::regprocedure,'issue_ticket(uuid,uuid,boolean)'::regprocedure)),'definer functions have fixed search_path');
select pg_temp.assert_rollback((select bool_and(p.proowner=c.relowner) from pg_proc p cross join pg_class c where c.oid='public.invitations'::regclass and p.oid in ('app_snapshot(uuid)'::regprocedure,'app_mutate(uuid,uuid,text,jsonb)'::regprocedure,'admin_action(uuid,text,jsonb)'::regprocedure,'issue_ticket(uuid,uuid,boolean)'::regprocedure)),'trusted owner restored');
do $$declare fn text;begin
 foreach fn in array array['app_snapshot(uuid)','app_mutate(uuid,uuid,text,jsonb)','admin_action(uuid,text,jsonb)','issue_ticket(uuid,uuid,boolean)'] loop
  perform pg_temp.assert_rollback(has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute') and not has_function_privilege('service_role',fn,'execute'),'explicit client ACL '||fn);
 end loop;
 foreach fn in array array['identify_guest(uuid,uuid)','issue_family_ticket(uuid,uuid,boolean)','resolve_checkin_ticket(uuid,text)'] loop
  perform pg_temp.assert_rollback(not has_function_privilege('authenticated',fn,'execute'),'new RPC dormant '||fn);
 end loop;
end$$;
set local role authenticated;
set local request.jwt.claim.sub='90909090-0000-4000-8000-000000000002';
select pg_temp.assert_rollback(event_role('90909090-0000-4000-8000-000000000001')='GUEST','verified session preserved');
select pg_temp.assert_rollback(not (app_snapshot('90909090-0000-4000-8000-000000000001') ?| array['current_guest_id','guest_access_version','family_credentials','checkin_notices','ticket_guest_ids']),'snapshot is baseline, additive feature fields dormant');
select pg_temp.assert_rollback(app_snapshot('90909090-0000-4000-8000-000000000001')->'rsvps' @> '[{"guest_id":"90909090-0000-4000-8000-000000000011","status":"MAYBE"}]','MAYBE remains readable without rewrite');
-- Local identity is not an authorization prerequisite for a confirmed FAMILY member.
select pg_temp.assert_rollback(jsonb_array_length(app_snapshot('90909090-0000-4000-8000-000000000001')->'credentials')=1,'family sees its confirmed individual QR');
do $$begin
 begin
 perform issue_ticket('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000011');
 raise exception 'unconfirmed QR allowed';
 exception when others then if sqlerrm<>'not confirmed' then raise;end if;end;
 begin
 perform admin_action('90909090-0000-4000-8000-000000000001','INVITATION_SAVE','{"name":"Attack"}');
 raise exception 'guest gained ADMIN';
 exception when others then if sqlerrm<>'unauthorized' then raise;end if;end;
end$$;
select app_mutate('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000050','CONTACT_UPDATE','{"guest_id":"90909090-0000-4000-8000-000000000011","email":"updated@example.test","consent_in_app":true,"consent_push":true,"consent_email":true,"consent_whatsapp":true}');
select pg_temp.assert_rollback((select notifications_revoked and not consent_in_app and not consent_push and not consent_email and not consent_whatsapp and email='updated@example.test' from guest_contacts where guest_id='90909090-0000-4000-8000-000000000011'),'old cached form cannot re-enable revoked consents');
-- A changed retry payload cannot turn a committed ordinary contact update into a revocation.
select app_mutate('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000049','CONTACT_UPDATE','{"guest_id":"90909090-0000-4000-8000-000000000012","email":"ordinary@example.test","consent_email":true}');
select app_mutate('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000049','CONTACT_UPDATE','{"guest_id":"90909090-0000-4000-8000-000000000012","notifications_revoked":true}');
select pg_temp.assert_rollback((select notifications_revoked is null and consent_email and email='ordinary@example.test' from guest_contacts where guest_id='90909090-0000-4000-8000-000000000012'),'duplicate receipt prevents new revocation side effect');
-- A revocation queued by a pre-rollback client must retain its global marker too.
select app_mutate('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000051','CONTACT_UPDATE','{"guest_id":"90909090-0000-4000-8000-000000000012","email":"queued@example.test","notifications_revoked":true,"consent_email":true}');
select pg_temp.assert_rollback((select notifications_revoked and not consent_in_app and not consent_push and not consent_email and not consent_whatsapp from guest_contacts where guest_id='90909090-0000-4000-8000-000000000012'),'queued revocation preserves marker and all channels');
select app_mutate('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000051','CONTACT_UPDATE','{"guest_id":"90909090-0000-4000-8000-000000000012","email":"wrong-retry@example.test","notifications_revoked":true}');
select pg_temp.assert_rollback((select email='queued@example.test' from guest_contacts where guest_id='90909090-0000-4000-8000-000000000012'),'retry cannot overwrite committed contact');
set local request.jwt.claim.sub='90909090-0000-4000-8000-000000000004';
select pg_temp.assert_rollback(jsonb_array_length(app_snapshot('90909090-0000-4000-8000-000000000001')->'guests')=1,'ceremonial sees confirmed guests only');
set local request.jwt.claim.sub='90909090-0000-4000-8000-000000000003';
select pg_temp.assert_rollback((app_mutate('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000030','MESSAGE_SEND_TO_GUESTS','{}')->>'id')=(select id::text from messages where event_id='90909090-0000-4000-8000-000000000001'),'committed message ID retained across rollback/retry');
select pg_temp.assert_rollback(jsonb_array_length(app_snapshot('90909090-0000-4000-8000-000000000001')->'invitation_deliveries')=1,'admin sees original pending delivery');
reset role;
set local role service_role;
select pg_temp.assert_rollback(identify_invitation('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000002','RollbackOpaqueCodeUnchangedAtLeast32','rollback-test') is not null,'existing link remains valid');
select pg_temp.assert_rollback(not redeem_invitation('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000002','RollbackOpaqueCodeUnchangedAtLeast32','9999','rollback-test'),'incorrect PIN rejected');
select pg_temp.assert_rollback(redeem_invitation('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000002','RollbackOpaqueCodeUnchangedAtLeast32','0047','rollback-test'),'unchanged link and PIN redeem');
select prepare_invitation_delivery('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000040','90909090-0000-4000-8000-000000000011') as retry \gset
select pg_temp.assert_rollback((:'retry'::jsonb->>'id')=(select id::text from invitation_deliveries where event_id='90909090-0000-4000-8000-000000000001') and (:'retry'::jsonb->>'duplicate')::boolean,'pending retry uses original reservation');
reset role;
select pg_temp.assert_rollback((select status='pending' and attempts=1 and sent_at is null and payload_hash=repeat('c',64) from invitation_deliveries where event_id='90909090-0000-4000-8000-000000000001'),'pending lease/hash unchanged');
rollback;
\echo Restored PR21 contracts, dormant features, ACLs, preserved consent, message idempotency and invitation retries passed.

-- Remove only this isolated fixture before the baseline suites assert global counts.
update invitations set primary_guest_id=null where event_id='90909090-0000-4000-8000-000000000001';
delete from guests where event_id='90909090-0000-4000-8000-000000000001';
delete from invitations where event_id='90909090-0000-4000-8000-000000000001';
delete from messages where event_id='90909090-0000-4000-8000-000000000001';
delete from user_roles where event_id='90909090-0000-4000-8000-000000000001';
delete from events where id='90909090-0000-4000-8000-000000000001';
delete from auth.users where id in ('90909090-0000-4000-8000-000000000002','90909090-0000-4000-8000-000000000003','90909090-0000-4000-8000-000000000004');
