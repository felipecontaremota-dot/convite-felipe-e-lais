-- Representative state exists BEFORE 009: staff, individual/family links,
-- anonymous session, RSVP, QR, contacts, receipts, recipients and outbox.
insert into auth.users(id,is_anonymous) values
('ffcd0000-0000-4000-8000-000000000001',false),('ffcd0000-0000-4000-8000-000000000002',true);
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000001','ADMIN');
select set_config('request.jwt.claim.sub','ffcd0000-0000-4000-8000-000000000001',false);
create temp table password_upgrade_created as select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Preexisting individual","whatsapp":"62999997391"}') result;
create temp table password_upgrade_family as select admin_action('00000000-0000-4000-8000-000000000001','INVITATION_SAVE','{"name":"Preexisting family","pin":"7392"}') result;
select admin_action('00000000-0000-4000-8000-000000000001','CODE_ROTATE',jsonb_build_object('id',result->>'id','version',1)) from password_upgrade_family;
insert into guests(event_id,invitation_id,name) select '00000000-0000-4000-8000-000000000001',(result->>'id')::uuid,'Preexisting family member' from password_upgrade_family;
insert into guest_contacts(event_id,guest_id,email,consent_email,consent_whatsapp)
select event_id,id,'fixture@example.test',true,true from guests where invitation_id=(select (result->>'id')::uuid from password_upgrade_family);
insert into rsvps(event_id,guest_id,status,responded_at)
select event_id,id,'CONFIRMED',now() from guests where invitation_id=(select (result->>'id')::uuid from password_upgrade_family);
insert into qr_credentials(event_id,guest_id,token_hash)
select event_id,id,encode(extensions.digest(id::text,'sha256'),'hex') from guests where invitation_id=(select (result->>'id')::uuid from password_upgrade_family);
select app_mutate('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000010','MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Preexisting message','channels','["IN_APP","EMAIL"]'::jsonb,'recipient_guest_ids',jsonb_build_array(result->>'id'))) from password_upgrade_created;
select redeem_invitation('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000002',sharing_code,'7392','upgrade-fixture') from invitation_access where invitation_id=(select (result->>'id')::uuid from password_upgrade_family);
drop table password_upgrade_created,password_upgrade_family;
-- Real 007 baseline credentials, captured before the new migration.
create table public.password_upgrade_evidence as
select i.id,i.event_id,i.code_hash,a.pin,a.sharing_code from invitations i join invitation_access a on a.invitation_id=i.id;
create table public.password_upgrade_counts as
select (select count(*) from guests) guests,(select count(*) from rsvps) rsvps,(select count(*) from invitation_sessions) sessions;
-- Compare all existing public rows and every unrelated RPC definition/ACL.
create table public.password_upgrade_rows(table_name text primary key,rows jsonb);
do $$declare t record;data jsonb;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not like 'password_upgrade_%' loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',t.tablename) into data;
  insert into password_upgrade_rows values(t.tablename,data);
 end loop;
end$$;
create table public.password_upgrade_functions as
select p.oid,pg_get_functiondef(p.oid) definition,p.proacl,p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' and p.proname<>'create_individual_access';
