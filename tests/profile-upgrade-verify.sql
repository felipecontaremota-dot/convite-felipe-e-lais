do $$begin
 if (select count(*) from profile_upgrade_contact)<>1 then raise exception 'missing legacy contact fixture';end if;
 if exists(select 1 from guest_contacts where communications_revoked) then raise exception 'upgrade introduced revocation';end if;
 if exists(select 1 from profile_upgrade_contact f left join guest_contacts c on c.id=f.id where (to_jsonb(c)-'communications_revoked') is distinct from f.original) then
 raise exception 'profile migration changed existing contact/consent data';end if;
end$$;
drop table profile_upgrade_contact;
delete from guests where id='fefe0000-2000-4000-8000-000000000002';
delete from invitations where id='fefe0000-2000-4000-8000-000000000001';
delete from events where id='fefe0000-2000-4000-8000-000000000003';
