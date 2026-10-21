begin;

-- Only verified exclusive-link entry uses this helper. Never infer an actor
-- from roster order or change an explicitly identified member of the same unit.
create function public.link_responsible_identity(p_event uuid,p_user uuid,p_invitation uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event::text,0));
 if not exists(select 1 from auth.users where id=p_user and is_anonymous)
 or exists(select 1 from public.user_roles where event_id=p_event and user_id=p_user) then return;end if;
 update public.invitation_sessions s set profile_guest_id=g.id
 from public.invitations i join public.guests g
   on g.id=i.primary_guest_id and g.event_id=i.event_id and g.invitation_id=i.id
 where s.event_id=p_event and s.user_id=p_user and s.invitation_id=p_invitation
   and s.pin_verified_at is not null
   and i.event_id=s.event_id and i.id=s.invitation_id and i.active and i.archived_at is null
   and not exists(select 1 from public.guests chosen
     where chosen.id=s.profile_guest_id and chosen.event_id=s.event_id and chosen.invitation_id=s.invitation_id);
end $$;
alter function public.link_responsible_identity(uuid,uuid,uuid) owner to postgres;
revoke all on function public.link_responsible_identity(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- The existing link+PIN verifier still owns authorization, rate limiting and
-- activation. Identity binding is in the same transaction/event lock.
create or replace function public.redeem_invitation_link(p_event uuid,p_user uuid,p_code text,p_pin text,p_bucket text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid;
begin
 if not public.redeem_invitation(p_event,p_user,p_code,p_pin,p_bucket) then return null;end if;
 select invitation_id into target from public.invitation_sessions where event_id=p_event and user_id=p_user;
 perform public.link_responsible_identity(p_event,p_user,target);
 return jsonb_build_object('linked',true,'invitation_id',target);
end $$;
alter function public.redeem_invitation_link(uuid,uuid,text,text,text) owner to postgres;
revoke all on function public.redeem_invitation_link(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.redeem_invitation_link(uuid,uuid,text,text,text) to service_role;

-- Recover old verified sessions when revisiting their actual exclusive link.
-- Preview alone never authorizes a UID, reveals a roster or confirms a profile.
create or replace function public.identify_invitation(p_event uuid,p_user uuid,p_code text,p_bucket text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare i public.invitations; activated boolean;
begin
 if not exists(select 1 from auth.users where id=p_user and is_anonymous) then return null;end if;
 -- Match redemption's lock order before touching rate-limit/session rows.
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event::text,0));
 if not public.invitation_attempt_allowed(p_event,p_user,p_code,p_bucket,true) then return null;end if;
 if p_code !~ '^[A-Za-z0-9_-]{32,64}$' then return null;end if;
 select * into i from public.invitations where event_id=p_event and active and archived_at is null
   and code_hash=encode(extensions.digest(p_code,'sha256'),'hex');
 if not found then return null;end if;
 activated=exists(select 1 from public.invitation_sessions where event_id=p_event and user_id=p_user and invitation_id=i.id and pin_verified_at is not null);
 if activated then perform public.link_responsible_identity(p_event,p_user,i.id);end if;
 return jsonb_build_object('name',i.name,'activated',activated);
end $$;
alter function public.identify_invitation(uuid,uuid,text,text) owner to postgres;
revoke all on function public.identify_invitation(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.identify_invitation(uuid,uuid,text,text) to service_role;

commit;
