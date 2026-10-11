-- Preserve channel authorizations while applying a durable global opt-out.
alter table guest_contacts add column communications_revoked boolean not null default false;

alter function app_mutate(uuid,uuid,text,jsonb) rename to app_mutate_v7;
revoke all on function app_mutate_v7(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role app_role:=event_role(p_event); gid uuid; previous guest_contacts; revoked boolean; payload jsonb:=p_payload;
begin
 if p_type is distinct from 'CONTACT_UPDATE' and p_type is distinct from 'PUSH_REGISTER' then return app_mutate_v7(p_event,p_mutation,p_type,p_payload);end if;
 if role is null or role not in ('ADMIN','GUEST') then raise exception 'unauthorized';end if;
 insert into mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then return jsonb_build_object('duplicate',true);end if;
 gid=(p_payload->>'guest_id')::uuid;
 -- Serialize all contact updates and push registration for the same member.
 perform 1 from guests where id=gid and event_id=p_event for update;
 if not found then raise exception 'invalid guest';end if;
 if role='GUEST' and not owns_guest(p_event,gid) then raise exception 'unauthorized';end if;
 select * into previous from guest_contacts where event_id=p_event and guest_id=gid;
 if p_type='CONTACT_UPDATE' then
  revoked=coalesce(previous.communications_revoked,false);
  if p_payload ? 'communications_revoked' then
   if jsonb_typeof(p_payload->'communications_revoked') <> 'boolean' then raise exception 'invalid revocation';end if;
   revoked=(p_payload->>'communications_revoked')::boolean;
  end if;
  if p_payload ? 'communications_revoked' or coalesce(previous.communications_revoked,false) then
   -- The new Profile controls only the global gate, never authorizations.
   -- Restore from the database, not a stale or manipulated client snapshot.
   payload=payload||jsonb_build_object(
    'consent_in_app',coalesce(previous.consent_in_app,true),
    'consent_push',coalesce(previous.consent_push,false),
    'consent_email',coalesce(previous.consent_email,false),
    'consent_whatsapp',coalesce(previous.consent_whatsapp,false));
  end if;
  if length(coalesce(payload->>'email',''))>320 or length(coalesce(payload->>'whatsapp',''))>30 then raise exception 'invalid contact';end if;
  insert into guest_contacts(event_id,guest_id,email,whatsapp,consent_in_app,consent_push,consent_email,consent_whatsapp,communications_revoked)
  values(p_event,gid,coalesce(payload->>'email',''),regexp_replace(coalesce(payload->>'whatsapp',''),'[^0-9]','','g'),coalesce((payload->>'consent_in_app')::boolean,false),coalesce((payload->>'consent_push')::boolean,false),coalesce((payload->>'consent_email')::boolean,false),coalesce((payload->>'consent_whatsapp')::boolean,false),revoked)
  on conflict(guest_id) do update set email=excluded.email,whatsapp=excluded.whatsapp,consent_in_app=excluded.consent_in_app,consent_push=excluded.consent_push,consent_email=excluded.consent_email,consent_whatsapp=excluded.consent_whatsapp,communications_revoked=excluded.communications_revoked,consent_changed_at=now();
  if revoked or not coalesce((payload->>'consent_push')::boolean,false) then update device_push_tokens set active=false where event_id=p_event and guest_id=gid;end if;
 else
  if not coalesce(previous.consent_push,false) or coalesce(previous.communications_revoked,false) or p_payload->>'token' !~ '^(ExponentPushToken|ExpoPushToken)\[.{1,200}\]$' then raise exception 'push not allowed';end if;
  insert into device_push_tokens(event_id,guest_id,user_id,token,platform) values(p_event,gid,auth.uid(),p_payload->>'token',p_payload->>'platform') on conflict(event_id,user_id,guest_id,token) do update set active=true;
 end if;
 return jsonb_build_object('ok',true,'id',null);
end $$;
revoke all on function app_mutate(uuid,uuid,text,jsonb) from public,anon;
grant execute on function app_mutate(uuid,uuid,text,jsonb) to authenticated;

create or replace function can_read_message(p_event uuid,p_message uuid) returns boolean
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select exists(select 1 from messages m where m.event_id=p_event and m.id=p_message and (
   event_role(p_event)='ADMIN' or
   event_role(p_event)='GUEST' and m.channels @> '{IN_APP}'::delivery_channel[] and (
     m.from_admin and exists(
       select 1 from message_recipients r
       left join guest_contacts c on c.event_id=r.event_id and c.guest_id=r.guest_id
       where r.event_id=p_event and r.message_id=m.id and owns_guest(p_event,r.guest_id)
         and coalesce(c.consent_in_app,true) and not coalesce(c.communications_revoked,false)
     ) or
     not m.from_admin and m.invitation_id=my_invitation(p_event)
   )
 ));
$$;

-- Share the guest access rule between direct Data API reads and snapshots.
-- SECURITY DEFINER avoids evaluating this through unrelated table RLS.
create function can_receive_announcements(p_event uuid) returns boolean
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select event_role(p_event)='GUEST' and exists(
   select 1 from guests g left join guest_contacts c on c.event_id=g.event_id and c.guest_id=g.id
   where g.event_id=p_event and owns_guest(p_event,g.id)
     and coalesce(c.consent_in_app,true) and not coalesce(c.communications_revoked,false)
 );
$$;
revoke all on function can_receive_announcements(uuid) from public,anon;
grant execute on function can_receive_announcements(uuid) to authenticated;
alter policy announcement_read on announcements using(can_receive_announcements(event_id));
-- The separate admin_read policy remains unchanged.

-- General IN_APP notices remain visible to authorized members of a shared
-- access unit. With no authorized member, direct reads and snapshots agree.
alter function app_snapshot(uuid) rename to app_snapshot_v7;
revoke all on function app_snapshot_v7(uuid) from public,anon,authenticated,service_role;
create function app_snapshot(p_event uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb;
begin
 result=app_snapshot_v7(p_event);
 if event_role(p_event)='GUEST' and not can_receive_announcements(p_event) then
   result=result||jsonb_build_object('announcements','[]'::jsonb);
 end if;
 return result;
end $$;
revoke all on function app_snapshot(uuid) from public,anon;
grant execute on function app_snapshot(uuid) to authenticated;
