begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Only the excerpt becomes optional. Preserve the existing signature, ACLs,
-- ADMIN/event checks, cycle concurrency, lifecycle and audit operations.
create or replace function public.wedding_party_admin_save(p_event uuid,p_guest uuid,p_role text,p_expected_cycle uuid,p_message text,p_expected_message text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare current_p jsonb; saved jsonb;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if char_length(p_message)>12000 then raise exception 'invalid personal message';end if;
 p_message=case when p_message ~ '[^[:space:]]' then p_message else null end;
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
notify pgrst, 'reload schema';
commit;
