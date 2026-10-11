\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
create function pg_temp.digest(text,text) returns bytea language sql security definer as $$select extensions.digest($1,$2)$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'abab0009-0000-4000-8000-000000000001'
\set staff 'abab0009-0000-4000-8000-000000000002'
\set device 'abab0009-0000-4000-8000-000000000003'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'staff',false),(:'device',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN'),(:'event',:'staff','CEREMONIALIST');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','INVITATION_SAVE','{"name":"Família QR","pin":"0047","primary_name":"Guilherme"}') as family \gset
select (:'family'::jsonb)->>'id' as fid \gset
select primary_guest_id as ga from invitations where id=:'fid' \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',1)) as link \gset
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','Maria','invitation_id',:'fid')) as b \gset
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','Pedro','invitation_id',:'fid','is_child',true)) as c \gset
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','João','invitation_id',:'fid')) as d \gset
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','Pendente','invitation_id',:'fid')) as p \gset
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','Recusado','invitation_id',:'fid')) as r \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Outra unidade","whatsapp":"62999990047"}') as outside \gset
select (:'b'::jsonb)->>'id' as gb,(:'c'::jsonb)->>'id' as gc,(:'d'::jsonb)->>'id' as gd,(:'p'::jsonb)->>'id' as gp,(:'r'::jsonb)->>'id' as gr,(:'outside'::jsonb)->>'id' as go \gset
reset role;
update rsvps set status='CONFIRMED',responded_at='2026-10-01T00:00:00Z',note='Preservar RSVP' where guest_id in (:'ga',:'gb',:'gc',:'gd',:'go');
update rsvps set status='DECLINED' where guest_id=:'gr';
create temporary table original_rsvp as select to_jsonb(r) as original from rsvps r where event_id=:'event';
create temporary table original_access as select to_jsonb(a) original from invitation_access a where invitation_id=:'fid';
set local role service_role;
select pg_temp.assert_true(redeem_invitation(:'event',:'device',(:'link'::jsonb)->>'code','0047','qr-test'),'existing family access');
set local role authenticated;
set local request.jwt.claim.sub=:'device';
select issue_ticket(:'event',:'ga') as qa \gset
select issue_ticket(:'event',:'gb') as qb \gset
select issue_ticket(:'event',:'gc') as qc \gset
select issue_ticket(:'event',:'gd') as qd \gset
select issue_family_ticket(:'event',:'fid') as qf \gset
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'family_credentials')=1,'shared family session sees only its family credential');
select pg_temp.assert_true(length((:'qf'::jsonb)->>'token')=64,'family token entropy');
set local role service_role;
select pg_temp.assert_true(not redeem_invitation(:'event',:'device',(:'qf'::jsonb)->>'token','0047','qr-not-access'),'family QR cannot grant website access');
select pg_temp.assert_true(not redeem_invitation(:'event',:'device',(:'qa'::jsonb)->>'token','0047','qr-not-access'),'individual QR cannot grant website access');
set local role authenticated;
select set_config('test.family',:'fid',true),set_config('test.event',:'event',true),set_config('test.other',:'go',true);
select set_config('test.primary',:'ga',true),set_config('test.old_individual',encode(pg_temp.digest((:'qa'::jsonb)->>'token','sha256'),'hex'),true);
do $$begin
 begin perform app_mutate(current_setting('test.event')::uuid,gen_random_uuid(),'CHECKIN_FAMILY_CREATE','{}');raise exception 'guest checkin allowed';exception when others then if sqlerrm<>'unauthorized' then raise;end if;end;
 begin perform issue_family_ticket(current_setting('test.event')::uuid,gen_random_uuid());raise exception 'cross-unit issuance allowed';exception when others then if sqlerrm<>'unauthorized' then raise;end if;end;
end$$;
set local request.jwt.claim.sub=:'staff';
select app_mutate(:'event','abab0009-1000-4000-8000-000000000001','CHECKIN_CREATE',jsonb_build_object('guest_id',:'gc','method','QR','token_hash',encode(pg_temp.digest((:'qc'::jsonb)->>'token','sha256'),'hex'))) as child_arrival \gset
reset role;
select pg_temp.assert_true((select count(*)=1 from messages where recipient_guest_id=:'ga' and content='Pedro acabou de confirmar presença'),'individual child arrival notifies primary');
select pg_temp.assert_true((select count(*)=1 from message_recipients mr join messages m on m.id=mr.message_id where m.content='Pedro acabou de confirmar presença' and mr.guest_id=:'ga'),'existing IN_APP recipient infrastructure');
set local role authenticated;
set local request.jwt.claim.sub=:'staff';
select pg_temp.assert_true((app_mutate(:'event','abab0009-1000-4000-8000-000000000001','CHECKIN_CREATE','{}')->>'duplicate')::boolean,'receipt retry before mutable validations');
select app_mutate(:'event',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',:'gc','method','QR','token_hash',encode(pg_temp.digest((:'qc'::jsonb)->>'token','sha256'),'hex')));
select app_mutate(:'event','abab0009-1000-4000-8000-000000000002','CHECKIN_FAMILY_CREATE',jsonb_build_object('invitation_id',:'fid','guest_ids',jsonb_build_array(:'ga',:'gb',:'gc'),'token_hash',encode(pg_temp.digest((:'qf'::jsonb)->>'token','sha256'),'hex'))) as partial \gset
select pg_temp.assert_true(jsonb_array_length(:'partial'::jsonb->'checkins')=3,'exact family selection including already-present member');
select pg_temp.assert_true((app_mutate(:'event','abab0009-1000-4000-8000-000000000002','CHECKIN_FAMILY_CREATE','{}')->>'duplicate')::boolean,'family retry uses committed result');
reset role;
select pg_temp.assert_true((select count(*)=3 from checkins where guest_id in (:'ga',:'gb',:'gc',:'gd',:'gp',:'gr')),'partial family leaves absent and unconfirmed outside');
select pg_temp.assert_true((select count(*)=1 from messages where recipient_guest_id=:'ga'),'neither family arrivals nor duplicate individuals notify');
set local role authenticated;
set local request.jwt.claim.sub=:'staff';
select set_config('test.hash',encode(pg_temp.digest((:'qf'::jsonb)->>'token','sha256'),'hex'),true),set_config('test.pending',:'gp',true),set_config('test.declined',:'gr',true),set_config('test.remaining',:'gd',true);
do $$declare bad uuid;before_count bigint;begin
 select count(*) into before_count from checkins;
 foreach bad in array array[current_setting('test.other')::uuid,current_setting('test.pending')::uuid,current_setting('test.declined')::uuid] loop
  begin
   perform app_mutate(current_setting('test.event')::uuid,gen_random_uuid(),'CHECKIN_FAMILY_CREATE',jsonb_build_object('invitation_id',current_setting('test.family'),'token_hash',current_setting('test.hash'),'guest_ids',jsonb_build_array(current_setting('test.remaining'),bad)));
   raise exception 'malicious or unconfirmed member accepted';
  exception when others then if sqlerrm<>'invalid or unconfirmed members' then raise;end if;end;
  perform pg_temp.assert_true((select count(*)=before_count from checkins),'invalid selection rolls back entire family operation');
 end loop;
end$$;
select app_mutate(:'event',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',:'gd','method','QR','token_hash',encode(pg_temp.digest((:'qd'::jsonb)->>'token','sha256'),'hex')));
set local request.jwt.claim.sub=:'device';
select issue_family_ticket(:'event',:'fid',true) as new_family \gset
reset role;
select pg_temp.assert_true((select count(*)=4 from qr_credentials where guest_id in (:'ga',:'gb',:'gc',:'gd') and revoked_at is null),'family regeneration leaves all individual QRs intact');
set local role authenticated;
set local request.jwt.claim.sub=:'device';
select issue_ticket(:'event',:'ga',true) as new_primary \gset
select pg_temp.assert_true((select count(*)=1 from family_qr_credentials where invitation_id=:'fid' and revoked_at is null),'individual regeneration leaves family QR intact');
reset role;
select pg_temp.assert_true((select count(*)=3 from qr_credentials where guest_id in (:'gb',:'gc',:'gd') and revoked_at is null),'individual regeneration leaves other members intact');
set local role authenticated;
set local request.jwt.claim.sub=:'staff';
do $$begin
 begin perform app_mutate(current_setting('test.event')::uuid,gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',current_setting('test.primary'),'method','QR','token_hash',current_setting('test.old_individual')));raise exception 'old individual QR accepted';exception when others then if sqlerrm<>'invalid QR' then raise;end if;end;
 begin perform app_mutate(current_setting('test.event')::uuid,gen_random_uuid(),'CHECKIN_FAMILY_CREATE',jsonb_build_object('invitation_id',current_setting('test.family'),'token_hash',current_setting('test.hash'),'guest_ids',jsonb_build_array(current_setting('test.remaining'))));raise exception 'old family QR accepted';exception when others then if sqlerrm<>'invalid family QR' then raise;end if;end;
end$$;
reset role;
select pg_temp.assert_true(not exists((select to_jsonb(r) from rsvps r where event_id=:'event') except select original from original_rsvp),'check-in and QR regeneration preserve RSVP byte-for-byte');
select pg_temp.assert_true((select to_jsonb(a) from invitation_access a where invitation_id=:'fid')=(select original from original_access),'website link hash sharing code PIN unchanged');
select pg_temp.assert_true((select count(*)=1 from audit_logs where entity_id=:'fid' and action='CODE_ROTATE'),'QR never rotates website code');
select pg_temp.assert_true(has_function_privilege('authenticated','app_mutate(uuid,uuid,text,jsonb)','EXECUTE') and has_function_privilege('service_role','app_mutate(uuid,uuid,text,jsonb)','EXECUTE') and has_function_privilege('service_role','app_snapshot(uuid)','EXECUTE'),'public RPC privileges preserved');
select pg_temp.assert_true(not has_function_privilege('anon','app_snapshot(uuid)','EXECUTE') and not has_function_privilege('authenticated','app_snapshot_v8(uuid)','EXECUTE') and not has_function_privilege('service_role','app_mutate_v8(uuid,uuid,text,jsonb)','EXECUTE'),'anonymous and internal wrappers remain private');

-- Consent gates are tested with fresh arrivals, not already-present guests.
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','Sem comunicação','invitation_id',:'fid')) as silent \gset
select (:'silent'::jsonb)->>'id' as gs \gset
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','Revogação global','invitation_id',:'fid')) as revoked \gset
select (:'revoked'::jsonb)->>'id' as gx \gset
select admin_action(:'event','INVITATION_SAVE','{"name":"Outra família QR","pin":"0199","primary_name":"Único confirmado"}') as one \gset
select (:'one'::jsonb)->>'id' as other_family \gset
select primary_guest_id as only_member from invitations where id=:'other_family' \gset
select app_mutate(:'event',gen_random_uuid(),'RSVP_UPDATE',jsonb_build_object('guest_id',:'gs','status','CONFIRMED'));
select app_mutate(:'event',gen_random_uuid(),'RSVP_UPDATE',jsonb_build_object('guest_id',:'gx','status','CONFIRMED'));
select app_mutate(:'event',gen_random_uuid(),'RSVP_UPDATE',jsonb_build_object('guest_id',:'only_member','status','CONFIRMED'));
select issue_family_ticket(:'event',:'other_family') as one_qr \gset
select pg_temp.assert_true(length(:'one_qr'::jsonb->>'token')=64,'family with only one confirmed member has its own QR');
select app_mutate(:'event',gen_random_uuid(),'CHECKIN_FAMILY_CREATE',jsonb_build_object('invitation_id',:'other_family','guest_ids',jsonb_build_array(:'only_member'),'token_hash',encode(pg_temp.digest((:'one_qr'::jsonb)->>'token','sha256'),'hex')));
select pg_temp.assert_true((select count(*)=1 from checkins where guest_id=:'only_member'),'family with only one confirmed member checks in once');
select app_mutate(:'event',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','consent_in_app',false));
select app_mutate(:'event',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',:'gs','method','MANUAL'));
select app_mutate(:'event',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','consent_in_app',true,'communications_revoked',true));
select app_mutate(:'event',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',:'gx','method','MANUAL'));
select pg_temp.assert_true(not exists(select 1 from messages where content in ('Sem comunicação acabou de confirmar presença','Revogação global acabou de confirmar presença')),'IN_APP denial and global revocation prevent arrival notification');
select pg_temp.assert_true(not exists(select 1 from message_recipients where guest_id=:'only_member'),'arrival notifications never target another family');
set local request.jwt.claim.sub=:'device';
select pg_temp.assert_true((select count(*)=2 from family_qr_credentials),'direct RLS contains only own family including revoked version');
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'family_credentials')=2,'snapshot same family isolation');
select pg_temp.assert_true(not exists(select 1 from messages where content='Pedro acabou de confirmar presença'),'revocation blocks direct arrival inbox reading too');
set local request.jwt.claim.sub=:'staff';
do $$begin
 begin perform issue_family_ticket(current_setting('test.event')::uuid,current_setting('test.family')::uuid,true);raise exception 'ceremonialist issued credential';exception when others then if sqlerrm<>'unauthorized' then raise;end if;end;
end$$;

rollback;
