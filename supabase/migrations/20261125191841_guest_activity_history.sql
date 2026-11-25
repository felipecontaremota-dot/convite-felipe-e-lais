begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Reuse the existing append-only audit store and its ADMIN-only SELECT policy.
-- Original historical rows, RSVPs, identities and credentials are never rewritten.
create schema guest_activity_private authorization postgres;
revoke all on schema guest_activity_private from public, anon, authenticated, service_role;
alter table public.invitation_sessions add column activity_access_mode text
 check (activity_access_mode in ('LINK', 'NAME_PIN'));

-- Derived provenance cannot survive a switch to another access unit.
create function guest_activity_private.clear_mode() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if old.invitation_id is distinct from new.invitation_id then new.activity_access_mode=null;end if;
 return new;
end $$;
create trigger clear_activity_mode before update of invitation_id on public.invitation_sessions
 for each row execute function guest_activity_private.clear_mode();

create function guest_activity_private.device(p_agent text) returns text
language sql immutable set search_path=pg_catalog as $$
 select case
 when p_agent ~* 'iPad' then 'iPad'
 when p_agent ~* 'iPhone|iPod' then 'iPhone'
 when p_agent ~* 'Android' then 'Android'
 when p_agent ~* 'Windows' then 'Microsoft Windows'
 when p_agent ~* 'Macintosh|Mac OS X' then 'macOS'
 when p_agent ~* 'Linux' then 'Linux' end;
$$;
create function guest_activity_private.request_device() returns text
language plpgsql stable set search_path=pg_catalog as $$
begin
 return guest_activity_private.device(left((nullif(current_setting('request.headers',true),'')::jsonb)->>'user-agent',512));
exception when others then return null;
end $$;

-- Preserve the original generic audit event, enrich only new RSVP writes.
-- Effective PENDING with responded_at means MAYBE in the existing model.
create function guest_activity_private.audit_rsvp() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.rsvps; g public.guests; actor_guest public.guests;
 inv uuid; mode text; prior text; following text; changed boolean; operator_role public.app_role;
begin
 if tg_op='DELETE' then r=old;else r=new;end if;
 select * into g from public.guests where event_id=r.event_id and id=r.guest_id;
 operator_role=public.event_role(r.event_id);
 if operator_role='GUEST' then
 select s.invitation_id,s.activity_access_mode into inv,mode
 from public.invitation_sessions s where s.event_id=r.event_id and s.user_id=auth.uid()
 and s.invitation_id=public.my_invitation(r.event_id);
 select member.* into actor_guest from public.invitation_sessions s
 join public.guests member on member.event_id=s.event_id and member.id=s.profile_guest_id and member.invitation_id=s.invitation_id
 where s.event_id=r.event_id and s.user_id=auth.uid() and s.invitation_id=inv;
 end if;
 if tg_op<>'INSERT' then prior=case when old.status='PENDING' and old.responded_at is not null then 'MAYBE' else old.status::text end;end if;
 if tg_op<>'DELETE' then following=case when new.status='PENDING' and new.responded_at is not null then 'MAYBE' else new.status::text end;end if;
 changed=tg_op<>'DELETE' and (prior is distinct from following) and not (tg_op='INSERT' and following='PENDING');
 insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata)
 values(r.event_id,auth.uid(),tg_op,'rsvps',r.id,jsonb_strip_nulls(jsonb_build_object(
 'activity_version',1,'status_changed',changed,'guest_id',r.guest_id,'guest_name',g.name,
 'previous',prior,'next',following,'actor_role',operator_role,
 'actor_guest_id',actor_guest.id,'actor_name',case when operator_role='ADMIN' then (select display_name from public.profiles where id=auth.uid()) else actor_guest.name end,'access_mode',mode,
 'device',guest_activity_private.request_device())));
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
create or replace trigger audit after insert or update or delete on public.rsvps
 for each row execute function guest_activity_private.audit_rsvp();

-- Only the trusted Edge Function calls this RPC. All original credential,
-- rate-limit and identity checks remain in the original redemption functions.
create function public.redeem_invitation_tracked(p_event uuid,p_user uuid,p_code text,p_name text,p_pin text,p_bucket text,p_agent text default null,p_ip inet default null,p_resume boolean default false,p_request uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; target uuid; chosen public.guests; mode text; source_id uuid;
 own_transaction xid:=pg_current_xact_id()::xid; activations_before uuid[];
begin
 select coalesce(array_agg(a.id),'{}'::uuid[]) into activations_before
 from public.audit_logs a where a.event_id=p_event and a.actor=p_user
 and a.entity='invitations' and a.action='ACTIVATION' and a.xmin=own_transaction;
 if p_resume then
  mode='LINK';
  result=public.identify_invitation(p_event,p_user,p_code,p_bucket);
  if coalesce((result->>'activated')::boolean,false) is not true then return result;end if;
  select invitation_id into target from public.invitation_sessions where event_id=p_event and user_id=p_user and pin_verified_at is not null;
 elsif p_code is null then
  mode='NAME_PIN';
  result=public.redeem_invitation_by_name(p_event,p_user,p_name,p_pin,p_bucket);
 else
  mode='LINK';
  result=public.redeem_invitation_link(p_event,p_user,p_code,p_pin,p_bucket);
 end if;
 if not p_resume then
  if coalesce((result->>'linked')::boolean,false) is not true then return result;end if;
  target=(result->>'invitation_id')::uuid;
 end if;
 update public.invitation_sessions set activity_access_mode=mode
 where event_id=p_event and user_id=p_user and invitation_id=target and pin_verified_at is not null;
 select g.* into chosen from public.invitation_sessions s join public.guests g
 on g.event_id=s.event_id and g.id=s.profile_guest_id and g.invitation_id=s.invitation_id
 where s.event_id=p_event and s.user_id=p_user and s.invitation_id=target;
 -- Reference only the activation from this transaction, never an older login.
 select min(a.id::text)::uuid into source_id from public.audit_logs a where a.event_id=p_event
 and a.actor=p_user and a.entity='invitations' and a.entity_id=target
 and a.action='ACTIVATION' and not p_resume and a.xmin=own_transaction
 and not(a.id=any(activations_before)) having count(*)=1;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata)
 values(p_event,p_user,'LOGIN','guest_activity',chosen.id,jsonb_strip_nulls(jsonb_build_object(
 'kind','LOGIN','guest_id',chosen.id,'guest_name',chosen.name,'actor_guest_id',chosen.id,
 'actor_name',chosen.name,'actor_role','GUEST','invitation_id',target,
 'invitation_name',(select name from public.invitations where event_id=p_event and id=target),
 'access_mode',mode,'request_id',case when p_resume then p_request end,'device',guest_activity_private.device(left(p_agent,512)),
 'ip',host(p_ip),'source_activation_id',source_id))) on conflict do nothing;
 return result;
end $$;
revoke all on function public.redeem_invitation_tracked(uuid,uuid,text,text,text,text,text,inet,boolean,uuid) from public,anon,authenticated;
grant execute on function public.redeem_invitation_tracked(uuid,uuid,text,text,text,text,text,inet,boolean,uuid) to service_role;

create unique index guest_activity_request on public.audit_logs(event_id,actor,(metadata->>'request_id'))
 where entity='guest_activity' and metadata ? 'request_id';
create index guest_activity_page on public.audit_logs(event_id,created_at desc,id desc)
 where entity='guest_activity' or (entity='rsvps' and action='UPDATE')
 or (entity='invitations' and action='ACTIVATION') or action='GUEST_RSVP_SET';

create unique index guest_activity_legacy_source on public.audit_logs(event_id,(metadata->>'source_audit_id'))
 where entity='guest_activity' and metadata ? 'source_audit_id';
create unique index guest_activity_legacy_companion on public.audit_logs(event_id,(metadata->>'source_companion_id'))
 where entity='guest_activity' and metadata ? 'source_companion_id';
create index guest_activity_actor_time on public.audit_logs(event_id,actor,created_at desc) where entity='guest_activity';
create index guest_activity_activation_source on public.audit_logs(event_id,(metadata->>'source_activation_id'))
 where entity='guest_activity' and action='LOGIN';

-- No caller-supplied guest, timestamp, identity, access mode or IP accepted.
create function public.record_guest_activity(p_event uuid,p_kind text,p_request uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare chosen public.guests; mode text;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'GUEST' then raise exception 'unauthorized';end if;
 if p_kind is null or p_kind not in ('PRESENTES','CONVITES','LOCAL','INFORMACOES','LOGOUT') or p_request is null then raise exception 'invalid activity';end if;
 select g.* into chosen from public.invitation_sessions s
 join public.guests g on g.event_id=s.event_id and g.id=s.profile_guest_id and g.invitation_id=s.invitation_id
 where s.event_id=p_event and s.user_id=auth.uid() and s.invitation_id=public.my_invitation(p_event);
 if chosen.id is null then return jsonb_build_object('recorded',false);end if;
 select activity_access_mode into mode from public.invitation_sessions where event_id=p_event and user_id=auth.uid();
 -- Serialize idempotence/rate checks per session, not the whole event.
 perform pg_advisory_xact_lock(hashtextextended('activity:'||p_event::text||auth.uid()::text,0));
 if exists(select 1 from public.audit_logs where event_id=p_event and actor=auth.uid() and entity='guest_activity' and metadata ? 'request_id' and metadata->>'request_id'=p_request::text) then return jsonb_build_object('recorded',true,'duplicate',true);end if;
 if (select count(*) from public.audit_logs where event_id=p_event and actor=auth.uid() and entity='guest_activity' and created_at>clock_timestamp()-interval '5 minutes')>=120 then return jsonb_build_object('recorded',false);end if;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata)
 values(p_event,auth.uid(),p_kind,'guest_activity',chosen.id,jsonb_strip_nulls(jsonb_build_object(
 'kind',p_kind,'guest_id',chosen.id,'guest_name',chosen.name,'actor_guest_id',chosen.id,
 'actor_name',chosen.name,'actor_role','GUEST','access_mode',mode,'request_id',p_request,
 'device',guest_activity_private.request_device())));
 return jsonb_build_object('recorded',true);
end $$;
revoke all on function public.record_guest_activity(uuid,text,uuid) from public,anon;
grant execute on function public.record_guest_activity(uuid,text,uuid) to authenticated;

-- Read-through projection and stable recovery snapshots retain source IDs/timestamps.
-- Unrecorded historical status/identity/mode/device/IP remain unknown.
create view guest_activity_private.history with (security_invoker=true) as
with rsvp_rows as (
 select a.*,coalesce(r.guest_id,(a.metadata->>'guest_id')::uuid,
 (select max(b.entity_id::text)::uuid from public.audit_logs b
 where b.event_id=a.event_id and b.actor=a.actor and b.created_at=a.created_at
 and b.entity='guests' and b.action='GUEST_RSVP_SET'
 having count(*)=1 and (select count(*) from public.audit_logs same
 where same.event_id=a.event_id and same.actor=a.actor and same.created_at=a.created_at
 and same.entity='rsvps' and same.action='UPDATE')=1)) as legacy_guest_id,
 r.responded_at,r.status as current_status,r.source,
 (select count(*) from public.audit_logs same where same.event_id=a.event_id and same.entity='rsvps' and same.action='UPDATE' and same.entity_id=a.entity_id and same.created_at=a.created_at) as updates_at_time
 from public.audit_logs a left join public.rsvps r on r.event_id=a.event_id and r.id=a.entity_id
 where a.entity='rsvps' and a.action in ('UPDATE','INSERT')
), changes as (
 select a.id,a.event_id,a.created_at,
 case when a.metadata ? 'activity_version' then a.metadata else
 jsonb_strip_nulls(jsonb_build_object('guest_id',a.legacy_guest_id,
 'next',coalesce(admin.next,case when a.source='APP' and a.responded_at=a.created_at then case when a.current_status='PENDING' then 'MAYBE' else a.current_status::text end end),
 'previous',admin.previous,'actor_role',case when admin.next is not null then 'ADMIN' end)) end as info,
 'RSVP'::text as kind,not(a.metadata ? 'activity_version') as historical
 from rsvp_rows a
 left join lateral (
 select max(b.metadata->>'next') as next,max(b.metadata->>'previous') as previous
 from public.audit_logs b where b.event_id=a.event_id and b.entity='guests' and b.action='GUEST_RSVP_SET'
 and b.entity_id=a.legacy_guest_id and b.created_at=a.created_at and a.updates_at_time=1
 having count(*)=1
 ) admin on true
 where ((a.metadata ? 'activity_version' and (a.metadata->>'status_changed')::boolean)
 or (not(a.metadata ? 'activity_version') and a.action='UPDATE'))
 and not exists(select 1 from public.audit_logs recovered where recovered.event_id=a.event_id and recovered.entity='guest_activity' and recovered.metadata ? 'source_audit_id' and recovered.metadata->>'source_audit_id'=a.id::text)
 union all
 select b.id,b.event_id,b.created_at,b.metadata||jsonb_build_object('guest_id',b.entity_id,'actor_role','ADMIN'),'RSVP',true
 from public.audit_logs b where b.entity='guests' and b.action='GUEST_RSVP_SET'
 and not exists(select 1 from public.audit_logs recovered where recovered.event_id=b.event_id and recovered.entity='guest_activity' and recovered.metadata ? 'source_audit_id' and recovered.metadata->>'source_audit_id'=b.id::text)
 and not exists(select 1 from public.audit_logs recovered where recovered.event_id=b.event_id and recovered.entity='guest_activity' and recovered.metadata ? 'source_companion_id' and recovered.metadata->>'source_companion_id'=b.id::text)
 and not exists(select 1 from rsvp_rows a where a.event_id=b.event_id and a.created_at=b.created_at and coalesce((a.metadata->>'guest_id')::uuid,a.legacy_guest_id)=b.entity_id and (a.updates_at_time=1 or a.metadata ? 'activity_version'))
 union all
 select coalesce((a.metadata->>'source_audit_id')::uuid,a.id),a.event_id,a.created_at,a.metadata,a.action,coalesce((a.metadata->>'historical')::boolean,false) from public.audit_logs a where a.entity='guest_activity'
 union all
 select a.id,a.event_id,a.created_at,jsonb_build_object('invitation_name',i.name),'LOGIN',true
 from public.audit_logs a left join public.invitations i on i.event_id=a.event_id and i.id=a.entity_id
 where a.entity='invitations' and a.action='ACTIVATION'
 and not exists(select 1 from public.audit_logs recovered where recovered.event_id=a.event_id and recovered.entity='guest_activity' and recovered.metadata ? 'source_audit_id' and recovered.metadata->>'source_audit_id'=a.id::text)
 and not exists(select 1 from public.audit_logs linked where linked.event_id=a.event_id and linked.entity='guest_activity' and linked.action='LOGIN' and linked.metadata->>'source_activation_id'=a.id::text)
)
select c.id,c.event_id,c.created_at,c.kind,c.historical,
 (c.info->>'guest_id')::uuid as guest_id,
 coalesce(c.info->>'guest_name',g.name) as guest_name,
 c.info->>'invitation_name' as invitation_name,
 c.info->>'next' as status,c.info->>'previous' as previous_status,
 c.info->>'actor_role' as actor_role,c.info->>'actor_guest_id' as actor_guest_id,c.info->>'actor_name' as actor_name,
 c.info->>'access_mode' as access_mode,c.info->>'device' as device,c.info->>'ip' as ip,
 g.id is not null as editable
from changes c left join public.guests g on g.event_id=c.event_id and g.id=(c.info->>'guest_id')::uuid;

-- Freeze only proven legacy facts before future edits/delete make their current
-- row evidence unavailable. Source records stay byte-for-byte intact. Imported
-- copies are idempotent by event/source UUID and retain the original timeline ID.
create function guest_activity_private.recover_history() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare inserted integer;
begin
 insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata,created_at)
 select h.event_id,original.actor,h.kind,'guest_activity',h.guest_id,
 jsonb_strip_nulls(jsonb_build_object('source_audit_id',h.id,'source_entity',original.entity,
 'source_action',original.action,'historical',true,'recovered_at',clock_timestamp(),
 'source_companion_id',case when h.actor_role='ADMIN' and original.entity='rsvps' then
 (select min(b.id::text) from public.audit_logs b where b.event_id=h.event_id and b.entity='guests' and b.action='GUEST_RSVP_SET' and b.entity_id=h.guest_id and b.created_at=h.created_at having count(*)=1) end,
 'kind',h.kind,'guest_id',h.guest_id,'guest_name',h.guest_name,
 'name_source',case when h.guest_name is not null then 'current_at_recovery' end,
 'invitation_name',h.invitation_name,'next',h.status,'previous',h.previous_status,
 'actor_role',h.actor_role,'actor_guest_id',h.actor_guest_id,'actor_name',h.actor_name)),h.created_at
 from guest_activity_private.history h join public.audit_logs original on original.event_id=h.event_id and original.id=h.id
 where h.historical and not exists(select 1 from public.audit_logs prior where prior.event_id=h.event_id and prior.entity='guest_activity' and prior.metadata ? 'source_audit_id' and prior.metadata->>'source_audit_id'=h.id::text)
 on conflict do nothing;
 get diagnostics inserted=row_count;
 return inserted;
end $$;
revoke all on function guest_activity_private.recover_history() from public,anon,authenticated,service_role;
select guest_activity_private.recover_history();

create function public.guest_activity_history(p_event uuid,p_before timestamptz default null,p_cursor uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb; last_row jsonb;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if (p_before is null) <> (p_cursor is null) then raise exception 'invalid cursor';end if;
 select coalesce(jsonb_agg(to_jsonb(page) order by page.created_at desc,page.id desc),'[]'::jsonb) into result
 from (select * from guest_activity_private.history h where event_id=p_event
 and (p_before is null or (h.created_at,h.id)<(p_before,p_cursor))
 order by h.created_at desc,h.id desc limit 21) page;
 last_row=result->19;
 return jsonb_build_object('items',case when jsonb_array_length(result)>20 then result-20 else result end,
 'next',case when jsonb_array_length(result)>20 then jsonb_build_object('at',last_row->>'created_at','id',last_row->>'id') else null end);
end $$;
revoke all on function public.guest_activity_history(uuid,timestamptz,uuid) from public,anon;
grant execute on function public.guest_activity_history(uuid,timestamptz,uuid) to authenticated;
revoke all on function guest_activity_private.clear_mode(),guest_activity_private.device(text),guest_activity_private.request_device(),guest_activity_private.audit_rsvp() from public,anon,authenticated,service_role;
revoke all on guest_activity_private.history from public,anon,authenticated,service_role;
-- Existing audit_logs RLS is ADMIN-only; no grants or policies are expanded.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='audit_logs') then
  alter publication supabase_realtime add table public.audit_logs;
 end if;
end $$;
commit;
