begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';
-- Keep the existing active-checkins model and its unique constraints. Audit is
-- the append-only history; no parallel check-in or authentication table.
-- Fail closed if these reviewed RPC bodies have changed since the audit.
DO $$begin
 if current_setting('server_version_num')::integer < 140000 then raise exception 'PostgreSQL 14+ required';end if;
 -- PostgreSQL 17 adds a transaction-wide cap, in addition to per-statement limits.
 if current_setting('server_version_num')::integer >= 170000 then perform set_config('transaction_timeout','30s',true);end if;
 if md5((select prosrc from pg_proc where oid='public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure)) is distinct from '87ec5c5ffca7b6f0f43647f38817f21d'
 or md5((select prosrc from pg_proc where oid='public.app_snapshot(uuid)'::regprocedure)) is distinct from '2083e77359fcdbdbd09086182b619104'
 or md5((select prosrc from pg_proc where oid='public.admin_action(uuid,text,jsonb)'::regprocedure)) is distinct from 'd97c6fc03651ace8d28f8eb19e5d6695' then
  raise exception 'Reviewed RPC baseline changed; audit before applying';
 end if;
end $$;
create function ceremonial_private.audit_checkin() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.checkins; guest_name text; context jsonb; details jsonb;
begin
 if tg_op='DELETE' then r=old;else r=new;end if;
 select g.name into guest_name from public.guests g where g.event_id=r.event_id and g.id=r.guest_id;
 if guest_name is null then select a.metadata->>'guest_name' into guest_name from public.audit_logs a where a.event_id=r.event_id and a.entity='checkins' and a.entity_id=r.id and a.metadata ? 'guest_name' order by a.created_at limit 1;end if;
 details=jsonb_build_object('checkin',to_jsonb(r),'guest_name',coalesce(guest_name,'Convidado'));
 -- Transaction-local handoff from the authorized reversal, never a persisted
 -- session value. Match the exact row/actor and a receipt before using it.
 if tg_op='DELETE' then
  context=nullif(current_setting('app.checkin_reversal_context',true),'')::jsonb;
  if context->>'event_id'=r.event_id::text and context->>'checkin_id'=r.id::text and context->>'actor'=auth.uid()::text
   and exists(select 1 from public.mutation_receipts m where m.event_id=r.event_id and m.user_id=auth.uid() and m.mutation_id=(context->>'mutation_id')::uuid) then
   details=details||jsonb_build_object('reversal_mutation_id',context->>'mutation_id');
  end if;
 end if;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata,created_at)
 values(r.event_id,auth.uid(),tg_op,'checkins',r.id,details,clock_timestamp());
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function ceremonial_private.audit_checkin() from public,anon,authenticated,service_role;
create or replace trigger audit after insert or update or delete on public.checkins for each row execute function ceremonial_private.audit_checkin();
create index checkin_audit_history on public.audit_logs(event_id,entity_id,created_at) where entity='checkins';

create unique index checkin_reversal_request on public.audit_logs ((metadata->>'reversal_mutation_id')) where entity='checkins' and action='DELETE' and metadata ? 'reversal_mutation_id';

create function ceremonial_private.revert_checkin(p_event uuid,p_id uuid,p_mutation uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog set lock_timeout='3s' as $$
declare c public.checkins; a public.audit_logs; gid uuid; actor uuid:=auth.uid(); role public.app_role:=public.event_role(p_event); previous_context text;
begin
 if actor is null or role is null or role not in ('ADMIN','CEREMONIALIST') then raise exception 'unauthorized';end if;
 if p_id is null or p_mutation is null then raise exception 'invalid checkin request';end if;
 select * into a from public.audit_logs where event_id=p_event and entity='checkins' and action='DELETE' and metadata ? 'reversal_mutation_id' and metadata->>'reversal_mutation_id'=p_mutation::text;
 if found then
  if a.entity_id<>p_id or a.actor<>actor then raise exception 'checkin request changed';end if;
  return jsonb_build_object('id',p_id,'event_id',p_event,'guest_id',a.metadata#>>'{checkin,guest_id}','removed_at',a.created_at,'removed_by',a.actor,'duplicate',true);
 end if;
 if exists(select 1 from public.mutation_receipts where mutation_id=p_mutation) then raise exception 'checkin request already used';end if;
 select guest_id into gid from public.checkins where event_id=p_event and id=p_id;
 if gid is null then select (metadata#>>'{checkin,guest_id}')::uuid into gid from public.audit_logs where event_id=p_event and entity='checkins' and entity_id=p_id and action='DELETE' and metadata ? 'checkin' order by created_at desc limit 1;end if;
 if gid is null then raise exception 'invalid checkin guest';end if;
 -- Same lock as registration. A stale removal targets this original ID only,
 -- never an entry subsequently registered for the same person.
 perform 1 from public.guests where event_id=p_event and id=gid for update;
 if not found then raise exception 'invalid checkin guest';end if;
 select * into c from public.checkins where event_id=p_event and id=p_id;
 if not found then
  select * into a from public.audit_logs where event_id=p_event and entity='checkins' and entity_id=p_id and action='DELETE' and metadata ? 'checkin' order by created_at desc limit 1;
  if not found then raise exception 'invalid checkin guest';end if;
  return jsonb_build_object('id',p_id,'event_id',p_event,'guest_id',gid,'removed_at',a.created_at,'removed_by',a.actor,'duplicate',true);
 end if;
 insert into public.mutation_receipts(event_id,user_id,mutation_id) values(p_event,actor,p_mutation) on conflict do nothing;
 if not found then raise exception 'checkin request already used';end if;
 previous_context=current_setting('app.checkin_reversal_context',true);
 perform set_config('app.checkin_reversal_context',jsonb_build_object('event_id',p_event,'checkin_id',p_id,'actor',actor,'mutation_id',p_mutation)::text,true);
 delete from public.checkins where event_id=p_event and id=p_id;
 perform set_config('app.checkin_reversal_context',coalesce(previous_context,''),true);
 -- Audit and sheet triggers run atomically. Metadata is complete at INSERT:
 -- no historical audit row is ever updated. Require this operation's receipt.
 select log.* into strict a from public.audit_logs log
 where log.event_id=p_event and log.entity='checkins' and log.entity_id=p_id and log.action='DELETE' and log.actor=auth.uid()
 and log.metadata ? 'reversal_mutation_id' and log.metadata->>'reversal_mutation_id'=p_mutation::text;
 return jsonb_build_object('id',p_id,'event_id',p_event,'guest_id',gid,'removed_at',a.created_at,'removed_by',actor,'duplicate',false);
end $$;
revoke all on function ceremonial_private.revert_checkin(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create function ceremonial_private.checkin_history(p_event uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 with source as (
  select a.entity_id id,a.metadata->'checkin' c,a.metadata->>'guest_name' name,
   case when a.action='INSERT' then 0 else 1 end priority,
   case when a.action='INSERT' then a.created_at else (a.metadata#>>'{checkin,created_at}')::timestamptz end stamp
  from public.audit_logs a where a.event_id=p_event and a.entity='checkins' and a.action in ('INSERT','DELETE') and a.metadata ? 'checkin'
  union all select c.id,to_jsonb(c),g.name,2,c.created_at from public.checkins c join public.guests g on g.id=c.guest_id and g.event_id=c.event_id where c.event_id=p_event
 ), originals as (select distinct on(id) * from source order by id,priority,stamp), events as (
  select id::text||':entry' id,id checkin_id,c->>'guest_id' guest_id,name guest_name,'ENTRY' action,stamp created_at,c->>'actor_id' actor_id,c->>'method' method from originals
  union all
  select a.id::text,a.entity_id,a.metadata#>>'{checkin,guest_id}',a.metadata->>'guest_name','REMOVAL',a.created_at,a.actor::text,a.metadata#>>'{checkin,method}'
  from public.audit_logs a where a.event_id=p_event and a.entity='checkins' and a.action='DELETE' and a.metadata ? 'checkin'
 ) select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]'::jsonb) from events e;
$$;
revoke all on function ceremonial_private.checkin_history(uuid) from public,anon,authenticated,service_role;

DO $$begin
 execute replace(pg_get_functiondef('public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure),'FUNCTION public.app_mutate(', 'FUNCTION ceremonial_private.mutate_before_reversal(');
 execute replace(pg_get_functiondef('public.app_snapshot(uuid)'::regprocedure),'FUNCTION public.app_snapshot(', 'FUNCTION ceremonial_private.snapshot_before_reversal(');
 execute replace(pg_get_functiondef('public.admin_action(uuid,text,jsonb)'::regprocedure),'FUNCTION public.admin_action(', 'FUNCTION ceremonial_private.admin_before_reversal(');
end $$;
revoke all on function ceremonial_private.mutate_before_reversal(uuid,uuid,text,jsonb),ceremonial_private.snapshot_before_reversal(uuid),ceremonial_private.admin_before_reversal(uuid,text,jsonb) from public,anon,authenticated,service_role;
create or replace function public.app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$begin
 if p_type='CHECKIN_REVERT' then return ceremonial_private.revert_checkin(p_event,(p_payload->>'id')::uuid,p_mutation);end if;
 return ceremonial_private.mutate_before_reversal(p_event,p_mutation,p_type,p_payload);
end $$;
create or replace function public.app_snapshot(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$declare s jsonb;begin
 s=ceremonial_private.snapshot_before_reversal(p_event);
 if auth.uid() is not null and public.event_role(p_event) in ('ADMIN','CEREMONIALIST') then
  s=s||jsonb_build_object('checkin_history',ceremonial_private.checkin_history(p_event));
 end if;return s;
end $$;
create or replace function public.admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$begin
 if p_action='CHECKIN_REVERT' then
  if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
  return ceremonial_private.revert_checkin(p_event,(p_payload->>'id')::uuid,gen_random_uuid());
 end if;return ceremonial_private.admin_before_reversal(p_event,p_action,p_payload);
end $$;
-- CREATE OR REPLACE preserves existing public RPC OIDs and ACLs; no public grants/revocations.
notify pgrst,'reload schema';
commit;
