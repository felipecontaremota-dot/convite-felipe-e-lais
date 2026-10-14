begin;
do $$begin
 if to_regprocedure('public.name_pin_snapshot_core(uuid)') is null or to_regprocedure('public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)') is null then raise exception 'messaging requires current main name/PIN and consent baseline';end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'untrusted schema writer';end if;
end$$;
-- Incremental extension. All historical messages, receipts and outbox rows remain intact.
alter table public.messages add column deleted_at timestamptz, add column deleted_by uuid references auth.users(id) on delete set null,
 add column notification_title text check(length(notification_title)<=160), add column legacy_admin_read_at timestamptz, add column audience text not null default 'LEGACY' check(audience in ('GENERAL','FAMILY','INDIVIDUAL','PRIVATE','LEGACY'));
update public.messages set legacy_admin_read_at=read_at where not from_admin and read_at is not null;
alter table public.announcements add column message_id uuid references public.messages(id), add column deleted_at timestamptz;
-- Associate historical broadcast projections only when correspondence is one-to-one.
update public.announcements a set message_id=m.id from public.messages m
where a.event_id=m.event_id and a.title='Mensagem dos noivos' and a.content=m.content and a.created_at=m.created_at and m.from_admin
 and m.invitation_id is null
 and (select count(*) from public.messages x where x.event_id=a.event_id and x.from_admin and x.invitation_id is null and x.content=a.content and x.created_at=a.created_at)=1
 and (select count(*) from public.announcements x where x.event_id=m.event_id and x.title='Mensagem dos noivos' and x.content=m.content and x.created_at=m.created_at)=1;
update public.messages set audience='GENERAL' where id in(select message_id from public.announcements where message_id is not null);
-- Restore only the exact recipient recorded by the historical IN_APP rule worker.
insert into public.message_recipients(event_id,message_id,guest_id)
 select m.event_id,m.id,m.recipient_guest_id from public.messages m
 join public.notification_jobs j on j.event_id=m.event_id and j.id=m.id and j.rule_id is not null and j.channel='IN_APP' and j.guest_id=m.recipient_guest_id
 join public.guests g on g.event_id=m.event_id and g.id=m.recipient_guest_id and g.invitation_id=m.invitation_id
 where m.from_admin on conflict(message_id,guest_id) do nothing;
create index messages_visible_event on public.messages(event_id,created_at,id) where deleted_at is null;
create index messages_unit_history on public.messages(event_id,invitation_id,created_at,id) where deleted_at is null;
create table public.message_reads (
 event_id uuid not null, message_id uuid not null, reader_key text not null, read_at timestamptz not null default now(),
 primary key(message_id,reader_key), foreign key(event_id,message_id) references public.messages(event_id,id) on delete cascade
);
create index message_reads_reader on public.message_reads(event_id,reader_key,message_id);
alter table public.message_reads enable row level security;
create function public.message_reader(p_event uuid) returns text language sql stable security invoker set search_path=public,extensions,pg_temp as $$
 select case public.event_role(p_event) when 'ADMIN' then 'admin:'||auth.uid() when 'GUEST' then 'unit:'||public.my_invitation(p_event) end
$$;
revoke all on function public.message_reader(uuid) from public,anon;
grant execute on function public.message_reader(uuid) to authenticated;
create policy own_message_reads on public.message_reads for select to authenticated using(reader_key=public.message_reader(event_id) and public.can_read_message(event_id,message_id));
revoke all on public.message_reads from anon,authenticated;
grant select on public.message_reads to authenticated;
-- No fabricated historical per-user read attribution: legacy shared read_at is retained separately.
alter function public.can_read_message(uuid,uuid) rename to messaging_visibility_core;
revoke all on function public.messaging_visibility_core(uuid,uuid) from public,anon,authenticated,service_role;
create function public.can_read_message(p_event uuid,p_message uuid) returns boolean language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select exists(select 1 from public.messages where event_id=p_event and id=p_message and deleted_at is null and (not from_admin or audience not in ('FAMILY','PRIVATE') or public.event_role(p_event)='ADMIN' or invitation_id=public.my_invitation(p_event))) and public.messaging_visibility_core(p_event,p_message)
$$;
revoke all on function public.can_read_message(uuid,uuid) from public,anon;
grant execute on function public.can_read_message(uuid,uuid) to authenticated,service_role;
-- Existing RLS policy references resolve to the old function OID after rename; recreate them.
drop policy guest_messages on public.messages;
create policy guest_messages on public.messages for select to authenticated using(public.can_read_message(event_id,id));
drop policy own_message_reads on public.message_reads;
create policy own_message_reads on public.message_reads for select to authenticated using(reader_key=public.message_reader(event_id) and public.can_read_message(event_id,message_id));

-- Scheduling remains off until the existing trusted worker has been verified for this event.
alter table public.events add column notification_scheduling_enabled boolean not null default false;
create table public.notification_schedules (
 id uuid primary key, event_id uuid not null references public.events(id), title text not null check(length(title) between 1 and 160),
 body text not null check(length(body) between 1 and 3800), scheduled_at timestamptz not null,
 audience text not null check(audience in ('GENERAL','FAMILY','INDIVIDUAL')), invitation_id uuid,
 recipient_guest_ids uuid[] not null check(cardinality(recipient_guest_ids) between 1 and 500), channels public.delivery_channel[] not null check(cardinality(channels)>0),
 active boolean not null default true, status text not null default 'scheduled' check(status in ('scheduled','dispatched','cancelled')),
 version integer not null default 1, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(event_id,invitation_id) references public.invitations(event_id,id)
);
create index notification_schedules_event on public.notification_schedules(event_id,scheduled_at,id);
create index notification_schedules_due on public.notification_schedules(scheduled_at,id) where status='scheduled' and active;
alter table public.notification_schedules enable row level security;
create policy admin_schedules on public.notification_schedules for select to authenticated using(public.event_role(event_id)='ADMIN');
revoke all on public.notification_schedules from anon,authenticated;
grant select on public.notification_schedules to authenticated;
create trigger schedule_touch before update on public.notification_schedules for each row execute function public.touch_row();

alter function public.app_mutate(uuid,uuid,text,jsonb) rename to messaging_mutation_core;
revoke all on function public.messaging_mutation_core(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role public.app_role:=public.event_role(p_event); result jsonb; mid uuid; tid uuid; inv uuid; anchor public.messages; ids uuid[]; category text; content text; prior jsonb;
begin
 if p_type not in ('MESSAGE_SEND','MESSAGE_SEND_TO_GUESTS','MESSAGE_REPLY','MESSAGE_READ') then return public.messaging_mutation_core(p_event,p_mutation,p_type,p_payload);end if;
 if auth.uid() is null or role is null or role not in ('ADMIN','GUEST') then raise exception 'unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended('messaging:'||p_event||':'||auth.uid(),0));
 select r.result into prior from public.mutation_receipts r where r.event_id=p_event and r.user_id=auth.uid() and r.mutation_id=p_mutation;
 if found then return coalesce(prior,'{}')||jsonb_build_object('duplicate',true);end if;
 if p_type='MESSAGE_READ' then
  mid=(p_payload->>'id')::uuid;
  perform 1 from public.messages where event_id=p_event and id=mid for share;
  if not public.can_read_message(p_event,mid) then raise exception 'unauthorized';end if;
  if exists(select 1 from public.messages where id=mid and from_admin=(role='ADMIN')) then raise exception 'invalid read';end if;
  insert into public.message_reads(event_id,message_id,reader_key) values(p_event,mid,public.message_reader(p_event)) on conflict do nothing;
  result=jsonb_build_object('ok',true,'id',mid);
 elsif p_type='MESSAGE_REPLY' then
  if role<>'ADMIN' then raise exception 'unauthorized';end if;
  perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
  select * into anchor from public.messages where event_id=p_event and id=(p_payload->>'message_id')::uuid and not from_admin and deleted_at is null for share;
  if not found or anchor.invitation_id is null then raise exception 'invalid conversation';end if;
  select array_agg(g.id) into ids from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id
   where g.event_id=p_event and g.invitation_id=anchor.invitation_id and i.active and i.archived_at is null and (anchor.sender_guest_id is null or g.id=anchor.sender_guest_id);
  result=public.messaging_mutation_core(p_event,p_mutation,'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content',p_payload->>'content','recipient_guest_ids',to_jsonb(ids),'channels',coalesce(p_payload->'channels','["IN_APP"]'::jsonb)));
  mid=(result->>'id')::uuid;
  update public.messages set thread_id=anchor.thread_id,invitation_id=anchor.invitation_id,audience='PRIVATE' where id=mid;
  insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'MESSAGE_REPLY','messages',mid);
  return result;
 elsif p_type='MESSAGE_SEND' and role='GUEST' then
  inv=public.my_invitation(p_event); content=trim(p_payload->>'content');
  if inv is null or content is null or length(content) not between 1 and 4000 then raise exception 'invalid message';end if;
  if nullif(p_payload->>'sender_guest_id','') is not null and not public.owns_guest(p_event,(p_payload->>'sender_guest_id')::uuid) then raise exception 'invalid sender';end if;
  insert into public.message_threads(event_id,invitation_id) values(p_event,inv) on conflict(event_id,invitation_id) do update set updated_at=now() returning id into tid;
  insert into public.messages(event_id,thread_id,invitation_id,sender_guest_id,sender_user_id,content,audience)
   values(p_event,tid,inv,nullif(p_payload->>'sender_guest_id','')::uuid,auth.uid(),content,'PRIVATE') returning id into mid;
  result=jsonb_build_object('ok',true,'id',mid);
 else
  if role<>'ADMIN' then raise exception 'unauthorized';end if;
  -- Recipient validation/idempotency remain in the canonical implementation.
  if p_payload ? 'create_announcement' and jsonb_typeof(p_payload->'create_announcement')<>'boolean' then raise exception 'invalid announcement flag';end if;
  category=coalesce(p_payload->>'audience',case when coalesce((p_payload->>'create_announcement')::boolean,false) then 'GENERAL' else 'LEGACY' end);
  if category not in ('GENERAL','FAMILY','INDIVIDUAL','LEGACY') then raise exception 'invalid audience';end if;
  result=public.messaging_mutation_core(p_event,p_mutation,p_type,p_payload||jsonb_build_object('create_announcement',false));
  mid=(result->>'id')::uuid;
  if mid is not null then
   if coalesce((p_payload->>'create_announcement')::boolean,false) and not exists(select 1 from public.messages where id=mid and channels @> '{IN_APP}'::public.delivery_channel[]) then raise exception 'announcement requires IN_APP';end if;
   if category='GENERAL' and (select count(*) from public.message_recipients where message_id=mid)<>(select count(*) from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.event_id=p_event and i.active and i.archived_at is null) then raise exception 'announcement requires all active recipients';end if;
   if category='FAMILY' and (select count(distinct g.invitation_id) from public.message_recipients r join public.guests g on g.id=r.guest_id and g.event_id=r.event_id where r.message_id=mid)<>1 then raise exception 'invalid family recipients';end if;
   update public.messages set audience=category,invitation_id=case when category='FAMILY' then (select g.invitation_id from public.message_recipients r join public.guests g on g.id=r.guest_id where r.message_id=mid group by g.invitation_id) else invitation_id end where id=mid;
   if category='GENERAL' and exists(select 1 from public.messages where id=mid and channels @> '{IN_APP}'::public.delivery_channel[]) then
    insert into public.announcements(event_id,title,content,message_id) select p_event,'Mensagem dos noivos',m.content,mid from public.messages m where m.id=mid;
   end if;
  end if;
  return result;
 end if;
 insert into public.mutation_receipts(event_id,user_id,mutation_id,result) values(p_event,auth.uid(),p_mutation,result);
 return result;
end $$;
revoke all on function public.app_mutate(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.app_mutate(uuid,uuid,text,jsonb) to authenticated,service_role;

alter function public.admin_action(uuid,text,jsonb) rename to messaging_admin_core;
revoke all on function public.messaging_admin_core(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare mid uuid; m public.messages; s public.notification_schedules; ids uuid[]; ch public.delivery_channel[]; sid uuid; due timestamptz; category text; inv uuid;
begin
 if p_action not in ('MESSAGE_READ','MESSAGE_DELETE','NOTIFICATION_SAVE','NOTIFICATION_CANCEL') then return public.messaging_admin_core(p_event,p_action,p_payload);end if;
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 if p_action='NOTIFICATION_SAVE' and not coalesce((select notification_scheduling_enabled from public.events where id=p_event),false) then raise exception 'notification scheduling not enabled';end if;
 if p_action='MESSAGE_READ' then
  mid=(p_payload->>'id')::uuid;
  if not public.can_read_message(p_event,mid) or not exists(select 1 from public.messages where id=mid and not from_admin) then raise exception 'invalid message';end if;
  insert into public.message_reads values(p_event,mid,public.message_reader(p_event),now()) on conflict do nothing;
  update public.messages set read_at=coalesce(read_at,now()) where id=mid; -- legacy compatibility only; new counters use viewer_read_at.
 elsif p_action='MESSAGE_DELETE' then
  mid=(p_payload->>'id')::uuid;
  select * into m from public.messages where event_id=p_event and id=mid for update;
  if not found or not m.from_admin then raise exception 'invalid message';end if;
  if m.deleted_at is not null then return jsonb_build_object('ok',true);end if;
  if exists(select 1 from public.announcements a where a.event_id=p_event and a.message_id is null and a.content=m.content and a.created_at=m.created_at) then raise exception 'legacy announcement needs association';end if;
  update public.messages set deleted_at=now(),deleted_by=auth.uid() where id=mid;
  update public.announcements set deleted_at=now() where event_id=p_event and message_id=mid;
  update public.notification_jobs set status='skipped',locked_at=null,last_error='Mensagem excluída' where event_id=p_event and (message_id=mid or id=mid and rule_id is not null and channel='IN_APP') and delivery_started_at is null and status in ('pending','failed','processing');
  insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'MESSAGE_DELETE','messages',mid);
 else
  sid=(p_payload->>'id')::uuid;
  if sid is null then raise exception 'invalid schedule id';end if;
  -- Serialize client-supplied IDs globally, including simultaneous requests from different events.
  perform pg_advisory_xact_lock(hashtextextended('notification-schedule:'||sid,0));
  select * into s from public.notification_schedules where id=sid for update;
  if found and s.event_id=p_event and p_action='NOTIFICATION_CANCEL' and s.status='cancelled' then return jsonb_build_object('ok',true,'duplicate',true);end if;
  if found and (s.event_id<>p_event or (s.status<>'scheduled' and not(p_action='NOTIFICATION_CANCEL' and s.status='dispatched'))) then raise exception 'schedule immutable';end if;
  if p_action='NOTIFICATION_CANCEL' then
   if s.id is null then raise exception 'not found';end if;
   if s.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
   if s.status='dispatched' then
    perform 1 from public.messages where event_id=p_event and id=sid for update;
    if exists(select 1 from public.notification_jobs where event_id=p_event and message_id=sid and (delivery_started_at is not null or status in ('sent','uncertain'))) then raise exception 'delivery already admitted';end if;
    update public.messages set deleted_at=now(),deleted_by=auth.uid() where event_id=p_event and id=sid;
    update public.notification_jobs set status='skipped',locked_at=null,last_error='Notificação cancelada' where event_id=p_event and message_id=sid and status in ('pending','failed','processing');
   end if;
   update public.notification_schedules set status='cancelled',active=false,version=version+1 where id=sid;
  else
   if length(trim(coalesce(p_payload->>'title',''))) not between 1 and 160 or length(trim(coalesce(p_payload->>'body',''))) not between 1 and 3800 then raise exception 'invalid notification content';end if;
   if s.id is not null and nullif(p_payload->>'version','') is null then
    if s.title=trim(p_payload->>'title') and s.body=trim(p_payload->>'body') and s.scheduled_at=(p_payload->>'scheduled_at')::timestamptz and to_jsonb(s.recipient_guest_ids) @> (p_payload->'recipient_guest_ids') and (p_payload->'recipient_guest_ids') @> to_jsonb(s.recipient_guest_ids) and to_jsonb(s.channels) @> (p_payload->'channels') and (p_payload->'channels') @> to_jsonb(s.channels) and s.audience=p_payload->>'audience' and s.invitation_id is not distinct from nullif(p_payload->>'invitation_id','')::uuid and s.active=coalesce((p_payload->>'active')::boolean,true) then return jsonb_build_object('ok',true,'duplicate',true);end if;
    raise exception 'conflict';
   end if;
   if s.id is not null and s.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
   if s.id is null and (exists(select 1 from public.messages where id=sid) or exists(select 1 from public.notification_jobs where id=sid)) then raise exception 'invalid schedule id';end if;
   if coalesce(p_payload->>'scheduled_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid future date';end if;
   due=(p_payload->>'scheduled_at')::timestamptz;
   if due is null or not isfinite(due) or due<=clock_timestamp() then raise exception 'invalid future date';end if;
   select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_payload->'recipient_guest_ids');
   select array_agg(distinct value::public.delivery_channel) into ch from jsonb_array_elements_text(p_payload->'channels');
   if ch @> '{PUSH}'::public.delivery_channel[] and octet_length(to_jsonb(trim(p_payload->>'title')||E'\n'||trim(p_payload->>'body'))::text)>3000 then raise exception 'push content too long';end if;
   if ch @> '{WHATSAPP}'::public.delivery_channel[] and octet_length(trim(p_payload->>'title')||E'\n'||trim(p_payload->>'body'))>1000 then raise exception 'whatsapp content too long';end if;
   if cardinality(ids) not between 1 and 500 or coalesce(cardinality(ch),0)=0 or array_position(ch,null) is not null then raise exception 'invalid recipients/channels';end if;
   if (select count(*) from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.event_id=p_event and g.id=any(ids) and i.active and i.archived_at is null)<>cardinality(ids) then raise exception 'invalid recipients';end if;
   category=p_payload->>'audience';
   if category is null or category not in ('GENERAL','FAMILY','INDIVIDUAL') then raise exception 'invalid audience';end if;
   inv=nullif(p_payload->>'invitation_id','')::uuid;
   if category='GENERAL' and cardinality(ids)<>(select count(*) from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.event_id=p_event and i.active and i.archived_at is null) then raise exception 'announcement requires all active recipients';end if;
   if category='FAMILY' and (inv is null or exists(select 1 from public.guests where id=any(ids) and invitation_id<>inv)) then raise exception 'invalid family recipients';end if;
   insert into public.notification_schedules(id,event_id,title,body,scheduled_at,audience,invitation_id,recipient_guest_ids,channels,active,created_by)
   values(sid,p_event,trim(p_payload->>'title'),trim(p_payload->>'body'),due,category,case when category='FAMILY' then inv end,ids,ch,coalesce((p_payload->>'active')::boolean,true),auth.uid())
   on conflict(id) do update set title=excluded.title,body=excluded.body,scheduled_at=excluded.scheduled_at,audience=excluded.audience,invitation_id=excluded.invitation_id,recipient_guest_ids=excluded.recipient_guest_ids,channels=excluded.channels,active=excluded.active,version=notification_schedules.version+1;
  end if;
  insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),p_action,'notification_schedules',sid);
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.admin_action(uuid,text,jsonb) from public,anon;
grant execute on function public.admin_action(uuid,text,jsonb) to authenticated;

alter function public.schedule_notifications() rename to messaging_schedule_core;
revoke all on function public.messaging_schedule_core() from public,anon,authenticated,service_role;
create function public.schedule_notifications() returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare s public.notification_schedules; tid uuid; recipients uuid[];
begin
 perform public.messaging_schedule_core();
 for s in select * from public.notification_schedules where exists(select 1 from public.events e where e.id=notification_schedules.event_id and e.notification_scheduling_enabled) and status='scheduled' and active and scheduled_at<=clock_timestamp() order by scheduled_at,id for update skip locked limit 50 loop
  select array_agg(g.id) into recipients from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id
   where g.event_id=s.event_id and g.id=any(s.recipient_guest_ids) and i.active and i.archived_at is null and (s.audience<>'FAMILY' or g.invitation_id=s.invitation_id);
  if coalesce(cardinality(recipients),0)>0 then
   insert into public.message_threads(event_id) values(s.event_id) returning id into tid;
   insert into public.messages(id,event_id,thread_id,invitation_id,from_admin,sender_user_id,notification_title,content,channels,audience) values(s.id,s.event_id,tid,case when s.audience='FAMILY' then s.invitation_id end,true,s.created_by,s.title,s.title||E'\n'||s.body,s.channels,s.audience);
   insert into public.message_recipients(event_id,message_id,guest_id) select s.event_id,s.id,unnest(recipients);
   insert into public.notification_jobs(event_id,message_id,guest_id,channel,idempotency_key) select s.event_id,s.id,g,c,s.id||':'||g||':'||c from unnest(recipients) g cross join unnest(s.channels) c on conflict do nothing;
   -- No public announcement for targeted notifications. History is the authorized inbox.
  end if;
  update public.notification_schedules set status='dispatched',version=version+1 where id=s.id;
 end loop;
end $$;
revoke all on function public.schedule_notifications() from public,anon,authenticated;
grant execute on function public.schedule_notifications() to service_role;

alter function public.app_snapshot(uuid) rename to messaging_snapshot_core;
revoke all on function public.messaging_snapshot_core(uuid) from public,anon,authenticated,service_role;
create function public.app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb; role public.app_role:=public.event_role(p_event);
begin
 result=public.messaging_snapshot_core(p_event);
 return result||jsonb_build_object('capabilities',jsonb_build_object('messaging_v2',true,'notification_schedules',coalesce((select notification_scheduling_enabled from public.events where id=p_event),false)),
 'messages',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('viewer_read_at',(select r.read_at from public.message_reads r where r.message_id=m.id and r.reader_key=public.message_reader(p_event)))||case when role='ADMIN' then jsonb_build_object('recipient_guest_ids',(select coalesce(jsonb_agg(r.guest_id),'[]') from public.message_recipients r where r.message_id=m.id)) else '{}'::jsonb end order by m.created_at,m.id),'[]') from public.messages m where m.event_id=p_event and public.can_read_message(p_event,m.id)),
 'announcements',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from public.announcements a where a.event_id=p_event and a.deleted_at is null and (role='ADMIN' or role='GUEST' and public.can_receive_announcements(p_event))),
 'notification_schedules',(select coalesce(jsonb_agg(to_jsonb(s) order by s.scheduled_at,s.id),'[]') from public.notification_schedules s where s.event_id=p_event and role='ADMIN'),
 'notification_jobs',(select coalesce(jsonb_agg(to_jsonb(j)-'idempotency_key'-'provider_id'),'[]') from public.notification_jobs j where j.event_id=p_event and role='ADMIN'));
end $$;
revoke all on function public.app_snapshot(uuid) from public,anon;
grant execute on function public.app_snapshot(uuid) to authenticated,service_role;

-- A tombstone also protects direct Data API reads and the final worker admission.
alter policy announcement_read on public.announcements using(deleted_at is null and public.can_receive_announcements(event_id));
alter function public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean) rename to messaging_admission_core;
revoke all on function public.messaging_admission_core(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean) from public,anon,authenticated,service_role;
create function public.authorize_notification_attempt(p_event uuid,p_job uuid,p_guest uuid,p_channel public.delivery_channel,p_attempt integer,p_lease timestamptz,p_start boolean default false)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare mid uuid; tombstone timestamptz;
begin
 perform 1 from public.guests where id=p_guest and event_id=p_event for update;
 select coalesce(message_id,case when rule_id is not null and channel='IN_APP' then id end) into mid from public.notification_jobs where event_id=p_event and id=p_job;
 if mid is not null then
  select deleted_at into tombstone from public.messages where event_id=p_event and id=mid for share;
  if tombstone is not null then return jsonb_build_object('authorized',false,'reason','consent');end if;
 end if;
 return public.messaging_admission_core(p_event,p_job,p_guest,p_channel,p_attempt,p_lease,p_start);
end $$;
revoke all on function public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean) to service_role;

commit;
