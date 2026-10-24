begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
DO $$begin
 if current_setting('server_version_num')::int>=170000 then
  perform set_config('transaction_timeout','30s',true);
 end if;
end $$;

-- Explicit replacement only: retain the issuer, hashing, audit triggers and RLS.
-- The guest lock is the same lock used by issue_ticket and check-in creation.
create function public.replace_ticket(p_event uuid,p_guest uuid,p_expected_credential uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog set lock_timeout='3s' as $$
declare current_credential uuid;
begin
 if auth.uid() is null or
  (public.event_role(p_event) is distinct from 'ADMIN' and not public.owns_guest(p_event,p_guest)) then
  raise exception 'unauthorized';
 end if;
 perform 1 from public.guests where event_id=p_event and id=p_guest for update;
 if not found then raise exception 'unauthorized';end if;
 select id into current_credential from public.qr_credentials
  where event_id=p_event and guest_id=p_guest and revoked_at is null;
 if p_expected_credential is null or current_credential is distinct from p_expected_credential then
  raise exception 'ticket_changed';
 end if;
 -- The existing issuer rechecks authorization and RSVP, then atomically revokes
 -- the previous hash and inserts the new one. Raw tokens are never persisted.
 return public.issue_ticket(p_event,p_guest,true);
end $$;
revoke all on function public.replace_ticket(uuid,uuid,uuid) from public,anon,service_role;
grant execute on function public.replace_ticket(uuid,uuid,uuid) to authenticated;
commit;
