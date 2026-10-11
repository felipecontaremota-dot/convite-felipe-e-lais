insert into events(id,title,starts_at,timezone) values('fefe0000-2000-4000-8000-000000000003','Upgrade perfil',now(),'America/Sao_Paulo');
-- Seed a legacy formatted number and partial consent before applying 008.
insert into invitations(id,event_id,name) values('fefe0000-2000-4000-8000-000000000001','fefe0000-2000-4000-8000-000000000003','Upgrade perfil');
insert into guests(id,event_id,invitation_id,name) values('fefe0000-2000-4000-8000-000000000002','fefe0000-2000-4000-8000-000000000003','fefe0000-2000-4000-8000-000000000001','Contato legado');
insert into guest_contacts(event_id,guest_id,whatsapp,consent_in_app,consent_email,consent_push,consent_whatsapp) values('fefe0000-2000-4000-8000-000000000003','fefe0000-2000-4000-8000-000000000002','+55 (62) 9 9999-9999',true,false,false,true);
create table profile_upgrade_contact as select id,to_jsonb(c) as original from guest_contacts c where guest_id='fefe0000-2000-4000-8000-000000000002';
