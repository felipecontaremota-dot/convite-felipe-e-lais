begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
DO $$begin
 if current_setting('server_version_num')::int>=170000 then
  perform set_config('transaction_timeout','30s',true);
 end if;
end $$;

-- Add a read-only role projection; preserve signature, OID, ACL and audit data.
-- Aggregate matching roles so repeated links cannot multiply history records.
-- Missing or conflicting roles remain NULL; the UI uses its unknown label.
create or replace function ceremonial_private.checkin_history(p_event uuid) returns jsonb
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
 ) select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('actor_role',
   (select case when count(distinct r.role)=1 then min(r.role::text) else null end
    from public.user_roles r where r.event_id=p_event and r.user_id::text=e.actor_id))
   order by e.created_at desc,e.id),'[]'::jsonb) from events e;
$$;

commit;
