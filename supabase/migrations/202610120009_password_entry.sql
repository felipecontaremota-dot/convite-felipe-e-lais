-- Password-only public entry. Existing codes, PINs, grants and link RPCs stay intact.
-- Requires the access contracts from 003/004, independently of profile migration 008.
create function redeem_invitation_password(p_event uuid,p_user uuid,p_pin text,p_bucket text)
returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare ids uuid[]; target invitations;
begin
 if p_user is null or p_bucket is null or not exists(select 1 from auth.users where id=p_user and is_anonymous)
 or exists(select 1 from user_roles where event_id=p_event and user_id=p_user) then return false;end if;
 -- Reuse atomic global/IP/user limits. The code bucket is per user, not a global
 -- constant or per guessed PIN; changing the guess cannot bypass the IP limit.
 if not invitation_attempt_allowed(p_event,p_user,'password-entry:'||p_user,'password-entry:'||p_bucket)
 or p_pin is null or p_pin !~ '^[0-9]{4}$' then return false;end if;
 select array_agg(id) into ids from (
  select i.id from invitations i join invitation_access a on a.invitation_id=i.id and a.event_id=i.event_id
  where i.event_id=p_event and i.active and i.archived_at is null and i.code_hash is not null and a.pin=p_pin limit 2
 ) matches;
 -- Never select a family arbitrarily when legacy PINs collide.
 if coalesce(cardinality(ids),0)<>1 then return false;end if;
 select inv.* into target from invitations inv join invitation_access a on a.invitation_id=inv.id and a.event_id=inv.event_id
 where inv.id=ids[1] and inv.event_id=p_event and inv.active and inv.archived_at is null
 and inv.code_hash is not null and a.pin=p_pin for update of inv,a;
 if not found then return false;end if;
 insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values(p_event,p_user,target.id,now())
 on conflict(event_id,user_id) do update set invitation_id=excluded.invitation_id,pin_verified_at=now();
 update invitations set first_activated_at=coalesce(first_activated_at,now()) where id=target.id;
 insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,p_user,'ACTIVATION','invitations',target.id);
 return true;
end $$;
revoke all on function redeem_invitation_password(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function redeem_invitation_password(uuid,uuid,text,text) to service_role;
