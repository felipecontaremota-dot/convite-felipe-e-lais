begin;

-- Individual administrative truth, distinct from a family's historical sent_at.
create table public.guest_invitation_status (
 event_id uuid not null, guest_id uuid not null, sent boolean not null default false,
 source text not null check(source in ('MANUAL','EMAIL')),
 updated_by uuid, updated_at timestamptz not null default clock_timestamp(),
 primary key(event_id,guest_id),
 foreign key(event_id,guest_id) references public.guests(event_id,id) on delete cascade
);
alter table public.guest_invitation_status enable row level security;
revoke all on public.guest_invitation_status from public,anon,authenticated,service_role;
grant select on public.guest_invitation_status to authenticated;
create policy admin_read on public.guest_invitation_status for select to authenticated
 using (public.event_role(event_id)='ADMIN');

-- Only exact recipients recorded in successful delivery receipts are evidence.
-- Never infer delivery from family membership, activation, copying, or RSVP.
insert into public.guest_invitation_status(event_id,guest_id,sent,source,updated_at)
select d.event_id,g.id,true,'EMAIL',max(d.sent_at)
from public.invitation_deliveries d
join public.guests g on g.event_id=d.event_id and
 (g.id=d.guest_id or exists(select 1 from public.invitation_delivery_members m
   where m.event_id=d.event_id and m.delivery_id=d.id and m.guest_id=g.id))
where d.status='sent' and d.sent_at is not null
group by d.event_id,g.id;

create function public.record_guest_invitation_delivery(p_delivery uuid,p_guest uuid default null)
returns void language sql security definer set search_path=pg_catalog as $$
 insert into public.guest_invitation_status(event_id,guest_id,sent,source,updated_at)
 select d.event_id,g.id,true,'EMAIL',clock_timestamp()
 from public.invitation_deliveries d join public.guests g on g.event_id=d.event_id
 where d.id=p_delivery and d.status='sent' and d.sent_at is not null
 and (p_guest is null or g.id=p_guest)
 and (g.id=d.guest_id or exists(select 1 from public.invitation_delivery_members m
   where m.event_id=d.event_id and m.delivery_id=d.id and m.guest_id=g.id))
 on conflict(event_id,guest_id) do update set sent=true,source='EMAIL',updated_by=null,updated_at=excluded.updated_at;
$$;
revoke all on function public.record_guest_invitation_delivery(uuid,uuid) from public,anon,authenticated,service_role;
create function public.track_guest_invitation_delivery() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if TG_TABLE_NAME='invitation_delivery_members' then
  perform public.record_guest_invitation_delivery(new.delivery_id,new.guest_id);
 elsif new.status='sent' and new.sent_at is not null then
  if TG_OP='INSERT' then perform public.record_guest_invitation_delivery(new.id);
  elsif old.status is distinct from 'sent' then perform public.record_guest_invitation_delivery(new.id);end if;
 end if;
 return new;
end $$;
revoke all on function public.track_guest_invitation_delivery() from public,anon,authenticated,service_role;
create trigger guest_sending_receipt after insert or update of status on public.invitation_deliveries
 for each row execute function public.track_guest_invitation_delivery();
create trigger guest_sending_member after insert on public.invitation_delivery_members
 for each row execute function public.track_guest_invitation_delivery();

-- Copy existing wrappers without renaming their OIDs or breaking callers.
DO $$begin
 execute replace(pg_get_functiondef('public.admin_action(uuid,text,jsonb)'::regprocedure),
   'FUNCTION public.admin_action(', 'FUNCTION public.guest_admin_action_core(');
 execute replace(pg_get_functiondef('public.app_snapshot(uuid)'::regprocedure),
   'FUNCTION public.app_snapshot(', 'FUNCTION public.guest_admin_snapshot_core(');
end $$;
revoke all on function public.guest_admin_action_core(uuid,text,jsonb),public.guest_admin_snapshot_core(uuid) from public,anon,authenticated,service_role;

create or replace function public.admin_action(p_event uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare gid uuid; previous public.rsvps; prior text; next_status text; was_sent boolean;
begin
 if p_action not in ('GUEST_INVITATION_SENT_SET','GUEST_RSVP_SET') or p_action is null then
  return public.guest_admin_action_core(p_event,p_action,p_payload);
 end if;
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event::text,0));
 gid=(p_payload->>'id')::uuid;
 if not exists(select 1 from public.guests where event_id=p_event and id=gid) then raise exception 'invalid guest';end if;
 if p_action='GUEST_INVITATION_SENT_SET' then
  if jsonb_typeof(p_payload->'sent') is distinct from 'boolean' or jsonb_typeof(p_payload->'expected_sent') is distinct from 'boolean' then raise exception 'invalid sending state';end if;
  -- An absent row is the authoritative default false; serialize concurrent insert/update.
  insert into public.guest_invitation_status(event_id,guest_id,sent,source,updated_by)
   values(p_event,gid,false,'MANUAL',auth.uid()) on conflict do nothing;
  select sent into was_sent from public.guest_invitation_status where event_id=p_event and guest_id=gid for update;
  if was_sent=(p_payload->>'sent')::boolean then return jsonb_build_object('ok',true,'unchanged',true,'sent',was_sent);end if;
  if was_sent is distinct from (p_payload->>'expected_sent')::boolean then raise exception 'sending state changed; refresh';end if;
  update public.guest_invitation_status set sent=(p_payload->>'sent')::boolean,source='MANUAL',updated_by=auth.uid(),updated_at=clock_timestamp() where event_id=p_event and guest_id=gid;
  insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata)
   values(p_event,auth.uid(),p_action,'guests',gid,jsonb_build_object('previous',was_sent,'next',(p_payload->>'sent')::boolean));
  return jsonb_build_object('ok',true,'sent',(p_payload->>'sent')::boolean);
 end if;
 next_status=p_payload->>'status';
 if next_status is null or next_status not in ('PENDING','CONFIRMED','DECLINED','MAYBE') then raise exception 'invalid RSVP';end if;
 select * into previous from public.rsvps where event_id=p_event and guest_id=gid for update;
 if not found then raise exception 'RSVP missing';end if;
 prior=case when previous.status='PENDING' and previous.responded_at is not null then 'MAYBE' else previous.status::text end;
 if prior=next_status then return jsonb_build_object('ok',true,'unchanged',true);end if;
 if not (p_payload ? 'expected_status' and p_payload ? 'expected_responded_at')
 or previous.status::text is distinct from p_payload->>'expected_status'
 or previous.responded_at is distinct from (p_payload->>'expected_responded_at')::timestamptz then raise exception 'RSVP changed; refresh';end if;
 update public.rsvps set status=(case when next_status='MAYBE' then 'PENDING' else next_status end)::public.rsvp_status,
  responded_at=case when next_status='PENDING' then null else clock_timestamp() end,source='ADMIN'
 where event_id=p_event and guest_id=gid;
 -- Match the guest flow's existing ticket revocation; do not issue new tickets.
 if next_status<>'CONFIRMED' then update public.qr_credentials set revoked_at=clock_timestamp() where event_id=p_event and guest_id=gid and revoked_at is null;end if;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata)
 values(p_event,auth.uid(),p_action,'guests',gid,jsonb_build_object('previous',prior,'next',next_status));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.admin_action(uuid,text,jsonb) from public,anon;
grant execute on function public.admin_action(uuid,text,jsonb) to authenticated,service_role;

create or replace function public.app_snapshot(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 result=public.guest_admin_snapshot_core(p_event);
 if auth.uid() is not null and public.event_role(p_event)='ADMIN' then
  result=result||jsonb_build_object('guests',(select coalesce(jsonb_agg(g.value||jsonb_build_object('invitation_sent',coalesce(s.sent,false)) order by g.ordinality),'[]'::jsonb)
   from jsonb_array_elements(result->'guests') with ordinality g(value,ordinality)
   left join public.guest_invitation_status s on s.event_id=p_event and s.guest_id=(g.value->>'id')::uuid));
  result=jsonb_set(result,'{capabilities}',coalesce(result->'capabilities','{}'::jsonb)||jsonb_build_object('admin_guest_controls',true));
 end if;
 return result;
end $$;
revoke all on function public.app_snapshot(uuid) from public,anon;
grant execute on function public.app_snapshot(uuid) to authenticated,service_role;
commit;
