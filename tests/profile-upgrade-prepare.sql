\set ON_ERROR_STOP on
-- Isolated harness has applied exactly 001–007 at this point; no 008 schema exists.
do $$begin
 if exists(select 1 from information_schema.columns where table_name='guest_contacts' and column_name='communications_revoked') then raise exception 'upgrade fixture must start at 007';end if;
end$$;
-- Model the explicitly confirmed production ACL, not just the repository defaults.
grant execute on function app_mutate(uuid,uuid,text,jsonb),app_snapshot(uuid) to authenticated,service_role;
create table profile_upgrade_privileges as
 select p.oid,p.proname,p.proargnames,p.proargtypes,p.prorettype,p.prosecdef,p.proconfig,p.prosrc,r.rolname,
 has_function_privilege(r.rolname,p.oid,'EXECUTE') as allowed
 from pg_proc p cross join pg_roles r where p.oid in ('app_mutate(uuid,uuid,text,jsonb)'::regprocedure,'app_snapshot(uuid)'::regprocedure)
 and r.rolname in ('anon','authenticated','service_role');
\set event 'fefe0000-2000-4000-8000-000000000003'
\set admin 'fefe0000-2000-4000-8000-000000000010'
\set family_device 'fefe0000-2000-4000-8000-000000000011'
\set individual_device 'fefe0000-2000-4000-8000-000000000012'
insert into events(id,title,starts_at,timezone) values(:'event','Upgrade perfil',now(),'America/Sao_Paulo');
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'family_device',true),(:'individual_device',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set role authenticated;
set request.jwt.claim.sub=:'admin';
select admin_action(:'event','INVITATION_SAVE','{"name":"Família upgrade","pin":"0047","primary_name":"Responsável upgrade"}') as family \gset
select (:'family'::jsonb)->>'id' as fid \gset
select primary_guest_id as ga from invitations where id=:'fid' \gset
-- Explicit initial link issuance is fixture setup, never an upgrade side effect.
select version as fv from invitations where id=:'fid' \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',:'fv'::integer));
select admin_action(:'event','GUEST_SAVE',jsonb_build_object('name','Membro upgrade','invitation_id',:'fid','email','member@example.test','whatsapp','62999990047')) as member \gset
select (:'member'::jsonb)->>'id' as gb \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Individual upgrade","email":"individual@example.test","whatsapp":"62999990047"}') as individual \gset
select (:'individual'::jsonb)->>'id' as gc,(:'individual'::jsonb)->>'invitation_id' as iid \gset
select sharing_code as family_code from invitation_access where invitation_id=:'fid' \gset
select sharing_code as individual_code from invitation_access where invitation_id=:'iid' \gset
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000020','MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Mensagem pré-upgrade','channels','["IN_APP","EMAIL","PUSH","WHATSAPP"]'::jsonb,'recipient_guest_ids',jsonb_build_array(:'ga',:'gb',:'gc'),'create_announcement',true)) as message \gset
reset role;
set role service_role;
select redeem_invitation(:'event',:'family_device',:'family_code','0047','upgrade-family');
select redeem_invitation(:'event',:'individual_device',:'individual_code','0047','upgrade-individual');
reset role;
set role authenticated;
set request.jwt.claim.sub=:'family_device';
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000021','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','email','family@example.test','whatsapp','+55 (62) 9 9999-9999','consent_in_app',true,'consent_email',false,'consent_push',true,'consent_whatsapp',true));
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000022','RSVP_UPDATE',jsonb_build_object('guest_id',:'ga','status','CONFIRMED','note','Antes do upgrade'));
select issue_ticket(:'event',:'ga') as ticket \gset
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000023','PUSH_REGISTER',jsonb_build_object('guest_id',:'ga','token','ExpoPushToken[upgrade-existing]','platform','android'));
reset role;
-- Existing pending invitation operation and notification history must also survive.
set role service_role;
select prepare_invitation_delivery(:'event','fefe0000-2000-4000-8000-000000000024',:'ga');
reset role;
insert into delivery_attempts(event_id,job_id,status,provider)
 select event_id,id,'failed','fixture' from notification_jobs where event_id=:'event' and channel='EMAIL' limit 1;
-- Store the complete contract and every existing event row before the ONLY 008 DDL.
create table profile_upgrade_context as select :'event'::uuid as event,:'admin'::uuid as admin,:'family_device'::uuid as family_device,:'individual_device'::uuid as individual_device,:'fid'::uuid as fid,:'iid'::uuid as iid,:'ga'::uuid as ga,:'gb'::uuid as gb,:'gc'::uuid as gc,:'family_code'::text as family_code,:'individual_code'::text as individual_code,(:'message'::jsonb)->>'id' as message_id,(:'ticket'::jsonb)->>'token' as ticket;
create table profile_upgrade_rows(table_name text primary key,original jsonb not null);
do $$declare t record; rows jsonb;begin
 for t in select table_name from information_schema.columns where table_schema='public' and column_name='event_id' loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from %I x where event_id=$1',t.table_name) into rows using 'fefe0000-2000-4000-8000-000000000003'::uuid;
  insert into profile_upgrade_rows values(t.table_name,rows);
 end loop;
end$$;
create table profile_upgrade_snapshots(actor uuid primary key,original jsonb not null);
grant select,insert on profile_upgrade_snapshots to authenticated;
set role authenticated;
set request.jwt.claim.sub=:'admin';
insert into profile_upgrade_snapshots values(:'admin',app_snapshot(:'event'));
set request.jwt.claim.sub=:'family_device';
insert into profile_upgrade_snapshots values(:'family_device',app_snapshot(:'event'));
set request.jwt.claim.sub=:'individual_device';
insert into profile_upgrade_snapshots values(:'individual_device',app_snapshot(:'event'));
reset role;
\echo '007 production-shaped fixture committed: family/individual access, PIN/link, sessions, RSVP, QR, mixed consent, push, announcement, message, recipients, jobs and ACL.'
