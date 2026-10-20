begin;
set local lock_timeout='5s';
-- Optional treatment only. Existing cycles/messages/timestamps remain intact; no nickname backfill.
alter table wedding_party_private.promotions add column display_name text check(display_name is null or char_length(display_name)<=100);
create or replace function public.wedding_party_state(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare gid uuid; promotion jsonb;
begin
 gid=wedding_party_private.actor(p_event);
 if gid is null then return jsonb_build_object('promotion',null);end if;
 select jsonb_build_object('cycle_id',p.cycle_id,'guest_id',p.guest_id,'role',p.role,'accepted_at',p.accepted_at,'completed_at',p.completed_at,'personal_message',p.personal_message,'display_name',p.display_name)
 into promotion from wedding_party_private.promotions p where p.event_id=p_event and p.guest_id=gid and p.active;
 if promotion is null then return jsonb_build_object('promotion',null);end if;
 return jsonb_build_object('promotion',promotion,'message','Obrigado por fazer parte deste capítulo da nossa história! Ter você ao nosso lado torna esse momento ainda mais especial. 💙');
end $$;
revoke all on function public.wedding_party_state(uuid) from public,anon,service_role;
grant execute on function public.wedding_party_state(uuid) to authenticated;

create or replace function public.wedding_party_admin_get(p_event uuid,p_guest uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if not exists(select 1 from public.guests where event_id=p_event and id=p_guest) then raise exception 'guest unavailable';end if;
 select jsonb_build_object('cycle_id',cycle_id,'guest_id',guest_id,'role',role,'accepted_at',accepted_at,'completed_at',completed_at,'personal_message',personal_message,'display_name',display_name) into result from wedding_party_private.promotions where event_id=p_event and guest_id=p_guest and active;
 return result;
end $$;
revoke all on function public.wedding_party_admin_get(uuid,uuid) from public,anon,service_role;
grant execute on function public.wedding_party_admin_get(uuid,uuid) to authenticated;



-- Keep the previous message-only RPC compatible. The new endpoint edits both atomically.
create function public.wedding_party_admin_save_details(p_event uuid,p_guest uuid,p_role text,p_expected_cycle uuid,p_message text,p_expected_message text,p_display_name text,p_expected_display_name text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare current_p jsonb; saved jsonb; nickname text;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 nickname=nullif(btrim(p_display_name),'');
 if nickname is not null and (char_length(nickname)>100 or nickname ~ '[\n\r\t]') then raise exception 'invalid treatment name';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 current_p=public.wedding_party_admin_get(p_event,p_guest);
 if current_p->>'display_name' is distinct from p_expected_display_name then raise exception 'promotion changed; refresh';end if;
 if current_p is not null and current_p->>'cycle_id'=p_expected_cycle::text
    and current_p->>'role'=p_role and current_p->>'personal_message' is null
    and p_expected_message is null and nullif(p_message,'') is null then
  -- Legacy promotions may have no message yet. A nickname-only edit must preserve NULL.
  saved=current_p;
  insert into public.audit_logs(event_id,actor,action,entity,entity_id)
   values(p_event,auth.uid(),'WEDDING_PARTY_TREATMENT_UPDATE','guests',p_guest);
 else
  saved=public.wedding_party_admin_save(p_event,p_guest,p_role,p_expected_cycle,p_message,p_expected_message);
 end if;
 update wedding_party_private.promotions set display_name=nickname where cycle_id=(saved->>'cycle_id')::uuid and active;
 return public.wedding_party_admin_get(p_event,p_guest);
end $$;
revoke all on function public.wedding_party_admin_save_details(uuid,uuid,text,uuid,text,text,text,text) from public,anon,service_role;
grant execute on function public.wedding_party_admin_save_details(uuid,uuid,text,uuid,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
