\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
create function pg_temp.reject(action text,payload jsonb,expected text) returns void language plpgsql as $$begin perform admin_action('00000000-0000-4000-8000-000000000001',action,payload);raise exception 'accepted invalid action';exception when others then if sqlerrm<>expected then raise;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'cccccccc-0000-4000-8000-000000000001'
\set device 'cccccccc-0000-4000-8000-000000000002'
\set family_device 'cccccccc-0000-4000-8000-000000000003'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'device',true),(:'family_device',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
select pg_temp.assert_true(not exists(select 1 from invitations where kind<>'FAMILY'),'legacy families classified');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"José Victor","whatsapp":"+55 (62) 9 9999-0047","email":"jose@example.com","group_label":"Convidado(a) do noivo","is_child":true,"admin_notes":"Privado"}') as created \gset
select (:'created'::jsonb)->>'id' as gid,(:'created'::jsonb)->>'invitation_id' as individual \gset
select pg_temp.assert_true((select kind='INDIVIDUAL' and primary_guest_id=:'gid' from invitations where id=:'individual'),'individual belongs to exactly one access unit');
select pg_temp.assert_true((select status='PENDING' from rsvps where guest_id=:'gid'),'automatic pending RSVP');
select pg_temp.assert_true((select pin='0047' and length(sharing_code)=48 from invitation_access where invitation_id=:'individual'),'last-four password, leading zeros and individual link');
select pg_temp.assert_true((select whatsapp='62999990047' from guest_contacts where guest_id=:'gid'),'Brazil normalization');
select pg_temp.assert_true((select is_child and not is_adolescent and group_label='Convidado(a) do noivo' from guests where id=:'gid'),'child/group no adolescent');
select sharing_code as code from invitation_access where invitation_id=:'individual' \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Sem WhatsApp"}') as other \gset
select (:'other'::jsonb)->>'id' as other_guest,(:'other'::jsonb)->>'invitation_id' as other_unit \gset
select pg_temp.assert_true((select pin ~ '^[0-9]{4}$' and sharing_code is not null from invitation_access where invitation_id=:'other_unit'),'random fallback password and link without contact');
select pg_temp.reject('GUEST_CREATE','{"name":"Bad","email":"not-email"}','invalid contact');
select pg_temp.reject('GUEST_CREATE','{"name":"Bad","group_label":"Livre"}','invalid group');
select pg_temp.reject('GUEST_CREATE','{"name":"Bad","companion_of":null}','unsupported guest field');
select pg_temp.assert_true(not has_function_privilege('authenticated','create_individual_access(uuid,text,text)','execute') and not has_function_privilege('authenticated','admin_action_v3(uuid,text,jsonb)','execute'),'private helpers cannot bypass authorization');
reset role;
set local role service_role;
select pg_temp.assert_true(redeem_invitation(:'event',:'device',:'code','0047','standalone'),'individual activation unchanged Edge RPC');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'device';
select pg_temp.assert_true(owns_guest(:'event',:'gid') and not owns_guest(:'event',:'other_guest'),'individual owns only self');
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'guests')=1,'individual roster isolated');
select pg_temp.assert_true((select count(*) from guest_admin_details)=0 and (select count(*) from invitation_access)=0,'password/notes remain admin-only');
select app_mutate(:'event','dddddddd-0000-4000-8000-000000000001','RSVP_UPDATE',jsonb_build_object('guest_id',:'gid','status','CONFIRMED','note','Preservar'));
select issue_ticket(:'event',:'gid') as ticket \gset
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_UPDATE',jsonb_build_object('id',:'gid','version',1,'name','José Editado','whatsapp','62999990047','email','editado@example.com','admin_notes','Preservar nota','group_label','Convidado(a) do noivo','is_child',false));
select pg_temp.assert_true((select status='CONFIRMED' and note='Preservar' from rsvps where guest_id=:'gid'),'editing preserves RSVP');
select pg_temp.assert_true((select pin='0047' from invitation_access where invitation_id=:'individual'),'editing never resets password');
select pg_temp.reject('GUEST_UPDATE',jsonb_build_object('id',:'gid','version',1,'name','Stale'),'conflict');
select admin_action(:'event','INVITATION_SAVE','{"name":"Família destino","pin":"1234"}') as family \gset
select (:'family'::jsonb)->>'id' as fid \gset
select pg_temp.reject('FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'fid','target_version',1,'guests',jsonb_build_array(jsonb_build_object('id',:'gid','version',2,'invitation_version',2))),'family access required');
select pg_temp.assert_true((select invitation_id=:'individual' from guests where id=:'gid'),'missing family access never strips individual access');
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',1)) as rotated \gset
select (:'rotated'::jsonb)->>'code' as family_code \gset
reset role;
set local role service_role;
select pg_temp.assert_true(redeem_invitation(:'event',:'family_device',:'family_code','1234','family'),'family activation');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
-- One stale item must roll back the entire batch, including the valid first item.
select pg_temp.reject('FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'fid','target_version',2,'guests',jsonb_build_array(jsonb_build_object('id',:'gid','version',2,'invitation_version',2),jsonb_build_object('id',:'other_guest','version',999,'invitation_version',1))),'conflict');
select pg_temp.assert_true((select invitation_id=:'individual' from guests where id=:'gid'),'atomic rejected batch preserves first guest');
select admin_action(:'event','FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'fid','target_version',2,'guests',jsonb_build_array(jsonb_build_object('id',:'gid','version',2,'invitation_version',2),jsonb_build_object('id',:'other_guest','version',1,'invitation_version',1))));
select pg_temp.assert_true((select count(*) from guests where invitation_id=:'fid')=2,'batch added members');
select pg_temp.assert_true((select not active and archived_at is not null and code_hash is null from invitations where id=:'individual'),'old individual access archived');
select pg_temp.assert_true((select count(*) from invitation_sessions where invitation_id in (:'fid',:'individual'))=0,'source and target devices revoked');
select pg_temp.assert_true((select revoked_at is not null from qr_credentials where guest_id=:'gid'),'old QR revoked coherently');
select pg_temp.assert_true((select status='CONFIRMED' and note='Preservar' from rsvps where guest_id=:'gid') and (select email='editado@example.com' from guest_contacts where guest_id=:'gid') and (select notes='Preservar nota' from guest_admin_details where guest_id=:'gid'),'move preserves RSVP contacts private notes');
reset role;
set local role service_role;
select pg_temp.assert_true(not redeem_invitation(:'event',:'device',:'code','0047','old'),'old individual code cannot reactivate');
select pg_temp.assert_true(redeem_invitation(:'event',:'family_device',:'family_code','1234','family'),'family reactivation');
reset role;
set local role authenticated;
set local request.jwt.claim.sub=:'family_device';
select pg_temp.assert_true(owns_guest(:'event',:'gid') and owns_guest(:'event',:'other_guest'),'family owns only shared members');
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_REMOVE_FROM_FAMILY',jsonb_build_object('guests',jsonb_build_array(jsonb_build_object('id',:'gid','version',3,'invitation_version',3))));
select invitation_id as detached from guests where id=:'gid' \gset
select pg_temp.assert_true((select kind='INDIVIDUAL' and active from invitations where id=:'detached'),'removed member gets live individual unit');
select pg_temp.assert_true((select pin='0047' and sharing_code is not null from invitation_access where invitation_id=:'detached'),'removed member immediately gets password and link');
select pg_temp.assert_true((select status='CONFIRMED' from rsvps where guest_id=:'gid'),'detach is not deletion');
set local request.jwt.claim.sub=:'family_device';
select pg_temp.assert_true(event_role(:'event') is null and not owns_guest(:'event',:'gid'),'shared access revoked on detach');
set local request.jwt.claim.sub=:'admin';
select version as family_version from invitations where id=:'fid' \gset
select pg_temp.reject('FAMILY_DELETE',jsonb_build_object('id',:'fid','version',1),'conflict');
select admin_action(:'event','FAMILY_DELETE',jsonb_build_object('id',:'fid','version',:'family_version'::integer));
select pg_temp.assert_true((select archived_at is not null and not active and code_hash is null from invitations where id=:'fid'),'family soft-deleted');
select pg_temp.assert_true((select kind='INDIVIDUAL' and active from invitations where id=(select invitation_id from guests where id=:'other_guest')),'family deletion preserves guest with individual access');
select pg_temp.assert_true((select count(*) from guests where id in (:'gid',:'other_guest'))=2,'both guests preserved');
select version as event_version from events where id=:'event' \gset
select admin_action(:'event','EVENT_SAVE',jsonb_build_object('version',:'event_version'::integer,'venue_name','Villarejo Eventos','address','Rua do Evento, 12','gps_url','https://maps.google.com/?q=Evento'));
select pg_temp.assert_true((select venue_name='Villarejo Eventos' and address='Rua do Evento, 12' and gps_url='https://maps.google.com/?q=Evento' from events where id=:'event'),'venue/address/GPS saved separately');
do $$begin perform admin_action('00000000-0000-4000-8000-000000000001','EVENT_SAVE','{"version":2,"gps_url":"http://insecure.test"}');raise exception 'invalid URL accepted';exception when check_violation then null;end$$;
select pg_temp.reject('EVENT_SAVE','{"version":1,"gps_url":"https://maps.test"}','conflict');
-- Batch global deletion requires every version and preserves other guests.
select jsonb_agg(jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version)) as batch from guests g join invitations i on i.id=g.invitation_id where g.id in (:'gid',:'other_guest') \gset
select admin_action(:'event','GUEST_DELETE_BATCH',jsonb_build_object('guests',:'batch'::jsonb));
select pg_temp.assert_true((select count(*) from guests where id in (:'gid',:'other_guest'))=0 and (select count(*) from guest_contacts where guest_id in (:'gid',:'other_guest'))=0,'global batch deletion removes related records');
-- Family deletion converts every member, regardless of the public batch limit.
select admin_action(:'event','INVITATION_SAVE','{"name":"Large family"}') as big_family \gset
select (:'big_family'::jsonb)->>'id' as big_id \gset
reset role;
insert into guests(event_id,invitation_id,name) select :'event',:'big_id','Member '||n from generate_series(1,501) n;
insert into rsvps(event_id,guest_id) select event_id,id from guests where invitation_id=:'big_id';
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','FAMILY_DELETE',jsonb_build_object('id',:'big_id','version',1));
select pg_temp.assert_true((select count(*) from guests g join invitations i on i.id=g.invitation_id where g.name like 'Member %' and i.kind='INDIVIDUAL' and i.active)=501,'family deletion converts all members beyond batch size');
reset role;
set constraints all immediate;
select pg_temp.assert_true(not exists(select 1 from audit_logs where metadata::text like '%0047%' or metadata::text like '%1234%' or metadata::text like '%'||:'code'||'%'),'audit contains no passwords/codes');
select pg_temp.assert_true((select count(distinct action) from audit_logs where action in ('GUEST_CREATE','GUEST_UPDATE','FAMILY_ADD_MEMBERS','GUEST_REMOVE_FROM_FAMILY','FAMILY_DELETE','GUEST_DELETE_BATCH','LOCATION_UPDATE'))=7,'explicit operation audits');
rollback;
\echo 'Access units: standalone, migration defaults, RLS, atomic batches, optimistic conflicts, transfers, QR revocation, family deletion, contacts, GPS and audits passed.'
