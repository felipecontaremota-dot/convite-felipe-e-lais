\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_profile(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'profile confirmation: %',msg;end if;end$$;
create function pg_temp.reject_profile(q text) returns void language plpgsql as $$begin execute q;raise exception 'unexpected profile success';exception when others then if sqlerrm='unexpected profile success' then raise;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'ccccdddd-0000-4000-8000-000000000001'
\set a 'ccccdddd-0000-4000-8000-000000000002'
\set a2 'ccccdddd-0000-4000-8000-000000000003'
\set b 'ccccdddd-0000-4000-8000-000000000004'
\set c 'ccccdddd-0000-4000-8000-000000000005'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'a',true),(:'a2',true),(:'b',true),(:'c',false);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN'),(:'event',:'c','CEREMONIALIST');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Confirmation individual","whatsapp":"62999991111"}') as individual \gset
select (:'individual'::jsonb->>'id') as gid,(:'individual'::jsonb->>'invitation_id') as iid \gset
select admin_action(:'event','INVITATION_SAVE','{"name":"Confirmation family","pin":"7766"}') as family \gset
select (:'family'::jsonb->>'id') as fid \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',1));
select admin_action(:'event','GUEST_CREATE',jsonb_build_object('name','Family selected member','whatsapp','62999992222')) as member \gset
select (:'member'::jsonb->>'id') as mid \gset
select admin_action(:'event','GUEST_CREATE',jsonb_build_object('name','Family other member')) as other \gset
select (:'other'::jsonb->>'id') as oid \gset
select admin_action(:'event','FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'fid','target_version',2,'guests',(select jsonb_agg(jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version)) from guests g join invitations i on i.id=g.invitation_id where g.id in (:'mid'::uuid,:'oid'::uuid))));
reset role;
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values(:'event',:'a',:'iid',now()),(:'event',:'a2',:'iid',now()),(:'event',:'b',:'fid',now());
update guest_contacts set email='before@example.test',consent_email=true,consent_whatsapp=false,consent_push=false,communications_revoked=true where guest_id=:'gid';
create temp table before_access as select i.id,i.code_hash,a.pin,a.sharing_code from invitations i join invitation_access a on a.invitation_id=i.id where i.id=:'iid';
create temp table before_rsvp as select * from rsvps where guest_id=:'gid';
create temp table before_contacts as select guest_id,consent_in_app,consent_push,consent_email,consent_whatsapp,communications_revoked,consent_changed_at from guest_contacts where guest_id=:'gid';
set local role authenticated;
set local request.jwt.claim.sub=:'a';
select pg_temp.assert_profile((app_snapshot(:'event')->'profile_confirmation'->>'supported')::boolean,'backend capability available');
select pg_temp.assert_profile(app_snapshot(:'event')->'profile_confirmation'->>'guest_id'=:'gid','singleton derived, not an arbitrary member');
select pg_temp.assert_profile(app_snapshot(:'event')->'profile_confirmation'->>'confirmed_at' is null,'old login is not confirmation');
select version from guests where id=:'gid' \gset
select updated_at as ct from guest_contacts where guest_id=:'gid' \gset
select jsonb_build_object('guest_id',:'gid','name','  Nome   Corrigido  ','email','  corrected@example.test  ','whatsapp','+55 (62) 9 9999-1111','version',:'version'::int,'contact_updated_at',:'ct') as payload \gset
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_CONFIRM',:'payload'::jsonb||'{"name":""}'));
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_CONFIRM',:'payload'::jsonb||'{"email":"bad"}'));
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_CONFIRM',:'payload'::jsonb||'{"whatsapp":"629000"}'));
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_CONFIRM',:'payload'::jsonb||'{"consent_whatsapp":true}'));
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_CONFIRM',:'payload'::jsonb||'{"version":999}'));
select pg_temp.assert_profile(app_snapshot(:'event')->'profile_confirmation'->>'confirmed_at' is null,'invalid inputs never confirm');
reset role;
select set_config('request.jwt.claim.sub',:'admin',true);
select admin_action(:'event','GUEST_CREATE','{"name":"Nome indistinguível","whatsapp":"62999991111"}') as duplicate_name \gset
set local role authenticated;
set local request.jwt.claim.sub=:'a';
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_CONFIRM',:'payload'::jsonb||'{"name":"Nome indistinguível"}'));
select pg_temp.assert_profile((select name='Confirmation individual' and profile_confirmed_at is null from guests where id=:'gid'),'ambiguous correction rolls back the entire write');

select app_mutate(:'event','ccccdddd-1000-4000-8000-000000000001','PROFILE_CONFIRM',:'payload') as confirmed \gset
select pg_temp.assert_profile((:'confirmed'::jsonb->>'confirmed_at') is not null,'confirmation acknowledged');
select app_mutate(:'event','ccccdddd-1000-4000-8000-000000000001','PROFILE_CONFIRM',:'payload'::jsonb||'{"name":"Do not replace on retry"}') as repeated \gset
select pg_temp.assert_profile((:'repeated'::jsonb->>'duplicate')::boolean,'same UUID is idempotent');
select pg_temp.assert_profile((select name='Nome Corrigido' from guests where id=:'gid'),'name normalized');
select pg_temp.assert_profile((select email='corrected@example.test' and whatsapp='5562999991111' from guest_contacts where guest_id=:'gid'),'contact normalized and DDI retained');
reset role;
select pg_temp.assert_profile(not exists(select 1 from before_contacts x join guest_contacts c using(guest_id) where (x.consent_in_app,x.consent_push,x.consent_email,x.consent_whatsapp,x.communications_revoked,x.consent_changed_at) is distinct from (c.consent_in_app,c.consent_push,c.consent_email,c.consent_whatsapp,c.communications_revoked,c.consent_changed_at)),'initial confirmation preserves consent timestamp');
set local role authenticated;
set local request.jwt.claim.sub=:'a2';
select pg_temp.assert_profile(app_snapshot(:'event')->'profile_confirmation'->>'confirmed_at' is not null,'different session/device sees persisted status');
select app_mutate(:'event',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'gid','email','later@example.test','communications_revoked',true));
select pg_temp.assert_profile(app_snapshot(:'event')->'profile_confirmation'->>'confirmed_at' is not null,'later Profile edit never resets confirmation');
select app_mutate(:'event',gen_random_uuid(),'PROFILE_CONFIRM',:'payload'::jsonb||'{"name":"Do not replace after confirmation"}');
select pg_temp.assert_profile((select name='Nome Corrigido' from guests where id=:'gid'),'confirmed guest is not silently overwritten');
reset role;
select pg_temp.assert_profile(not exists(select 1 from before_contacts x join guest_contacts c using(guest_id) where (x.consent_in_app,x.consent_push,x.consent_email,x.consent_whatsapp,x.communications_revoked) is distinct from (c.consent_in_app,c.consent_push,c.consent_email,c.consent_whatsapp,c.communications_revoked)),'consent choices and revocation preserved');
select pg_temp.assert_profile(not exists(select 1 from before_access x join invitations i using(id) join invitation_access a on a.invitation_id=i.id where (x.code_hash,x.pin,x.sharing_code) is distinct from (i.code_hash,a.pin,a.sharing_code)),'credentials unchanged');
select pg_temp.assert_profile(not exists((select * from rsvps where guest_id=:'gid' except select * from before_rsvp) union all (select * from before_rsvp except select * from rsvps where guest_id=:'gid')),'RSVP independent');
select pg_temp.assert_profile((select count(*) from audit_logs where entity_id=:'gid' and action='PROFILE_CONFIRM')=1,'one audit');
set local role authenticated;
set local request.jwt.claim.sub=:'b';
select pg_temp.assert_profile(app_snapshot(:'event')->'profile_confirmation'->>'guest_id' is null,'family has no inferred primary identity');
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_IDENTIFY',jsonb_build_object('guest_id',:'gid')));
select version as mv from guests where id=:'mid' \gset
select jsonb_build_object('guest_id',:'mid','name','Selected member','email','member@example.test','whatsapp','62999992222','version',:'mv'::int,'contact_updated_at',(select updated_at from guest_contacts where guest_id=:'mid')) as mp \gset
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_CONFIRM',:'mp'));
select app_mutate(:'event',gen_random_uuid(),'PROFILE_IDENTIFY',jsonb_build_object('guest_id',:'mid'));
select pg_temp.assert_profile(app_snapshot(:'event')->'profile_confirmation'->>'guest_id'=:'mid','explicit member persisted in session');
select app_mutate(:'event',gen_random_uuid(),'PROFILE_CONFIRM',:'mp');
select pg_temp.assert_profile((select profile_confirmed_at is null from guests where id=:'oid'),'other family member not confirmed');
select pg_temp.assert_profile((select name='Family other member' from guests where id=:'oid'),'other member not changed');

-- Even with Supabase default DML grants, direct writes cannot forge the marker.
DO $$begin begin update public.guests set profile_confirmed_at=now() where name='Family other member';exception when insufficient_privilege then null;end;end$$;
select pg_temp.assert_profile((select profile_confirmed_at is null from guests where id=:'oid'),'RLS prevents direct confirmation');
reset role;
insert into events(id,title,starts_at) values('ccccdddd-9000-4000-8000-000000000001','Other confirmation event',now()+interval '1 month');
insert into user_roles(event_id,user_id,role) values('ccccdddd-9000-4000-8000-000000000001',:'admin','ADMIN');
select set_config('request.jwt.claim.sub',:'admin',true);
select admin_action('ccccdddd-9000-4000-8000-000000000001','GUEST_CREATE','{"name":"Other event confirmation","whatsapp":"62999993333"}') as foreign_guest \gset
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('ccccdddd-9000-4000-8000-000000000001',:'a',(:'foreign_guest'::jsonb->>'invitation_id')::uuid,now());
set local role authenticated;
set local request.jwt.claim.sub=:'a';
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_IDENTIFY',jsonb_build_object('guest_id',:'foreign_guest'::jsonb->>'id')));
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)','ccccdddd-9000-4000-8000-000000000001','PROFILE_IDENTIFY',jsonb_build_object('guest_id',:'gid')));
set local request.jwt.claim.sub=:'admin';
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_CONFIRM',:'payload'));
set local request.jwt.claim.sub=:'c';
select pg_temp.reject_profile(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)',:'event','PROFILE_IDENTIFY',jsonb_build_object('guest_id',:'gid')));
reset role;
select pg_temp.assert_profile(not has_function_privilege('authenticated','profile_confirmation_mutation_core(uuid,uuid,text,jsonb)','EXECUTE') and not has_function_privilege('service_role','profile_confirmation_snapshot_core(uuid)','EXECUTE'),'cores private');
rollback;
\echo Profile confirmation: identity, persistence, validation, consent, credentials, RSVP and isolation passed.
