\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'aaaaaaaa-0000-4000-8000-000000000011'
\set device 'aaaaaaaa-0000-4000-8000-000000000012'
\set second_device 'aaaaaaaa-0000-4000-8000-000000000013'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'device',true),(:'second_device',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','INVITATION_SAVE','{"name":"Família PIN","pin":"0047","primary_name":"Responsável"}') as family \gset
select (:'family'::jsonb)->>'id' as fid \gset
select pg_temp.assert_true((select primary_guest_id is not null from invitations where id=:'fid'),'optional responsible creates member');
select primary_guest_id as primary_id from invitations where id=:'fid' \gset
select pg_temp.assert_true((select status='PENDING' from rsvps where guest_id=:'primary_id'),'primary RSVP pending');
select admin_action(:'event','INVITATION_SAVE','{"name":"Família Sem Responsável"}') as other \gset
select (:'other'::jsonb)->>'id' as other_id \gset
select pg_temp.assert_true((select primary_guest_id is null from invitations where id=:'other_id'),'family without responsible');
select pg_temp.assert_true((select pin='0047' from invitation_access where invitation_id=:'fid'),'string PIN persisted');
do $$begin perform admin_action('00000000-0000-4000-8000-000000000001','INVITATION_SAVE','{"name":"Bad PIN","pin":"47"}'); raise exception 'invalid PIN accepted'; exception when check_violation then null; end$$;
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('id',:'primary_id','version',1,'name','Responsável Completo','invitation_id',:'fid','whatsapp','+55 (62) 99999-3478','email','admin-contact@example.com','admin_notes','Privado','is_child',false,'is_adolescent',false));
select pg_temp.assert_true((select whatsapp='5562999993478' from guest_contacts where guest_id=:'primary_id'),'phone normalized');
select pg_temp.assert_true((select pin='0047' from invitation_access where invitation_id=:'fid'),'phone edit never overwrites PIN');
select version as fv from invitations where id=:'fid' \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',:'fv'::integer)) as rotated \gset
select (:'rotated'::jsonb)->>'code' as code \gset
select pg_temp.assert_true(length(:'code')=48,'random exclusive link');
select pg_temp.assert_true((select sharing_code=:'code' from invitation_access where invitation_id=:'fid'),'admin can copy persisted sharing code');
reset role;
set local role service_role;
select pg_temp.assert_true(not redeem_invitation(:'event',:'admin',:'code','0047','address'),'nonanonymous auth rejected in DB');
select pg_temp.assert_true(identify_invitation(:'event',:'device',:'code','address')=jsonb_build_object('name','Família PIN','activated',false),'identification only name + bound flag');
select pg_temp.assert_true(not redeem_invitation(:'event',:'device',:'code','9999','address'),'wrong PIN rejected');
select pg_temp.assert_true(not redeem_invitation(:'event',:'device','CodeInvalidoNaoEnumeravelCom32Char','0047','address'),'wrong code rejected');
select pg_temp.assert_true(redeem_invitation(:'event',:'device',:'code','0047','address'),'first activation leading zero');
select pg_temp.assert_true(redeem_invitation(:'event',:'second_device',:'code','0047','address'),'new device own activation');
select pg_temp.assert_true((identify_invitation(:'event',:'device',:'code','address')->>'activated')::boolean,'resume same valid link');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'device';
select pg_temp.assert_true(event_role(:'event')='GUEST','persisted binding');
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'guests')=1,'family isolation');
select pg_temp.assert_true(not (app_snapshot(:'event')->'guests'->0 ? 'admin_notes'),'admin notes absent from guest snapshot');
select pg_temp.assert_true(not (app_snapshot(:'event')->'invitations'->0 ? 'pin') and not (app_snapshot(:'event')->'invitations'->0 ? 'sharing_code'),'PIN/raw code absent from guest snapshot');
select pg_temp.assert_true((select count(*) from invitation_access)=0 and (select count(*) from guest_admin_details)=0,'private admin tables RLS');
select app_mutate(:'event','bbbbbbbb-0000-4000-8000-000000000011','CONTACT_UPDATE',jsonb_build_object('guest_id',:'primary_id','email','own@example.com','whatsapp','(62) 99999-0047','consent_email',true,'consent_whatsapp',true,'consent_in_app',true));
reset role;
update guest_contacts set consent_changed_at='2025-01-01T00:00:00Z' where guest_id=:'primary_id';
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select pg_temp.assert_true((select (i->>'device_count')::integer from jsonb_array_elements(app_snapshot(:'event')->'invitations') i where i->>'id'=:'fid')=2,'device count');
select version as fv from invitations where id=:'fid' \gset
select admin_action(:'event','PIN_SAVE',jsonb_build_object('id',:'fid','version',:'fv'::integer,'pin','1234'));
set local request.jwt.claim.sub=:'device';
select pg_temp.assert_true(event_role(:'event')='GUEST','PIN change preserves already-activated sessions');
reset role;
set local role service_role;
select pg_temp.assert_true(not redeem_invitation(:'event',:'device',:'code','0047','address'),'old PIN cannot activate');
select pg_temp.assert_true(redeem_invitation(:'event',:'device',:'code','1234','address'),'new PIN activates');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('id',:'primary_id','version',2,'name','Responsável Editado','invitation_id',:'fid','email','edited@example.com','whatsapp','62999993478','admin_notes','Privado','is_adolescent',true));
select pg_temp.assert_true((select consent_changed_at='2025-01-01T00:00:00Z'::timestamptz from guest_contacts where guest_id=:'primary_id'),'admin preserves consent timestamp');
select pg_temp.assert_true((select consent_email and consent_whatsapp and consent_in_app from guest_contacts where guest_id=:'primary_id'),'admin editing preserves guest consent');
select version as fv from invitations where id=:'fid' \gset
select admin_action(:'event','ACCESS_REVOKE',jsonb_build_object('id',:'fid','version',:'fv'::integer));
select pg_temp.assert_true((select pin='1234' and sharing_code=:'code' from invitation_access where invitation_id=:'fid'),'revoke does not change PIN or link');
set local request.jwt.claim.sub=:'device';
select pg_temp.assert_true(event_role(:'event') is null,'revoke removes access immediately');
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'guests')=0 and app_snapshot(:'event')->'role'='null'::jsonb,'revocation returns authoritative empty snapshot');
reset role;
set local role service_role;
select pg_temp.assert_true(redeem_invitation(:'event',:'device',:'code','1234','address'),'same UID may reactivate after revoke');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','Nova Pessoa','invitation_id',:'fid','email','new@example.com','whatsapp','62999990047','is_child',true)) as added \gset
select (:'added'::jsonb)->>'id' as gid \gset
select pg_temp.assert_true((select status='PENDING' from rsvps where guest_id=:'gid'),'new guest pending');
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('id',:'gid','version',1,'name','Pessoa Movida','invitation_id',:'other_id','email','moved@example.com','whatsapp','62999990047'));
select pg_temp.assert_true((select invitation_id=:'other_id' from guests where id=:'gid'),'guest move');
select pg_temp.assert_true((select email='moved@example.com' from guest_contacts where guest_id=:'gid'),'contact preserved on move');
select version as fv from invitations where id=:'other_id' \gset
select admin_action(:'event','INVITATION_SAVE',jsonb_build_object('id',:'other_id','version',:'fv'::integer,'name','Família Editada','active',true,'primary_guest_id',:'gid'));
select pg_temp.assert_true((select primary_guest_id=:'gid' from invitations where id=:'other_id'),'define primary after guest creation');
select version as fv from invitations where id=:'other_id' \gset
do $$begin perform admin_action('00000000-0000-4000-8000-000000000001','FAMILY_SPLIT','{}');raise exception 'split accepted';exception when raise_exception then if sqlerrm<>'retired admin action' then raise;end if;end$$;
do $$begin perform admin_action('00000000-0000-4000-8000-000000000001','FAMILY_MERGE','{}');raise exception 'merge accepted';exception when raise_exception then if sqlerrm<>'retired admin action' then raise;end if;end$$;
select version as gv from guests where id=:'gid' \gset
select admin_action(:'event','GUEST_REMOVE',jsonb_build_object('id',:'gid','version',:'gv'::integer));
select pg_temp.assert_true((select count(*) from guests where id=:'gid')=0 and (select count(*) from guest_contacts where guest_id=:'gid')=0,'remove guest and dependent contact');
select version as fv from invitations where id=:'fid' \gset
select admin_action(:'event','CODE_BLOCK',jsonb_build_object('id',:'fid','version',:'fv'::integer));
reset role;
set local role service_role;
select pg_temp.assert_true(not redeem_invitation(:'event',:'device',:'code','1234','address'),'blocked link');
select pg_temp.assert_true(identify_invitation(:'event',:'device',:'code','address') is null,'blocked identification');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select version as fv from invitations where id=:'fid' \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',:'fv'::integer)) as rotated2 \gset
select (:'rotated2'::jsonb)->>'code' as code2 \gset
select pg_temp.assert_true(:'code2'<>:'code','regenerate random link');
reset role;
set local role service_role;
select pg_temp.assert_true(not redeem_invitation(:'event',:'device',:'code','1234','different-address'),'old link fails');
-- Independent brute-force UID/source. Limit by code also prevents changing anonymous IDs.
do $$begin for n in 1..15 loop perform redeem_invitation('00000000-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000013','CodeBruteForceNaoEnumeravel32Chars','9999','brute');end loop;end$$;
select pg_temp.assert_true(not redeem_invitation(:'event',:'second_device',:'code2','1234','brute'),'rate limit');
reset role;
select pg_temp.assert_true(not has_function_privilege('authenticated','redeem_invitation(uuid,uuid,text,text,text)','EXECUTE'),'redeem service-only');
select pg_temp.assert_true(to_regprocedure('redeem_invitation(uuid,uuid,text,text)') is null,'old code-only signature removed');
select pg_temp.assert_true((select count(distinct action) from audit_logs where action in ('PIN_SAVE','CODE_ROTATE','CODE_BLOCK','ACCESS_REVOKE','ACTIVATION','ACTIVATION_FAILED','INVITATION_SAVE','PRIMARY_CHANGE','GUEST_SAVE','GUEST_REMOVE','GUEST_MOVE'))=11,'explicit access/family/guest audits');
select pg_temp.assert_true(not exists(select 1 from audit_logs where metadata::text like '%1234%' or metadata::text like '%0047%'),'no PIN or password logged');
rollback;
\echo 'Access: PIN, leading zeros, roles, identification, persistence, devices, revoke, consent, family/guest CRUD, RLS, rate limits and audits passed.'
