\set ON_ERROR_STOP on
-- Data created on 008 must survive the compatibility migration byte-for-byte.
insert into events(id,title,starts_at) values('90909090-0000-4000-8000-000000000001','Rollback preservation','2026-12-15T19:00:00Z');
insert into auth.users(id,is_anonymous) values('90909090-0000-4000-8000-000000000002',true),('90909090-0000-4000-8000-000000000003',false),('90909090-0000-4000-8000-000000000004',false);
insert into user_roles(event_id,user_id,role) values('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000003','ADMIN'),('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000004','CEREMONIALIST');
insert into invitations(id,event_id,name,kind,code_hash) values('90909090-0000-4000-8000-000000000010','90909090-0000-4000-8000-000000000001','Preserved family','FAMILY',encode(extensions.digest('RollbackOpaqueCodeUnchangedAtLeast32','sha256'),'hex'));
insert into guests(id,event_id,invitation_id,name,salutation) values('90909090-0000-4000-8000-000000000011','90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000010','Preserved head','FEMALE'),('90909090-0000-4000-8000-000000000012','90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000010','Preserved member','NEUTRAL');
update invitations set primary_guest_id='90909090-0000-4000-8000-000000000011' where id='90909090-0000-4000-8000-000000000010';
insert into invitation_access(event_id,invitation_id,pin,sharing_code) values('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000010','0047','RollbackOpaqueCodeUnchangedAtLeast32');
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at,identified_guest_id) values('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000002','90909090-0000-4000-8000-000000000010',now(),'90909090-0000-4000-8000-000000000011');
insert into rsvps(event_id,guest_id,status,note) values('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000011','MAYBE','Keep this response'),('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000012','CONFIRMED','Keep confirmation');
insert into guest_contacts(event_id,guest_id,email,whatsapp,consent_in_app,consent_email,consent_push,consent_whatsapp,notifications_revoked) values('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000011','rollback@example.test','62999990047',false,false,false,false,true);
insert into qr_credentials(event_id,guest_id,token_hash) values('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000012',repeat('e',64));
insert into family_qr_credentials(event_id,invitation_id,token_hash) values('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000010',repeat('f',64));
insert into checkins(id,event_id,guest_id,mutation_id,method,actor_id) values('90909090-0000-4000-8000-000000000020','90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000012','90909090-0000-4000-8000-000000000021','QR','90909090-0000-4000-8000-000000000004');
insert into guest_checkin_notices(event_id,checkin_id,recipient_guest_id,content) values('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000020','90909090-0000-4000-8000-000000000011','Keep notice');
set role authenticated;
set request.jwt.claim.sub='90909090-0000-4000-8000-000000000003';
select app_mutate('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000030','MESSAGE_SEND_TO_GUESTS','{"recipient_guest_ids":["90909090-0000-4000-8000-000000000011","90909090-0000-4000-8000-000000000012"],"channels":["IN_APP","EMAIL"],"create_announcement":true,"content":"Keep broadcast and jobs"}');
reset role;
set role service_role;
select prepare_invitation_delivery('90909090-0000-4000-8000-000000000001','90909090-0000-4000-8000-000000000040','90909090-0000-4000-8000-000000000011') as delivery \gset
select claim_invitation_delivery((:'delivery'::jsonb->>'id')::uuid,repeat('c',64),(:'delivery'::jsonb->>'credential_hash'));
reset role;
create schema rollback_checkpoint;
create table rollback_checkpoint.data(table_name text primary key, rows jsonb);
do $$declare t record;v jsonb;begin
 for t in select tablename from pg_tables where schemaname in ('public','auth') loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from %I.%I x',case when t.tablename='users' then 'auth' else 'public' end,t.tablename) into v;
  insert into rollback_checkpoint.data values(t.tablename,v);
 end loop;
end$$;
