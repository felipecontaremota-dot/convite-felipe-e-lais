-- READ-ONLY production checkpoint. Run as the trusted database owner only.
-- Does not print invitation codes/PINs, tokens, contacts, payloads or secret values.
begin transaction read only;
select current_database() as database, current_user as inspected_by, now() as inspected_at;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as signature,
 pg_get_userbyid(p.proowner) as owner,p.prosecdef as security_definer,p.proconfig as settings,p.proacl as acl,
 pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('app_snapshot','app_snapshot_v4','app_snapshot_v5','app_snapshot_v6','app_snapshot_v7',
 'app_mutate','app_mutate_v4','app_mutate_v6','admin_action','admin_action_v3','admin_action_v6',
 'issue_ticket','event_role','identify_invitation','redeem_invitation','my_invitation',
 'identify_guest','invitation_attempt_allowed','owns_guest','validate_family_head')
order by p.proname,signature;
select c.relname,pg_get_userbyid(c.relowner) as owner,c.relrowsecurity as rls,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('invitations','guests','invitation_access','invitation_sessions','mutation_receipts',
 'invitation_deliveries','family_qr_credentials','guest_checkin_notices');
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select tgname,pg_get_triggerdef(oid) as definition from pg_trigger
where not tgisinternal and tgrelid in ('public.invitations'::regclass,'public.guests'::regclass) order by tgname;
select enumlabel,enumsortorder from pg_enum where enumtypid='public.rsvp_status'::regtype order by enumsortorder;
select status,count(*) from public.rsvps group by status;
select count(*) filter(where notifications_revoked is true) as revoked_contacts,
 count(*) filter(where notifications_revoked is true and (consent_in_app or consent_push or consent_email or consent_whatsapp)) as inconsistent_revoked_contacts
from public.guest_contacts;
select status,count(*) as deliveries,count(*) filter(where locked_at>now()-interval '2 minutes') as active_leases,
 count(*) filter(where first_attempt_at<=now()-interval '24 hours') as beyond_safe_window
from public.invitation_deliveries group by status;
select status,count(*) from public.notification_jobs group by status;
select count(*) as receipts,count(*) filter(where result is null) as historical_without_result from public.mutation_receipts;
select count(*) as access_rows,count(*) filter(where i.code_hash=encode(extensions.digest(a.sharing_code,'sha256'),'hex')) as matching_current_links,
 count(*) filter(where a.pin ~ '^[0-9]{4}$') as valid_pin_format
from public.invitation_access a join public.invitations i on i.event_id=a.event_id and i.id=a.invitation_id;
select count(*) as verified_sessions,count(*) filter(where identified_guest_id is not null) as identified_sessions from public.invitation_sessions where pin_verified_at is not null;
select 'family_credentials' as structure,count(*) as rows from public.family_qr_credentials
union all select 'guest_checkin_notices',count(*) from public.guest_checkin_notices;
commit;
