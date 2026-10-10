-- FAMILY credentials trust the shared access unit. Profile selection only
-- personalizes the session; it is neither proof of identity nor a QR gate.
-- Repair the observed production drift even when 007 is recorded/applied.
alter type public.rsvp_status add value if not exists 'MAYBE';
-- Restore the canonical API contract even if the deployed 007 RPC is missing
-- or has different argument names. No session is identified automatically.
alter table public.invitation_sessions add column if not exists identified_guest_id uuid references public.guests(id) on delete set null;
drop function if exists public.identify_guest(uuid,uuid);
create function public.identify_guest(p_event uuid,p_guest uuid) returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 if event_role(p_event) is distinct from 'GUEST' or not coalesce(owns_guest(p_event,p_guest),false) then raise exception 'unauthorized';end if;
 update invitation_sessions s set identified_guest_id=p_guest
 where s.event_id=p_event and s.user_id=auth.uid() and s.pin_verified_at is not null
 and exists(select 1 from guests g join invitations i on i.id=g.invitation_id where g.id=p_guest and g.event_id=p_event and i.event_id=p_event and i.id=s.invitation_id and i.active and i.archived_at is null);
 if not found then raise exception 'unauthorized';end if;
end $$;
revoke all on function public.identify_guest(uuid,uuid) from public,anon;
grant execute on function public.identify_guest(uuid,uuid) to authenticated;
create or replace function manages_guest_ticket(p_event uuid,p_guest uuid) returns boolean language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select event_role(p_event)='ADMIN' or (event_role(p_event)='GUEST' and owns_guest(p_event,p_guest));
$$;

create or replace function issue_family_ticket(p_event uuid,p_invitation uuid,p_regenerate boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare i invitations;token text:=encode(gen_random_bytes(32),'hex');
begin
 select * into i from invitations where event_id=p_event and id=p_invitation and kind='FAMILY' and active and archived_at is null for update;
 if not found or (event_role(p_event) is distinct from 'ADMIN' and (event_role(p_event) is distinct from 'GUEST' or my_invitation(p_event) is distinct from i.id)) then raise exception 'unauthorized';end if;
 if not p_regenerate and exists(select 1 from family_qr_credentials where event_id=p_event and invitation_id=i.id and revoked_at is null) then raise exception 'ticket_exists';end if;
 update family_qr_credentials set revoked_at=now() where event_id=p_event and invitation_id=i.id and revoked_at is null;
 insert into family_qr_credentials(event_id,invitation_id,token_hash) values(p_event,i.id,encode(digest(token,'sha256'),'hex'));
 return jsonb_build_object('invitation_id',i.id,'token',token);
end $$;

alter function app_snapshot(uuid) rename to app_snapshot_v7;
revoke all on function app_snapshot_v7(uuid) from public,anon,authenticated,service_role;
create function app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare s jsonb;role app_role:=event_role(p_event);unit uuid:=my_invitation(p_event);
begin
 s=app_snapshot_v7(p_event);
 return s||jsonb_build_object('guest_access_version',8,
 'rsvp_statuses',to_jsonb(enum_range(null::public.rsvp_status)),
 'ticket_guest_ids',(select coalesce(jsonb_agg(g.id order by g.id),'[]') from guests g join invitations i on i.id=g.invitation_id where g.event_id=p_event and i.event_id=p_event and i.active and i.archived_at is null and (role='ADMIN' or role='GUEST' and i.id=unit)),
 'family_ticket_invitation_ids',(select coalesce(jsonb_agg(i.id),'[]') from invitations i where i.event_id=p_event and i.kind='FAMILY' and i.active and i.archived_at is null and (role='ADMIN' or role='GUEST' and i.id=unit)),
 'family_credentials',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from family_qr_credentials q join invitations i on i.id=q.invitation_id where q.event_id=p_event and q.revoked_at is null and i.kind='FAMILY' and i.active and i.archived_at is null and (role in ('ADMIN','CEREMONIALIST') or role='GUEST' and i.id=unit)));
end $$;
revoke all on function app_snapshot(uuid) from public,anon;
grant execute on function app_snapshot(uuid) to authenticated;
notify pgrst,'reload schema';
