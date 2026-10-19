begin;
set local lock_timeout='5s';
alter table wedding_party_private.promotions add column personal_message text
 check(personal_message is null or char_length(personal_message)<=12000);
-- Existing cycles and timestamps remain intact. No fabricated personal messages/backfill.
create or replace function public.wedding_party_state(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare gid uuid; promotion jsonb;
begin
 gid=wedding_party_private.actor(p_event);
 if gid is null then return jsonb_build_object('promotion',null);end if;
 select jsonb_build_object('cycle_id',p.cycle_id,'guest_id',p.guest_id,'role',p.role,'accepted_at',p.accepted_at,'completed_at',p.completed_at,'personal_message',p.personal_message,'display_name',case when exists(
  select 1 from public.guests g where g.event_id=p_event and g.id=gid
  and lower(regexp_replace(btrim(normalize(g.name)),'[[:space:]]+',' ','g'))='amanda curcio cariolano romão medina'
 ) then 'Medina' else null end)
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
 select jsonb_build_object('cycle_id',cycle_id,'guest_id',guest_id,'role',role,'accepted_at',accepted_at,'completed_at',completed_at,'personal_message',personal_message) into result from wedding_party_private.promotions where event_id=p_event and guest_id=p_guest and active;
 return result;
end $$;
revoke all on function public.wedding_party_admin_get(uuid,uuid) from public,anon,service_role;
grant execute on function public.wedding_party_admin_get(uuid,uuid) to authenticated;


-- Atomically promote with a message, or edit a message without recreating the cycle.
create function public.wedding_party_admin_save(p_event uuid,p_guest uuid,p_role text,p_expected_cycle uuid,p_message text,p_expected_message text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare current_p jsonb; saved jsonb;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if p_message is null or not (p_message ~ '[^[:space:]]') or char_length(p_message)>12000 then raise exception 'invalid personal message';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 current_p=public.wedding_party_admin_get(p_event,p_guest);
 if current_p->>'cycle_id' is distinct from p_expected_cycle::text or current_p->>'personal_message' is distinct from p_expected_message then raise exception 'promotion changed; refresh';end if;
 if current_p is not null and current_p->>'role' is distinct from p_role then raise exception 'classification cannot change when editing a message';end if;
 saved=public.wedding_party_admin_set(p_event,p_guest,p_role,p_expected_cycle);
 if saved is null then raise exception 'promotion required';end if;
 update wedding_party_private.promotions set personal_message=p_message where cycle_id=(saved->>'cycle_id')::uuid and active;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'WEDDING_PARTY_MESSAGE_UPDATE','guests',p_guest);
 return public.wedding_party_admin_get(p_event,p_guest);
end $$;
revoke all on function public.wedding_party_admin_save(uuid,uuid,text,uuid,text,text) from public,anon,service_role;
grant execute on function public.wedding_party_admin_save(uuid,uuid,text,uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
