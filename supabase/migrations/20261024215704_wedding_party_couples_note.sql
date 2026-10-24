begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
DO $$begin
 if current_setting('server_version_num')::int>=170000 then
  perform set_config('transaction_timeout','30s',true);
 end if;
end $$;
-- Optional independent note; existing letters, cycles and acceptance remain unchanged.
alter table wedding_party_private.promotions add column couples_note text
 check(couples_note is null or char_length(couples_note)<=12000);
create or replace function public.wedding_party_state(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare gid uuid; promotion jsonb;
begin
 gid=wedding_party_private.actor(p_event);
 if gid is null then return jsonb_build_object('promotion',null);end if;
 select jsonb_build_object('cycle_id',p.cycle_id,'guest_id',p.guest_id,'role',p.role,'accepted_at',p.accepted_at,'completed_at',p.completed_at,'personal_message',p.personal_message,'display_name',p.display_name,'couples_note',p.couples_note)
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
 select jsonb_build_object('cycle_id',cycle_id,'guest_id',guest_id,'role',role,'accepted_at',accepted_at,'completed_at',completed_at,'personal_message',personal_message,'display_name',display_name,'couples_note',couples_note) into result from wedding_party_private.promotions where event_id=p_event and guest_id=p_guest and active;
 return result;
end $$;
revoke all on function public.wedding_party_admin_get(uuid,uuid) from public,anon,service_role;
grant execute on function public.wedding_party_admin_get(uuid,uuid) to authenticated;




-- Retain the older RPC contracts; serialize edits with their existing event lock.
create function public.wedding_party_admin_save_content(
 p_event uuid,p_guest uuid,p_role text,p_expected_cycle uuid,
 p_message text,p_expected_message text,p_display_name text,p_expected_display_name text,
 p_note text,p_expected_note text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare current_p jsonb; saved jsonb; note text;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if char_length(p_note)>12000 then raise exception 'invalid couples note';end if;
 note=case when p_note ~ '[^[:space:]]' then p_note else null end;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 current_p=public.wedding_party_admin_get(p_event,p_guest);
 if current_p->>'couples_note' is distinct from p_expected_note then raise exception 'promotion changed; refresh';end if;
 saved=public.wedding_party_admin_save_details(p_event,p_guest,p_role,p_expected_cycle,p_message,p_expected_message,p_display_name,p_expected_display_name);
 update wedding_party_private.promotions set couples_note=note
  where event_id=p_event and guest_id=p_guest and cycle_id=(saved->>'cycle_id')::uuid and active;
 if not found then raise exception 'promotion changed; refresh';end if;
 if current_p->>'couples_note' is distinct from note then
  insert into public.audit_logs(event_id,actor,action,entity,entity_id)
   values(p_event,auth.uid(),'WEDDING_PARTY_NOTE_UPDATE','guests',p_guest);
 end if;
 return public.wedding_party_admin_get(p_event,p_guest);
end $$;
revoke all on function public.wedding_party_admin_save_content(uuid,uuid,text,uuid,text,text,text,text,text,text) from public,anon,service_role;
grant execute on function public.wedding_party_admin_save_content(uuid,uuid,text,uuid,text,text,text,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
