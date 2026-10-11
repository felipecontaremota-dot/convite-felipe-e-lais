-- Optional explicit form of address; never inferred from a person's name.
-- Existing rows remain NULL and use the safe greeting fallback.
alter table public.guests add column greeting_form text
 constraint guests_greeting_form_check check (greeting_form in ('MASCULINE','FEMININE'));

-- Preserve the complete 001-006 administrative implementation behind a private
-- base function. The public wrapper only validates/persists greeting_form for
-- the existing GUEST_CREATE/GUEST_UPDATE actions.
alter function public.admin_action(uuid,text,jsonb) rename to admin_action_home_base;
revoke all on function public.admin_action_home_base(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.admin_action(p_event uuid,p_action text,p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_temp
as $$
declare
 result jsonb;
 form text;
 guest_id uuid;
begin
 if p_action in ('GUEST_CREATE','GUEST_UPDATE') then
  form=nullif(p_payload->>'greeting_form','');
  if form is not null and form not in ('MASCULINE','FEMININE') then
   raise exception 'invalid greeting form';
  end if;
 end if;

 result=admin_action_home_base(p_event,p_action,p_payload);

 if p_action in ('GUEST_CREATE','GUEST_UPDATE') then
  guest_id=(result->>'id')::uuid;
  update guests
   set greeting_form=form
   where event_id=p_event and id=guest_id;
 end if;

 return result;
end
$$;

revoke all on function public.admin_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_action(uuid,text,jsonb) to authenticated;
