begin;
set local lock_timeout='5s';
-- Additive extension: no replacement of authentication, snapshot, mutation or RSVP functions.
create schema wedding_party_private;
revoke all on schema wedding_party_private from public,anon,authenticated,service_role;
create table wedding_party_private.promotions (
 cycle_id uuid primary key default gen_random_uuid(),
 event_id uuid not null,
 guest_id uuid not null,
 role text not null check(role in ('PADRINHO','MADRINHA')),
 active boolean not null default true,
 created_at timestamptz not null default clock_timestamp(),
 accepted_at timestamptz,
 completed_at timestamptz,
 revoked_at timestamptz,
 foreign key(event_id,guest_id) references public.guests(event_id,id) on delete cascade,
 check(completed_at is null or accepted_at is not null),
 check(active = (revoked_at is null))
);
create unique index promotions_current on wedding_party_private.promotions(event_id,guest_id) where active;
alter table wedding_party_private.promotions enable row level security;
revoke all on wedding_party_private.promotions from public,anon,authenticated,service_role;

-- The existing profile is an explicit identity declaration within a family session,
-- not a separate personal authentication factor. Never accept guest_id from a guest RPC.
create function wedding_party_private.actor(p_event uuid) returns uuid
language plpgsql stable security definer set search_path=pg_catalog as $$
declare chosen uuid; inv uuid;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'GUEST' then return null;end if;
 inv=public.my_invitation(p_event);
 if inv is null or not exists(select 1 from public.invitations where event_id=p_event and id=inv and active and archived_at is null) then return null;end if;
 select profile_guest_id into chosen from public.invitation_sessions where event_id=p_event and user_id=auth.uid() and invitation_id=inv;
 if chosen is null and (select count(*) from public.guests where event_id=p_event and invitation_id=inv)=1 then
  select id into chosen from public.guests where event_id=p_event and invitation_id=inv;
 end if;
 if not exists(select 1 from public.guests where event_id=p_event and id=chosen and invitation_id=inv and profile_confirmed_at is not null) or not public.owns_guest(p_event,chosen) then return null;end if;
 return chosen;
end $$;
revoke all on function wedding_party_private.actor(uuid) from public,anon,authenticated,service_role;

create function public.wedding_party_state(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare gid uuid; promotion jsonb;
begin
 gid=wedding_party_private.actor(p_event);
 if gid is null then return jsonb_build_object('promotion',null);end if;
 select jsonb_build_object('cycle_id',p.cycle_id,'guest_id',p.guest_id,'role',p.role,'accepted_at',p.accepted_at,'completed_at',p.completed_at)
 into promotion from wedding_party_private.promotions p where p.event_id=p_event and p.guest_id=gid and p.active;
 if promotion is null then return jsonb_build_object('promotion',null);end if;
 return jsonb_build_object('promotion',promotion,'message','Obrigado por fazer parte deste capítulo da nossa história! Ter você ao nosso lado torna esse momento ainda mais especial. 💙');
end $$;
revoke all on function public.wedding_party_state(uuid) from public,anon,service_role;
grant execute on function public.wedding_party_state(uuid) to authenticated;

create function public.wedding_party_admin_get(p_event uuid,p_guest uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if not exists(select 1 from public.guests where event_id=p_event and id=p_guest) then raise exception 'guest unavailable';end if;
 select jsonb_build_object('cycle_id',cycle_id,'guest_id',guest_id,'role',role,'accepted_at',accepted_at,'completed_at',completed_at) into result from wedding_party_private.promotions where event_id=p_event and guest_id=p_guest and active;
 return result;
end $$;
revoke all on function public.wedding_party_admin_get(uuid,uuid) from public,anon,service_role;
grant execute on function public.wedding_party_admin_get(uuid,uuid) to authenticated;

create function public.wedding_party_admin_set(p_event uuid,p_guest uuid,p_role text,p_expected_cycle uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare current_cycle uuid; existing_party_role text;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if p_role is not null and p_role not in ('PADRINHO','MADRINHA') then raise exception 'invalid party role';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 perform 1 from public.guests where event_id=p_event and id=p_guest for update;
 if not found then raise exception 'guest unavailable';end if;
 select cycle_id,role into current_cycle,existing_party_role from wedding_party_private.promotions where event_id=p_event and guest_id=p_guest and active for update;
 if current_cycle is distinct from p_expected_cycle then raise exception 'promotion changed; refresh';end if;
 if existing_party_role is not distinct from p_role then return public.wedding_party_admin_get(p_event,p_guest);end if;
 update wedding_party_private.promotions set active=false,revoked_at=clock_timestamp() where event_id=p_event and guest_id=p_guest and active;
 if p_role is not null then insert into wedding_party_private.promotions(event_id,guest_id,role) values(p_event,p_guest,p_role);end if;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),case when p_role is null then 'WEDDING_PARTY_REVOKE' else 'WEDDING_PARTY_PROMOTE' end,'guests',p_guest);
 return public.wedding_party_admin_get(p_event,p_guest);
end $$;
revoke all on function public.wedding_party_admin_set(uuid,uuid,text,uuid) from public,anon,service_role;
grant execute on function public.wedding_party_admin_set(uuid,uuid,text,uuid) to authenticated;

create function public.wedding_party_respond(p_event uuid,p_cycle uuid,p_action text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare gid uuid; promotion wedding_party_private.promotions;
begin
 if p_action is null or p_action not in ('ACCEPT','COMPLETE') then raise exception 'invalid party action';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 gid=wedding_party_private.actor(p_event);
 if gid is null then raise exception 'unauthorized';end if;
 select * into promotion from wedding_party_private.promotions where event_id=p_event and guest_id=gid and cycle_id=p_cycle and active for update;
 if not found then raise exception 'unauthorized';end if;
 if p_action='ACCEPT' then
  update wedding_party_private.promotions set accepted_at=coalesce(accepted_at,clock_timestamp()) where cycle_id=p_cycle;
 else
  if promotion.accepted_at is null then raise exception 'acceptance required';end if;
  update wedding_party_private.promotions set completed_at=coalesce(completed_at,clock_timestamp()) where cycle_id=p_cycle;
 end if;
 return public.wedding_party_state(p_event);
end $$;
revoke all on function public.wedding_party_respond(uuid,uuid,text) from public,anon,service_role;
grant execute on function public.wedding_party_respond(uuid,uuid,text) to authenticated;
notify pgrst, 'reload schema';
commit;
