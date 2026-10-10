\set ON_ERROR_STOP on
do $$begin
 if not exists(select 1 from guests where id='70707070-2000-4000-8000-000000000004' and salutation='NEUTRAL') then raise exception 'legacy salutation';end if;
 if not exists(select 1 from invitations i join invitation_access a on a.invitation_id=i.id where i.id='70707070-2000-4000-8000-000000000003' and i.primary_guest_id='70707070-2000-4000-8000-000000000004' and a.pin='0047' and a.sharing_code='UpgradeGuestOpaqueCodeUnchanged32') then raise exception 'access changed';end if;
 if not exists(select 1 from invitation_sessions where user_id='70707070-2000-4000-8000-000000000002' and pin_verified_at is not null and identified_guest_id is null) then raise exception 'session changed';end if;
 if not exists(select 1 from rsvps where guest_id='70707070-2000-4000-8000-000000000004' and status='CONFIRMED' and responded_at is not null) then raise exception 'RSVP changed';end if;
 if not exists(select 1 from guest_contacts where guest_id='70707070-2000-4000-8000-000000000004' and email='legacy@example.test' and whatsapp='62999430047' and consent_in_app and not consent_email and not consent_push and consent_whatsapp and notifications_revoked is null) then raise exception 'historical consent changed';end if;
 if not exists(select 1 from qr_credentials where guest_id='70707070-2000-4000-8000-000000000004' and token_hash=repeat('a',64) and revoked_at is null) then raise exception 'existing QR revoked';end if;
end$$;
update invitations set primary_guest_id=null where event_id='70707070-2000-4000-8000-000000000001';
delete from guests where event_id='70707070-2000-4000-8000-000000000001';
delete from invitations where event_id='70707070-2000-4000-8000-000000000001';
delete from events where id='70707070-2000-4000-8000-000000000001';
delete from auth.users where id='70707070-2000-4000-8000-000000000002';
\echo Upgrade 006 to 007 preserves head, access, session, RSVP, historical consents and existing QR.
