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
reset role;
set local role service_role;
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000003',:'ga') as uncertain_family \gset
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000003',:'gb');
select (:'uncertain_family'::jsonb)->>'id' as uncertain_id \gset
select claim_invitation_delivery(:'uncertain_id',repeat('c',64)) as uncertain_claim \gset
select finish_invitation_delivery(:'uncertain_id','pending','resend',null,'uncertain',(:'uncertain_claim'::jsonb->>'token')::uuid);
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000004',:'ga') as individual_uncertain \gset
select (:'individual_uncertain'::jsonb)->>'id' as individual_uncertain_id \gset
select claim_invitation_delivery(:'individual_uncertain_id',repeat('d',64)) as individual_claim \gset
select finish_invitation_delivery(:'individual_uncertain_id','pending','resend',null,'uncertain',(:'individual_claim'::jsonb->>'token')::uuid);
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_DELETE',jsonb_build_object('guests',jsonb_build_array((select jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version) from guests g join invitations i on i.id=g.invitation_id where g.id=:'ga'))));
select pg_temp.assert_delivery((select status='pending' and sent_at is null from invitation_deliveries where id=:'uncertain_id'),'canonical guest deletion never cascades uncertain history');
select pg_temp.assert_delivery(exists(select 1 from jsonb_array_elements(app_snapshot(:'event')->'invitation_deliveries') d where d->>'id'=:'uncertain_id' and d->'guest_ids' @> jsonb_build_array(:'gb')),'snapshot retains active alias identity after canonical guest deletion');
reset role;
select pg_temp.assert_delivery(not exists(select 1 from invitation_delivery_members where event_id=:'event' and request_id='eeeeeeee-1000-4000-8000-000000000004' and guest_id=:'gb'),'individual alias has not incidentally retried the old request');
set local role service_role;
create function pg_temp.reject_unrelated_alias(e uuid,r uuid,n uuid,g uuid) returns boolean language plpgsql as $$begin perform prepare_invitation_resend(e,r,n,g);return false;exception when others then return sqlerrm='invalid previous operation';end$$;
select pg_temp.assert_delivery(pg_temp.reject_unrelated_alias(:'event','eeeeeeee-1000-4000-8000-000000000004','eeeeeeee-1000-4000-8000-000000000006',:'go'),'same email in another access unit cannot supersede the family operation');
select prepare_invitation_resend(:'event','eeeeeeee-1000-4000-8000-000000000004','eeeeeeee-1000-4000-8000-000000000005',:'gb');
select pg_temp.assert_delivery((select superseded_by='eeeeeeee-1000-4000-8000-000000000005'::uuid from invitation_deliveries where id=:'individual_uncertain_id'),'surviving same-family/email alias can explicitly override without first retrying');
update guest_contacts set email='changed-alias@example.test' where guest_id=:'gb';
select prepare_invitation_resend(:'event','eeeeeeee-1000-4000-8000-000000000004','eeeeeeee-1000-4000-8000-000000000005',:'gb');
update guest_contacts set email='same@example.test' where guest_id=:'gb';
select pg_temp.assert_delivery((select count(*)=1 from invitation_deliveries where request_id='eeeeeeee-1000-4000-8000-000000000005' and guest_id=:'gb'),'individual alias replacement reserved exactly once');
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000003',:'gb') as alias_retry \gset
select pg_temp.assert_delivery((:'alias_retry'::jsonb)->>'id'=:'uncertain_id' and (:'alias_retry'::jsonb)->>'status'='pending' and (:'alias_retry'::jsonb)->>'available'='false','remaining alias restores same uncertain operation without a new reservation');
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000007',:'gi') as before_move \gset
select (:'before_move'::jsonb)->>'id' as moved_delivery_id \gset
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000008',:'gi') as uncertain_move \gset
select (:'uncertain_move'::jsonb)->>'id' as uncertain_move_id \gset
select claim_invitation_delivery(:'uncertain_move_id',repeat('e',64)) as move_claim \gset
select finish_invitation_delivery(:'uncertain_move_id','pending','resend',null,'uncertain',(:'move_claim'::jsonb->>'token')::uuid);
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'fi','target_version',(select version from invitations where id=:'fi'),'guests',jsonb_build_array((select jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version) from guests g join invitations i on i.id=g.invitation_id where g.id=:'gi'))));
reset role;
set local role service_role;
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000007',:'gi') as after_move \gset
select prepare_invitation_delivery(:'event','eeeeeeee-1000-4000-8000-000000000008',:'gi') as after_uncertain_move \gset
select pg_temp.assert_delivery((:'after_move'::jsonb)->>'id'=:'moved_delivery_id' and (:'after_move'::jsonb)->>'available'='false' and (:'after_move'::jsonb)->>'attempted'='false','unattempted reservation rejects guest transferred to another unit');
select pg_temp.assert_delivery((:'after_move'::jsonb)->>'code' is null and (:'after_move'::jsonb)->>'password' is distinct from '1234','reserved individual delivery never exposes new family link/password');
select pg_temp.assert_delivery((:'after_uncertain_move'::jsonb)->>'id'=:'uncertain_move_id' and (:'after_uncertain_move'::jsonb)->>'available'='false' and (:'after_uncertain_move'::jsonb)->>'status'='pending','uncertain transfer keeps original pending reservation');
select pg_temp.assert_delivery((select bool_and(invitation_id=:'ii'::uuid and status='pending' and sent_at is null) from invitation_deliveries where id in (:'moved_delivery_id',:'uncertain_move_id')),'transfer does not mark either delivery sent or rewrite reserved unit');
select pg_temp.assert_delivery((select sent_at is null from invitations where id=:'fi'),'new family dashboard never marked sent by the old reservation');
select pg_temp.assert_delivery(pg_temp.reject_unrelated_alias(:'event','eeeeeeee-1000-4000-8000-000000000008','eeeeeeee-1000-4000-8000-000000000009',:'gi'),'even an originally registered member cannot reuse an uncertain operation across units');
rollback;
\echo Invitation delivery regression: individual/family, missing email, dedup, retry, resend, privacy, RLS and sent_at passed.
