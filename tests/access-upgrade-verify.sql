do $$begin
 if not exists(select 1 from invitations i cross join test_access_upgrade_before b where i.id='eeeeeeee-0000-4000-8000-000000000003' and i.kind='FAMILY' and i.archived_at is null and (to_jsonb(i)-'kind'-'archived_at')=b.invitation and (select to_jsonb(g) from guests g where g.invitation_id=i.id)=b.guest and (select to_jsonb(r) from rsvps r where r.guest_id=i.primary_guest_id)=b.rsvp and (select to_jsonb(a) from invitation_access a where a.invitation_id=i.id)=b.access and (select to_jsonb(s) from invitation_sessions s where s.invitation_id=i.id)=b.session and (select count(*) from audit_logs where event_id=i.event_id)=b.audits) then raise exception 'migration modified existing family data';end if;
end $$;
drop table test_access_upgrade_before;
update invitations set primary_guest_id=null where event_id='eeeeeeee-0000-4000-8000-000000000001';
delete from guests where event_id='eeeeeeee-0000-4000-8000-000000000001';
delete from invitations where event_id='eeeeeeee-0000-4000-8000-000000000001';
delete from audit_logs where event_id='eeeeeeee-0000-4000-8000-000000000001';
delete from events where id='eeeeeeee-0000-4000-8000-000000000001';
delete from auth.users where id='eeeeeeee-0000-4000-8000-000000000002';
\echo 'Upgrade preserves existing guests, RSVP, code/hash, password, verified sessions and history byte-for-byte.'
