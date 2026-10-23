begin;
-- Existing RPC OIDs and existing role/check-in/guest tables are preserved.
create schema ceremonial_private;
revoke all on schema ceremonial_private from public,anon,authenticated,service_role;
DO $$begin
 execute replace(pg_get_functiondef('public.app_snapshot(uuid)'::regprocedure),
   'FUNCTION public.app_snapshot(', 'FUNCTION ceremonial_private.snapshot_core(');
 execute replace(pg_get_functiondef('public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure),
   'FUNCTION public.app_mutate(', 'FUNCTION ceremonial_private.mutate_core(');
end $$;
revoke all on all functions in schema ceremonial_private from public,anon,authenticated,service_role;

create or replace function public.app_snapshot(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor_role public.app_role:=public.event_role(p_event); result jsonb;
begin
 if actor_role='CEREMONIALIST' and auth.uid() is not null then
  -- A purpose-specific projection: no contacts, finances, credentials, invitation
  -- secrets, delivery histories, messages or private wedding-party letters.
  select jsonb_build_object('role',actor_role,'event',to_jsonb(e)) into result
   from public.events e where e.id=p_event;
  if result is null then raise exception 'unauthorized';end if;
  result=result||jsonb_build_object(
   'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'event_id',i.event_id,'name',i.name,'active',i.active,'kind',i.kind,'version',i.version)),'[]'::jsonb) from public.invitations i where i.event_id=p_event and i.active and i.archived_at is null),
   'guests',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'event_id',g.event_id,'invitation_id',g.invitation_id,'name',g.name,'group_label',g.group_label,'version',g.version,'is_child',g.is_child,'is_adolescent',g.is_adolescent,'admin_notes',coalesce(d.notes,''),'party_role',p.role) order by g.name),'[]'::jsonb)
    from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id
    left join public.guest_admin_details d on d.event_id=g.event_id and d.guest_id=g.id
    left join wedding_party_private.promotions p on p.event_id=g.event_id and p.guest_id=g.id and p.active
    where g.event_id=p_event and i.active and i.archived_at is null),
   'rsvps',(select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from public.rsvps r join public.guests g on g.id=r.guest_id and g.event_id=r.event_id join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id where r.event_id=p_event and i.active and i.archived_at is null),
   'checkins',(select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]'::jsonb) from public.checkins c where c.event_id=p_event),
   'contacts','[]'::jsonb,'gifts','[]'::jsonb,'gift_selections','[]'::jsonb,'messages','[]'::jsonb,'announcements','[]'::jsonb,'rules','[]'::jsonb,'credentials','[]'::jsonb,'notification_jobs','[]'::jsonb,'sheet_jobs','[]'::jsonb,'notification_schedules','[]'::jsonb,'invitation_deliveries','[]'::jsonb,
   'capabilities',jsonb_build_object('ceremonial_portal',true));
  return result;
 end if;
 result=ceremonial_private.snapshot_core(p_event);
 if actor_role='ADMIN' and auth.uid() is not null then
  result=jsonb_set(result,'{guests}',(select coalesce(jsonb_agg(g.value||jsonb_build_object('party_role',p.role) order by g.ordinality),'[]'::jsonb)
    from jsonb_array_elements(result->'guests') with ordinality g(value,ordinality)
    left join wedding_party_private.promotions p on p.event_id=p_event and p.guest_id=(g.value->>'id')::uuid and p.active));
  result=jsonb_set(result,'{capabilities}',coalesce(result->'capabilities','{}'::jsonb)||jsonb_build_object('ceremonial_portal',true));
 end if;
 return result;
end $$;
revoke all on function public.app_snapshot(uuid) from public,anon;
grant execute on function public.app_snapshot(uuid) to authenticated,service_role;

create or replace function public.app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare actor_role public.app_role; gid uuid; qr_guest uuid; method text; prior public.checkins; saved public.checkins;
begin
 if p_type is distinct from 'CHECKIN_CREATE' then
  return ceremonial_private.mutate_core(p_event,p_mutation,p_type,p_payload);
 end if;
 actor_role=public.event_role(p_event);
 if auth.uid() is null or actor_role is null or actor_role not in ('ADMIN','CEREMONIALIST') then raise exception 'unauthorized';end if;
 if p_mutation is null then raise exception 'invalid checkin request';end if;
 method=p_payload->>'method'; gid=(p_payload->>'guest_id')::uuid;
 if method is null or method not in ('QR','MANUAL') then raise exception 'invalid checkin method';end if;
 if method='QR' then
  if p_payload->>'token_hash' is null or p_payload->>'token_hash' !~ '^[a-f0-9]{64}$' then raise exception 'invalid QR';end if;
  select q.guest_id into qr_guest from public.qr_credentials q where q.event_id=p_event and q.token_hash=p_payload->>'token_hash' and q.revoked_at is null;
  if qr_guest is null or (gid is not null and gid<>qr_guest) then raise exception 'invalid QR';end if;
  gid=qr_guest;
 end if;
 -- Serialize manual/QR registration and administrative RSVP transitions on the
 -- same existing guest row. The unique checkins keys remain the final guard.
 perform 1 from public.guests g where g.event_id=p_event and g.id=gid for update;
 if not found then raise exception 'invalid checkin guest';end if;
 if not exists(select 1 from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.id=gid and g.event_id=p_event and i.active and i.archived_at is null) then raise exception 'inactive invitation';end if;
 -- Use the same RSVP -> credential lock order as administrative RSVP edits.
 perform 1 from public.rsvps where event_id=p_event and guest_id=gid for share;
 -- Recheck after locking, including a concurrent revocation while waiting.
 if method='QR' then
  perform 1 from public.qr_credentials q where q.event_id=p_event and q.guest_id=gid and q.token_hash=p_payload->>'token_hash' and q.revoked_at is null for share;
  if not found then raise exception 'invalid QR';end if;
 end if;
 select * into prior from public.checkins where mutation_id=p_mutation;
 if found and (prior.event_id<>p_event or prior.guest_id<>gid or prior.actor_id<>auth.uid() or prior.method<>method) then raise exception 'checkin request changed';end if;
 select * into prior from public.checkins where event_id=p_event and guest_id=gid;
 if found then return to_jsonb(prior)||jsonb_build_object('duplicate',true);end if;
 perform 1 from public.rsvps where event_id=p_event and guest_id=gid and status='CONFIRMED' for share;
 if not found then raise exception 'not confirmed';end if;
 insert into public.mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then raise exception 'checkin request already used';end if;
 insert into public.checkins(event_id,guest_id,mutation_id,method,actor_id) values(p_event,gid,p_mutation,method,auth.uid()) returning * into saved;
 -- Existing checkins audit and sheet-sync triggers run exactly once on insert.
 return to_jsonb(saved)||jsonb_build_object('duplicate',false);
end $$;
revoke all on function public.app_mutate(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.app_mutate(uuid,uuid,text,jsonb) to authenticated,service_role;

-- SELECT only, scoped to an explicitly assigned event role. No client writes.
create policy ceremonial_checkins_read on public.checkins for select to authenticated
 using (public.event_role(event_id)='CEREMONIALIST');
DO $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='checkins') then
  alter publication supabase_realtime add table public.checkins;
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
