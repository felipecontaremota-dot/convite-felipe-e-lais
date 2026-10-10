\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_delivery(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'eeeeeeee-0000-4000-8000-000000000001'
\set anon 'eeeeeeee-0000-4000-8000-000000000002'
\set request 'eeeeeeee-1000-4000-8000-000000000001'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'anon',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Individual delivery","whatsapp":"62999990047","email":"Individual@Example.test"}') as individual \gset
select (:'individual'::jsonb)->>'id' as gi,(:'individual'::jsonb)->>'invitation_id' as ii \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Family A","email":"Same@Example.test"}') as a \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Family B","email":"same@example.test"}') as b \gset
select admin_action(:'event','GUEST_CREATE','{"name":"No email"}') as missing \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Same email different unit","email":"same@example.test"}') as independent \gset
select (:'independent'::jsonb)->>'id' as go \gset
select (:'a'::jsonb)->>'id' as ga,(:'b'::jsonb)->>'id' as gb,(:'missing'::jsonb)->>'id' as gm \gset
select admin_action(:'event','INVITATION_SAVE','{"name":"Delivery family","pin":"1234"}') as family \gset
select (:'family'::jsonb)->>'id' as fi \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fi','version',1));
select admin_action(:'event','FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'fi','target_version',2,'guests',jsonb_build_array(jsonb_build_object('id',:'ga','version',1,'invitation_version',1),jsonb_build_object('id',:'gb','version',1,'invitation_version',1))));
reset role;
set local role service_role;
select prepare_invitation_delivery(:'event',:'request',:'gi') as di \gset
select pg_temp.assert_delivery((:'di'::jsonb)->>'password'='0047' and (:'di'::jsonb)->>'email'='individual@example.test','individual server password and normalized email');
select pg_temp.assert_delivery((:'di'::jsonb)->>'code'=(select sharing_code from invitation_access where invitation_id=:'ii'),'individual link');
select claim_invitation_delivery((:'di'::jsonb->>'id')::uuid,repeat('a',64)) as claim \gset
select finish_invitation_delivery((:'di'::jsonb->>'id')::uuid,'sent','resend','provider-id',null,(:'claim'::jsonb->>'token')::uuid);
select pg_temp.assert_delivery((select sent_at is not null and sent_channel='EMAIL' from invitations where id=:'ii'),'accepted provider updates legacy dashboard');
select pg_temp.assert_delivery((select not consent_email from guest_contacts where guest_id=:'gi'),'initial invitation is sent without recurring-message consent');
update guest_contacts set email='changed@example.test' where guest_id=:'gi';
select prepare_invitation_delivery(:'event',:'request',:'gi') as duplicate \gset
select pg_temp.assert_delivery((:'duplicate'::jsonb)->>'status'='sent' and (:'duplicate'::jsonb)->>'duplicate'='true' and not (:'duplicate'::jsonb ? 'password'),'same request returns earlier result without credentials');
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000002',:'gi') as resend \gset
select pg_temp.assert_delivery((:'resend'::jsonb)->>'duplicate'='false','explicit resend with new ID');
select claim_invitation_delivery((:'resend'::jsonb->>'id')::uuid,repeat('a',64)) as claim \gset
select finish_invitation_delivery((:'resend'::jsonb->>'id')::uuid,'failed','resend',null,'Falha sanitizada',(:'claim'::jsonb->>'token')::uuid);
select pg_temp.assert_delivery((select sent_at is not null from invitations where id=:'ii'),'failed resend does not clear first sent date');
select prepare_invitation_delivery(:'event',:'request',:'ga') as da \gset
select pg_temp.assert_delivery((:'da'::jsonb)->>'password'='1234' and (:'da'::jsonb)->>'code'=(select sharing_code from invitation_access where invitation_id=:'fi'),'family shared password/link');
select prepare_invitation_delivery(:'event',:'request',:'gb') as db \gset
select pg_temp.assert_delivery((:'db'::jsonb)->>'id'=(:'da'::jsonb)->>'id' and (:'db'::jsonb)->>'duplicate'='true','bulk deduplicates normalized email in same access unit');
select claim_invitation_delivery((:'da'::jsonb->>'id')::uuid,repeat('a',64)) as claim \gset
select finish_invitation_delivery((:'da'::jsonb->>'id')::uuid,'failed','resend',null,'Falha sanitizada',(:'claim'::jsonb->>'token')::uuid);
select pg_temp.assert_delivery((select sent_at is null from invitations where id=:'fi'),'Resend failure never marks sent_at');
select prepare_invitation_delivery(:'event',:'request',:'go') as different_unit \gset
select pg_temp.assert_delivery((:'different_unit'::jsonb)->>'duplicate'='false','same email across different units must not deduplicate');
select pg_temp.assert_delivery(invitation_delivery_targets(:'event') @> jsonb_build_array(:'gi',:'ga',:'gb',:'go') and not invitation_delivery_targets(:'event') @> jsonb_build_array(:'gm'),'bulk targets active valid-email guests, excluding missing email');
select prepare_invitation_delivery(:'event',:'request',:'gm') as no_email \gset
select pg_temp.assert_delivery((:'no_email'::jsonb)->>'status'='skipped','missing email skipped');
select pg_temp.assert_delivery(not exists(select 1 from information_schema.columns where table_name='invitation_deliveries' and column_name in ('password','pin','url','sharing_code')),'delivery table never persists credentials');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select pg_temp.assert_delivery((select count(*)=5 from invitation_deliveries where event_id=:'event'),'ADMIN can read delivery history');
select pg_temp.assert_delivery(jsonb_array_length(app_snapshot(:'event')->'invitation_deliveries')=5,'ADMIN snapshot history without secret fields');
select pg_temp.assert_delivery(not has_function_privilege('authenticated','prepare_invitation_delivery(uuid,uuid,uuid)','execute'),'frontend cannot retrieve server delivery credentials');
set local request.jwt.claim.sub=:'anon';
select pg_temp.assert_delivery((select count(*)=0 from invitation_deliveries),'guest cannot read deliveries');
select pg_temp.assert_delivery(jsonb_array_length(app_snapshot(:'event')->'invitation_deliveries')=0,'public snapshot no delivery history');
rollback;
\echo Invitation delivery regression: individual/family, missing email, dedup, retry, resend, privacy, RLS and sent_at passed.
