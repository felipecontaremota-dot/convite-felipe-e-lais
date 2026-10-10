\set ON_ERROR_STOP on
begin;
-- Test helper passes the current credential fingerprint; stale preparation is tested explicitly below.
create function pg_temp.claim_delivery(d uuid,h text) returns jsonb language sql security definer set search_path=public,extensions,pg_temp as $$
 select public.claim_invitation_delivery(d,h,(select encode(extensions.digest(a.sharing_code||':'||a.pin,'sha256'),'hex') from invitation_deliveries x join invitation_access a on a.event_id=x.event_id and a.invitation_id=x.invitation_id where x.id=d));
$$;

create function pg_temp.assert_invite(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'bcbcbcbc-0000-4000-8000-000000000001'
\set request 'bcbcbcbc-1000-4000-8000-000000000001'
insert into auth.users(id) values(:'admin');
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Lease regression","email":"lease@example.test"}') as guest \gset
select (:'guest'::jsonb)->>'id' as gid,(:'guest'::jsonb)->>'invitation_id' as iid \gset
reset role;
set local role service_role;
select prepare_invitation_delivery(:'event',:'request',:'gid') as prepared \gset
select (:'prepared'::jsonb)->>'id' as did \gset
select pg_temp.claim_delivery(:'did',repeat('a',64)) as claim \gset
select pg_temp.assert_invite((:'claim'::jsonb)->>'claimed'='true','first claim');
select pg_temp.assert_invite(pg_temp.claim_delivery(:'did',repeat('a',64))->>'reason'='processing','active lease prevents second provider attempt');
select pg_temp.assert_invite((select attempts=1 and locked_at is not null and last_attempt_at is not null and payload_hash=repeat('a',64) from invitation_deliveries where id=:'did'),'claim records metadata without credentials');
select pg_temp.assert_invite(not finish_invitation_delivery(:'did','sent','resend','wrong',null,gen_random_uuid()),'wrong fencing token cannot finalize');
select finish_invitation_delivery(:'did','pending','resend',null,'uncertain',(:'claim'::jsonb->>'token')::uuid);
select pg_temp.assert_invite((select status='pending' and locked_at is null and sent_at is null and error='uncertain' from invitation_deliveries where id=:'did'),'uncertain transport releases lease without marking failed/sent');
select pg_temp.assert_invite((select sent_at is null from invitations where id=:'iid'),'uncertain does not update dashboard');
select pg_temp.assert_invite(pg_temp.claim_delivery(:'did',repeat('b',64))->>'reason'='payload_changed','changed payload blocked');
select pg_temp.assert_invite((select attempts=1 and payload_hash=repeat('a',64) from invitation_deliveries where id=:'did'),'blocked payload does not change original hash or count');
select prepare_invitation_delivery(:'event',:'request',:'gid') as retry \gset
select pg_temp.assert_invite((:'retry'::jsonb)->>'id'=:'did' and (:'retry'::jsonb)->>'attempted'='true','same request restores original reservation');
select pg_temp.claim_delivery(:'did',repeat('a',64)) as retry_claim \gset
select pg_temp.assert_invite((:'retry_claim'::jsonb)->>'claimed'='true','identical retry within 24h');
select pg_temp.assert_invite(not finish_invitation_delivery(:'did','failed','resend',null,'late response',(:'claim'::jsonb->>'token')::uuid),'stale lease cannot overwrite retry');
select finish_invitation_delivery(:'did','sent','resend','logical-email',null,(:'retry_claim'::jsonb->>'token')::uuid);
select pg_temp.assert_invite((select attempts=2 and status='sent' and sent_at is not null and locked_at is null from invitation_deliveries where id=:'did'),'retry confirmed, same delivery');
select pg_temp.assert_invite((select sent_at is not null from invitations where id=:'iid'),'confirmed retry updates sent_at');
select pg_temp.assert_invite(pg_temp.claim_delivery(:'did',repeat('a',64))->>'claimed'='false','terminal delivery never reclaimed');
select prepare_invitation_delivery(:'event','bcbcbcbc-1000-4000-8000-000000000002',:'gid') as expired \gset
select (:'expired'::jsonb)->>'id' as oldid \gset
select pg_temp.claim_delivery(:'oldid',repeat('a',64)) as oldclaim \gset
select finish_invitation_delivery(:'oldid','pending','resend',null,'uncertain',(:'oldclaim'::jsonb->>'token')::uuid);
update invitation_deliveries set first_attempt_at=now()-interval '25 hours',last_attempt_at=now()-interval '1 hour' where id=:'oldid';
select pg_temp.assert_invite(pg_temp.claim_delivery(:'oldid',repeat('a',64))->>'reason'='expired','fixed 24h window cannot slide on recent retry');
select pg_temp.assert_invite((select status='pending' and attempts=1 from invitation_deliveries where id=:'oldid'),'expired remains pending without attempting');
select prepare_invitation_batch(:'event','bcbcbcbc-1000-4000-8000-000000000003') as batch \gset
update guest_contacts set email='' where guest_id=:'gid';
select pg_temp.assert_invite(prepare_invitation_batch(:'event','bcbcbcbc-1000-4000-8000-000000000003')=:'batch'::jsonb,'bulk membership is frozen even if contacts change');
select pg_temp.assert_invite(not has_function_privilege('authenticated','claim_invitation_delivery(uuid,text,text)','execute'),'lease RPC is server only');
select prepare_invitation_delivery(:'event','bcbcbcbc-1000-4000-8000-000000000003',:'gid') as frozen \gset
select pg_temp.assert_invite((:'frozen'::jsonb)->>'email'='lease@example.test' and (:'frozen'::jsonb)->>'available'='true','unattempted reservation sends only to its frozen address despite contact edit');
select prepare_invitation_delivery(:'event','bcbcbcbc-1000-4000-8000-000000000002',:'gid') as changed_contact \gset
select pg_temp.assert_invite((:'changed_contact'::jsonb)->>'email'='lease@example.test' and (:'changed_contact'::jsonb)->>'available'='false','contact changed after uncertain attempt blocks retry without sending to a different address');
update guest_contacts set email='lease@example.test' where guest_id=:'gid';
select prepare_invitation_resend(:'event','bcbcbcbc-1000-4000-8000-000000000002','bcbcbcbc-1000-4000-8000-000000000004',:'gid');
select prepare_invitation_resend(:'event','bcbcbcbc-1000-4000-8000-000000000002','bcbcbcbc-1000-4000-8000-000000000004',:'gid');
select pg_temp.assert_invite((select superseded_by='bcbcbcbc-1000-4000-8000-000000000004'::uuid and status='pending' and sent_at is null from invitation_deliveries where id=:'oldid'),'explicit override durably acknowledges uncertainty without inventing an outcome');
select pg_temp.assert_invite(pg_temp.claim_delivery(:'oldid',repeat('a',64))->>'reason'='superseded','superseded request cannot send again in another browser');
select pg_temp.assert_invite((select count(*)=1 from invitation_deliveries where event_id=:'event' and request_id='bcbcbcbc-1000-4000-8000-000000000004'),'replacement reserved atomically once and survives lost response/reload');
select pg_temp.assert_invite(not has_function_privilege('authenticated','prepare_invitation_resend(uuid,uuid,uuid,uuid)','execute'),'override reservation RPC is server only');
reset role;
delete from guests where event_id=:'event' and id=:'gid';
set local role service_role;
select prepare_invitation_delivery(:'event','bcbcbcbc-1000-4000-8000-000000000002',:'gid') as removed_retry \gset
select pg_temp.assert_invite((:'removed_retry'::jsonb)->>'status'='pending' and (:'removed_retry'::jsonb)->>'id'=:'oldid','deleted guest preserves original reservation and cannot silently complete an uncertain operation');
select pg_temp.assert_invite(prepare_invitation_batch(:'event','bcbcbcbc-1000-4000-8000-000000000003')=:'batch'::jsonb,'bulk identity survives deletion without creating a fresh operation');
rollback;
\echo Invitation retry regression passed: pending, lease/fencing, same reservation/hash, fixed 24h window, bulk membership and sent_at.
