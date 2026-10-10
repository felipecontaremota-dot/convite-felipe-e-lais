\set ON_ERROR_STOP on
insert into events(id,title,starts_at,timezone) values('70707070-2000-4000-8000-000000000001','Upgrade guest','2026-12-15T19:00:00Z','America/Sao_Paulo');
insert into auth.users(id,is_anonymous) values('70707070-2000-4000-8000-000000000002',true);
insert into invitations(id,event_id,name,kind) values('70707070-2000-4000-8000-000000000003','70707070-2000-4000-8000-000000000001','Legacy family','FAMILY');
insert into guests(id,event_id,invitation_id,name) values('70707070-2000-4000-8000-000000000004','70707070-2000-4000-8000-000000000001','70707070-2000-4000-8000-000000000003','Legacy head');
update invitations set primary_guest_id='70707070-2000-4000-8000-000000000004' where id='70707070-2000-4000-8000-000000000003';
insert into invitation_access(event_id,invitation_id,pin,sharing_code) values('70707070-2000-4000-8000-000000000001','70707070-2000-4000-8000-000000000003','0047','UpgradeGuestOpaqueCodeUnchanged32');
update invitations set code_hash=encode(extensions.digest('UpgradeGuestOpaqueCodeUnchanged32','sha256'),'hex') where id='70707070-2000-4000-8000-000000000003';
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('70707070-2000-4000-8000-000000000001','70707070-2000-4000-8000-000000000002','70707070-2000-4000-8000-000000000003',now());
insert into rsvps(event_id,guest_id,status,responded_at,source) values('70707070-2000-4000-8000-000000000001','70707070-2000-4000-8000-000000000004','CONFIRMED',now(),'APP');
insert into guest_contacts(event_id,guest_id,email,whatsapp,consent_in_app,consent_email,consent_push,consent_whatsapp) values('70707070-2000-4000-8000-000000000001','70707070-2000-4000-8000-000000000004','legacy@example.test','62999430047',true,false,false,true);
insert into qr_credentials(event_id,guest_id,token_hash) values('70707070-2000-4000-8000-000000000001','70707070-2000-4000-8000-000000000004',repeat('a',64));
