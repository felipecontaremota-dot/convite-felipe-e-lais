-- Isolated harness only: fixture representing a previously activated FAMILY.
insert into events(id,title,starts_at) values('eeeeeeee-0000-4000-8000-000000000001','Upgrade fixture','2026-12-15 16:00:00-03');
insert into auth.users(id,is_anonymous) values('eeeeeeee-0000-4000-8000-000000000002',true);
insert into invitations(id,event_id,name,code_hash,first_activated_at) values('eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000001','Existing family','fixture-hash','2026-01-01');
insert into guests(id,event_id,invitation_id,name) values('eeeeeeee-0000-4000-8000-000000000004','eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003','Existing guest');
update invitations set primary_guest_id='eeeeeeee-0000-4000-8000-000000000004' where id='eeeeeeee-0000-4000-8000-000000000003';
insert into rsvps(event_id,guest_id,status,note) values('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000004','CONFIRMED','Preserve RSVP');
insert into invitation_access(event_id,invitation_id,pin,sharing_code) values('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003','0047','ExistingFixtureSharingCodeOnly123456');
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000002','eeeeeeee-0000-4000-8000-000000000003','2026-01-01');
create table test_access_upgrade_before as select to_jsonb(i) as invitation,(select to_jsonb(g) from guests g where g.invitation_id=i.id) as guest,(select to_jsonb(r) from rsvps r where r.guest_id=i.primary_guest_id) as rsvp,(select to_jsonb(a) from invitation_access a where a.invitation_id=i.id) as access,(select to_jsonb(s) from invitation_sessions s where s.invitation_id=i.id) as session,(select count(*) from audit_logs where event_id=i.event_id) as audits from invitations i where id='eeeeeeee-0000-4000-8000-000000000003';
