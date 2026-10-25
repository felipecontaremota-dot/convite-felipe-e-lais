begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
-- Additive upgrade: old publications, provider receipts and migration ledger remain untouched.
create schema notification_private;
revoke all on schema notification_private from public,anon,authenticated;
alter table public.events add column notification_email_enabled boolean not null default false,
 add column notification_push_enabled boolean not null default false,
 add column notification_vapid_public text;
alter table public.messages add column published_at timestamptz,
 add column notification_origin text check(notification_origin in ('MANUAL','AUTOMATIC')),
 add column notification_rule_id uuid references public.notification_rules(id);
create unique index notification_rule_publication on public.messages(event_id,notification_rule_id) where notification_rule_id is not null;
create index notification_publications on public.messages(event_id,published_at desc,id desc) where published_at is not null;
-- Only historical general announcements with an explicit message link have proven provenance.
update public.messages m set published_at=a.created_at,notification_origin='MANUAL',notification_title=coalesce(m.notification_title,a.title)
from public.announcements a where a.event_id=m.event_id and a.message_id=m.id and a.deleted_at is null and m.deleted_at is null and m.from_admin and m.audience='GENERAL'
 and (select count(*) from public.announcements x where x.event_id=m.event_id and x.message_id=m.id and x.deleted_at is null)=1;
create table notification_private.rule_expirations(event_id uuid not null references public.events(id),rule_id uuid primary key references public.notification_rules(id),reason text not null,recorded_at timestamptz not null default now());
alter table notification_private.rule_expirations enable row level security;
create table public.web_push_subscriptions(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id),guest_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade,endpoint text not null unique check(length(endpoint) between 20 and 2048),
 p256dh text not null check(length(p256dh) between 80 and 100),auth_key text not null check(length(auth_key) between 20 and 30),
 active boolean not null default true,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(event_id,guest_id) references public.guests(event_id,id) on delete cascade);
alter table public.web_push_subscriptions enable row level security;
revoke all on public.web_push_subscriptions from public,anon,authenticated;
grant select,insert,update on public.web_push_subscriptions to service_role;
create index web_push_active_guest on public.web_push_subscriptions(event_id,guest_id) where active;
-- Device-level admission prevents repeating a successfully sent device when a different device fails.
create table notification_private.push_attempts(job_id uuid not null references public.notification_jobs(id) on delete cascade,subscription_id uuid not null references public.web_push_subscriptions(id) on delete cascade,status text not null check(status in ('started','sent','expired','failed','uncertain')),created_at timestamptz not null default now(),primary key(job_id,subscription_id));
alter table notification_private.push_attempts enable row level security;

create function notification_private.eligible(p_event uuid) returns setof uuid language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select g.id from public.guests g join public.invitations i on i.event_id=g.event_id and i.id=g.invitation_id
 where g.event_id=p_event and i.active and i.archived_at is null
$$;
create function notification_private.publish(p_event uuid,p_id uuid,p_title text,p_body text,p_channels public.delivery_channel[],p_actor uuid,p_origin text,p_rule uuid default null) returns uuid
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare tid uuid; ids uuid[];
begin
 perform pg_advisory_xact_lock(hashtextextended('notification:'||p_event,0));
 if exists(select 1 from public.messages where id=p_id and event_id=p_event and published_at is not null) then return p_id;end if;
 if length(trim(p_title)) not between 1 and 160 or length(trim(p_body)) not between 1 and 3800 or p_title is null or p_body is null then raise exception 'invalid notification content';end if;
 if coalesce(cardinality(p_channels),0)=0 or array_position(p_channels,null) is not null or not p_channels <@ '{IN_APP,PUSH,EMAIL}'::public.delivery_channel[] then raise exception 'invalid channels';end if;
 select array_agg(x) into ids from notification_private.eligible(p_event) x;
 if coalesce(cardinality(ids),0)=0 then raise exception 'no eligible recipients';end if;
 insert into public.message_threads(event_id) values(p_event) returning id into tid;
 insert into public.messages(id,event_id,thread_id,from_admin,sender_user_id,notification_title,content,channels,audience,published_at,notification_origin,notification_rule_id)
 values(p_id,p_event,tid,true,p_actor,trim(p_title),trim(p_body),p_channels,'GENERAL',clock_timestamp(),p_origin,p_rule);
 insert into public.message_recipients(event_id,message_id,guest_id) select p_event,p_id,unnest(ids);
 insert into public.notification_jobs(event_id,message_id,guest_id,channel,idempotency_key)
 select p_event,p_id,g,c,p_id||':'||g||':'||c from unnest(ids) g cross join unnest(p_channels) c where c<>'IN_APP' on conflict do nothing;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,p_actor,'NOTIFICATION_PUBLISHED','messages',p_id);
 return p_id;
end $$;

alter function public.admin_action(uuid,text,jsonb) rename to notification_admin_core;
revoke all on function public.notification_admin_core(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare sid uuid; ch public.delivery_channel[]; ids uuid[]; s public.notification_schedules; due timestamptz; result jsonb;
begin
 if p_action not in ('NOTIFICATION_PUBLISH','NOTIFICATION_SAVE','NOTIFICATION_CANCEL','RULE_SAVE','MESSAGE_DELETE') then return public.notification_admin_core(p_event,p_action,p_payload);end if;
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if p_action='MESSAGE_DELETE' then
  if exists(select 1 from public.messages where event_id=p_event and id=(p_payload->>'id')::uuid and published_at is not null) then raise exception 'published notification immutable';end if;
  return public.notification_admin_core(p_event,p_action,p_payload);
 end if;
 if p_action='RULE_SAVE' then
  select array_agg(distinct c::public.delivery_channel) into ch from jsonb_array_elements_text(p_payload->'channels') c;
  if coalesce(cardinality(ch),0)=0 or array_position(ch,null) is not null or not ch <@ '{IN_APP,PUSH,EMAIL}'::public.delivery_channel[] then raise exception 'invalid channels';end if;
  if length(trim(coalesce(p_payload->>'title',''))) not between 1 and 160 or length(trim(coalesce(p_payload->>'body',''))) not between 1 and 3800 then raise exception 'invalid notification content';end if;
  result=public.notification_admin_core(p_event,p_action,p_payload);
  insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'NOTIFICATION_RULE_UPDATED','notification_rules',(p_payload->>'id')::uuid);
  return result;
 end if;
 sid=(p_payload->>'id')::uuid;
 if sid is null then raise exception 'invalid notification id';end if;
 perform pg_advisory_xact_lock(hashtextextended('notification:'||p_event,0));
 select * into s from public.notification_schedules where id=sid for update;
 if found and s.event_id<>p_event then raise exception 'unauthorized';end if;
 if p_action='NOTIFICATION_CANCEL' then
  if s.id is null or s.status='dispatched' then raise exception 'already published';end if;
  return public.notification_admin_core(p_event,p_action,p_payload);
 end if;
 select array_agg(distinct c::public.delivery_channel) into ch from jsonb_array_elements_text(p_payload->'channels') c;
 if coalesce(cardinality(ch),0)=0 or not ch <@ '{IN_APP,PUSH,EMAIL}'::public.delivery_channel[] or p_payload->>'audience' is distinct from 'GENERAL' then raise exception 'invalid channels or audience';end if;
 if p_payload ? 'invitation_id' and nullif(p_payload->>'invitation_id','') is not null or p_payload ? 'recipient_guest_ids' then raise exception 'general recipients only';end if;
 if length(trim(coalesce(p_payload->>'title',''))) not between 1 and 160 or length(trim(coalesce(p_payload->>'body',''))) not between 1 and 3800 then raise exception 'invalid notification content';end if;
 if p_action='NOTIFICATION_PUBLISH' then
  if s.id is not null then raise exception 'schedule exists';end if;
  if exists(select 1 from public.messages where id=sid and (event_id<>p_event or published_at is null)) then raise exception 'invalid notification id';end if;
  if not exists(select 1 from public.messages where id=sid) and (select count(*) from public.messages where event_id=p_event and notification_origin='MANUAL' and published_at>now()-interval '1 hour')>=20 then raise exception 'notification rate limit';end if;
  perform notification_private.publish(p_event,sid,p_payload->>'title',p_payload->>'body',ch,auth.uid(),'MANUAL');
  return jsonb_build_object('ok',true,'id',sid,'published',true);
 end if;
 if not (select notification_scheduling_enabled from public.events where id=p_event) then raise exception 'notification scheduling not enabled';end if;
 due=(p_payload->>'scheduled_at')::timestamptz;
 if due is null or not isfinite(due) or due<=clock_timestamp() then raise exception 'invalid future date';end if;
 if exists(select 1 from public.messages where id=sid) then raise exception 'already published';end if;
 if s.id is not null and s.status<>'scheduled' then raise exception 'schedule immutable';end if;
 -- Safe network replay: identical creation is idempotent; modifications require the version.
 if s.id is not null and nullif(p_payload->>'version','') is null then
  if s.title=trim(p_payload->>'title') and s.body=trim(p_payload->>'body') and s.scheduled_at=due and s.channels=ch and s.active=coalesce((p_payload->>'active')::boolean,true) then return jsonb_build_object('ok',true,'id',sid,'duplicate',true);end if;
  raise exception 'conflict';
 end if;
 if s.id is not null and s.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 select array_agg(x) into ids from notification_private.eligible(p_event) x;
 if coalesce(cardinality(ids),0)=0 then raise exception 'no eligible recipients';end if;
 insert into public.notification_schedules(id,event_id,title,body,scheduled_at,audience,recipient_guest_ids,channels,active,created_by)
 values(sid,p_event,trim(p_payload->>'title'),trim(p_payload->>'body'),due,'GENERAL',ids,ch,coalesce((p_payload->>'active')::boolean,true),auth.uid())
 on conflict(id) do update set title=excluded.title,body=excluded.body,scheduled_at=excluded.scheduled_at,recipient_guest_ids=excluded.recipient_guest_ids,channels=excluded.channels,active=excluded.active,version=notification_schedules.version+1;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),p_action,'notification_schedules',sid);
 return jsonb_build_object('ok',true,'id',sid);
end $$;

create or replace function public.schedule_notifications() returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare s public.notification_schedules; r record; nid uuid;
begin
 -- No delegation to the old automatic core: its rules bypassed the activation gate.
 for s in select ns.* from public.notification_schedules ns join public.events e on e.id=ns.event_id
 where e.notification_scheduling_enabled and ns.status='scheduled' and ns.active and ns.scheduled_at<=clock_timestamp() order by ns.scheduled_at,ns.id for update of ns skip locked limit 50 loop
  if not pg_try_advisory_xact_lock(hashtextextended('notification:'||s.event_id,0)) then continue;end if;
  if s.audience<>'GENERAL' or not s.channels <@ '{IN_APP,PUSH,EMAIL}'::public.delivery_channel[] then
   update public.notification_schedules set status='cancelled',active=false,version=version+1 where id=s.id;
   insert into public.audit_logs(event_id,action,entity,entity_id) values(s.event_id,'NOTIFICATION_LEGACY_SCHEDULE_SKIPPED','notification_schedules',s.id);
  elsif exists(select 1 from notification_private.eligible(s.event_id)) then
   perform notification_private.publish(s.event_id,s.id,s.title,s.body,s.channels,s.created_by,'MANUAL');
   update public.notification_schedules set status='dispatched',version=version+1 where id=s.id;
  else
   update public.notification_schedules set status='cancelled',active=false,version=version+1 where id=s.id;
   insert into public.audit_logs(event_id,action,entity,entity_id) values(s.event_id,'NOTIFICATION_NO_RECIPIENTS','notification_schedules',s.id);
  end if;
 end loop;
 for r in select nr.*, e.starts_at-nr.days_before*interval '1 day' due from public.notification_rules nr join public.events e on e.id=nr.event_id
 where e.notification_scheduling_enabled and nr.active and e.starts_at-nr.days_before*interval '1 day'<=clock_timestamp()
 and not exists(select 1 from public.messages m where m.event_id=nr.event_id and m.notification_rule_id=nr.id)
 and not exists(select 1 from notification_private.rule_expirations x where x.rule_id=nr.id)
 order by due,nr.id for update of nr skip locked limit 50 loop
  if not pg_try_advisory_xact_lock(hashtextextended('notification:'||r.event_id,0)) then continue;end if;
  if r.due<clock_timestamp()-interval '1 hour' or not r.channels <@ '{IN_APP,PUSH,EMAIL}'::public.delivery_channel[] then
   insert into notification_private.rule_expirations(event_id,rule_id,reason) values(r.event_id,r.id,'Vencido há mais de uma hora ou canal descontinuado') on conflict do nothing;
   insert into public.audit_logs(event_id,action,entity,entity_id) values(r.event_id,'NOTIFICATION_RULE_EXPIRED','notification_rules',r.id);
  elsif exists(select 1 from notification_private.eligible(r.event_id)) then
   nid=gen_random_uuid();
   perform notification_private.publish(r.event_id,nid,r.title,r.body,r.channels,null,'AUTOMATIC',r.id);
  end if;
 end loop;
 -- Explicitly retire pending WhatsApp operations; do not delete history or alter admitted calls.
 update public.notification_jobs set status='skipped',last_error='Canal WhatsApp descontinuado',locked_at=null
 where channel='WHATSAPP' and status in ('pending','failed') and delivery_started_at is null;
end $$;

alter function public.can_read_message(uuid,uuid) rename to notification_visibility_core;
revoke all on function public.notification_visibility_core(uuid,uuid) from public,anon,authenticated,service_role;
create function public.can_read_message(p_event uuid,p_message uuid) returns boolean language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select case when exists(select 1 from public.messages where id=p_message and event_id=p_event and published_at is not null and notification_origin is not null) then
 public.event_role(p_event)='ADMIN' or public.event_role(p_event)='GUEST' and exists(select 1 from public.invitations where event_id=p_event and id=public.my_invitation(p_event) and active and archived_at is null)
 else public.notification_visibility_core(p_event,p_message) end
$$;
-- Policy OIDs follow a renamed function; alter only these references to the new wrapper.
alter policy guest_messages on public.messages using(public.can_read_message(event_id,id));
alter policy own_message_reads on public.message_reads using(reader_key=public.message_reader(event_id) and public.can_read_message(event_id,message_id));

create function public.notification_feed(p_event uuid,p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 if public.event_role(p_event) not in ('ADMIN','GUEST') or public.event_role(p_event) is null then raise exception 'unauthorized';end if;
 return (select coalesce(jsonb_agg(x order by x.published_at desc,x.id desc),'[]') from (
 select m.id,m.notification_title as title,m.content,m.published_at,m.notification_origin as origin,m.channels,(select count(*) from public.message_recipients where message_id=m.id) recipient_count,
 (select read_at from public.message_reads where message_id=m.id and reader_key=public.message_reader(p_event)) viewer_read_at
 from public.messages m where m.event_id=p_event and m.published_at is not null and public.can_read_message(p_event,m.id)
 and (p_before is null or (m.published_at,m.id)<(p_before,p_id)) order by m.published_at desc,m.id desc limit 20) x);
end $$;

-- Only a verified own-unit session can opt in. External flags remain off after install.
create function public.notification_preferences(p_event uuid,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare gid uuid; sid uuid; v_endpoint text;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'GUEST' then raise exception 'unauthorized';end if;
 gid=(p_payload->>'guest_id')::uuid;
 if not public.owns_guest(p_event,gid) or not exists(select 1 from notification_private.eligible(p_event) x where x=gid) then raise exception 'unauthorized';end if;
 perform 1 from public.guests where event_id=p_event and id=gid for update;
 if p_action='EMAIL' then
  if jsonb_typeof(p_payload->'enabled') is distinct from 'boolean' then raise exception 'invalid consent';end if;
  if (p_payload->>'enabled')::boolean and not exists(select 1 from public.guest_contacts where event_id=p_event and guest_id=gid and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' and not communications_revoked) then raise exception 'valid email and communications authorization required';end if;
  insert into public.guest_contacts(event_id,guest_id,consent_email) values(p_event,gid,(p_payload->>'enabled')::boolean) on conflict(guest_id) do update set consent_email=excluded.consent_email,consent_changed_at=now();
 elsif p_action='PUSH_REGISTER' then
  if not exists(select 1 from public.events where id=p_event and notification_push_enabled and notification_vapid_public is not null) then raise exception 'push unavailable';end if;
  if exists(select 1 from public.guest_contacts where event_id=p_event and guest_id=gid and communications_revoked) then raise exception 'communications revoked';end if;
  v_endpoint=p_payload->>'endpoint';
  if (select count(*) from public.web_push_subscriptions where event_id=p_event and guest_id=gid and active and endpoint<>v_endpoint)>=5 then raise exception 'push device limit';end if;
  -- Server-side allowlist prevents using subscriptions as an SSRF primitive.
  if v_endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/' then raise exception 'unsupported push endpoint';end if;
  if p_payload->>'p256dh' !~ '^[A-Za-z0-9_-]{87,88}$' or p_payload->>'auth' !~ '^[A-Za-z0-9_-]{22,24}$' then raise exception 'invalid push keys';end if;
  insert into public.web_push_subscriptions(event_id,guest_id,user_id,endpoint,p256dh,auth_key) values(p_event,gid,auth.uid(),v_endpoint,p_payload->>'p256dh',p_payload->>'auth')
  on conflict(endpoint) do update set event_id=excluded.event_id,guest_id=excluded.guest_id,user_id=excluded.user_id,p256dh=excluded.p256dh,auth_key=excluded.auth_key,active=true,updated_at=now()
  where web_push_subscriptions.user_id=auth.uid() and web_push_subscriptions.event_id=p_event returning id into sid;
  if sid is null then raise exception 'subscription owned by another session';end if;
  insert into public.guest_contacts(event_id,guest_id,consent_push) values(p_event,gid,true) on conflict(guest_id) do update set consent_push=true;
 elsif p_action='PUSH_REVOKE' then
  update public.web_push_subscriptions set active=false,updated_at=now() where event_id=p_event and guest_id=gid;
  update public.device_push_tokens set active=false where event_id=p_event and guest_id=gid;
  update public.guest_contacts set consent_push=false,consent_changed_at=now() where event_id=p_event and guest_id=gid;
 else raise exception 'invalid preference action';end if;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'NOTIFICATION_PREFERENCE_'||p_action,'guests',gid);
 return jsonb_build_object('ok',true);
end $$;

-- Existing lease/admission checks remain authoritative for all deliveries.
alter function public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean) rename to notification_admission_core;
revoke all on function public.notification_admission_core(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean) from public,anon,authenticated,service_role;
create function public.authorize_notification_attempt(p_event uuid,p_job uuid,p_guest uuid,p_channel public.delivery_channel,p_attempt integer,p_lease timestamptz,p_start boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 if p_channel='WHATSAPP' or not exists(select 1 from notification_private.eligible(p_event) x where x=p_guest) then
  update public.notification_jobs set status='skipped',last_error='Canal descontinuado ou convite inelegível',locked_at=null where id=p_job and event_id=p_event and status='processing' and attempts=p_attempt and locked_at=p_lease and delivery_started_at is null;
  return jsonb_build_object('authorized',false,'reason','consent');
 end if;
 if exists(select 1 from public.messages m join public.notification_jobs j on j.message_id=m.id where j.id=p_job and m.published_at is not null)
 and exists(select 1 from public.events where id=p_event and ((p_channel='EMAIL' and not notification_email_enabled) or (p_channel='PUSH' and not notification_push_enabled))) then
  update public.notification_jobs set status='skipped',last_error='Canal externo ainda não ativado',locked_at=null where id=p_job and event_id=p_event and status='processing' and attempts=p_attempt and locked_at=p_lease and delivery_started_at is null;
  return jsonb_build_object('authorized',false,'reason','consent');
 end if;
 return public.notification_admission_core(p_event,p_job,p_guest,p_channel,p_attempt,p_lease,p_start);
end $$;

create function public.notification_push_attempt(p_job uuid,p_subscription uuid,p_action text,p_status text default null) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 if p_action='START' then
  insert into notification_private.push_attempts(job_id,subscription_id,status) select p_job,p_subscription,'started'
  where exists(select 1 from public.notification_jobs j join public.web_push_subscriptions s on s.event_id=j.event_id and s.guest_id=j.guest_id where j.id=p_job and s.id=p_subscription and j.status='processing' and j.delivery_started_at is not null and s.active)
  on conflict do nothing;return found;
 elsif p_action='FINISH' and p_status in ('sent','expired','failed','uncertain') then
  update notification_private.push_attempts set status=p_status where job_id=p_job and subscription_id=p_subscription and status='started';return found;
 end if;
 raise exception 'invalid push attempt';
end $$;

-- Return work not started within an Edge invocation budget, retaining lease fencing.
create function public.release_notification_claims(p_claims jsonb) returns void language sql security definer set search_path=public,extensions,pg_temp as $$
 update public.notification_jobs j set status='pending',locked_at=null
 from jsonb_to_recordset(p_claims) as c(id uuid,attempts integer,locked_at timestamptz)
 where j.id=c.id and j.attempts=c.attempts and j.locked_at=c.locked_at and j.status='processing' and j.delivery_started_at is null
$$;
revoke all on function public.release_notification_claims(jsonb) from public,anon,authenticated;
grant execute on function public.release_notification_claims(jsonb) to service_role;

alter function public.app_mutate(uuid,uuid,text,jsonb) rename to notification_mutation_core;
revoke all on function public.notification_mutation_core(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 if p_type in ('MESSAGE_SEND','MESSAGE_SEND_TO_GUESTS','MESSAGE_REPLY') and coalesce(p_payload->'channels','[]') @> '["WHATSAPP"]'::jsonb then raise exception 'whatsapp notifications discontinued';end if;
 return public.notification_mutation_core(p_event,p_mutation,p_type,p_payload);
end $$;
revoke all on function public.app_mutate(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.app_mutate(uuid,uuid,text,jsonb) to authenticated,service_role;

alter function public.app_snapshot(uuid) rename to notification_snapshot_core;
revoke all on function public.notification_snapshot_core(uuid) from public,anon,authenticated,service_role;
create function public.app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb; role public.app_role:=public.event_role(p_event);
begin
 result=public.notification_snapshot_core(p_event);
 if role in ('ADMIN','GUEST') then
  result=result||jsonb_build_object('notification_publications',public.notification_feed(p_event),
  'notification_config',(select jsonb_build_object('email_enabled',notification_email_enabled,'push_enabled',notification_push_enabled,'vapid_public',notification_vapid_public) from public.events where id=p_event),
  'capabilities',coalesce(result->'capabilities','{}')||jsonb_build_object('general_notifications',true));
 end if;
 result=jsonb_set(result,'{announcements}',coalesce((select jsonb_agg(a) from jsonb_array_elements(result->'announcements') a where not exists(select 1 from public.messages m where m.id=nullif(a->>'message_id','')::uuid and m.published_at is not null)),'[]'));
 if role='ADMIN' then result=result||jsonb_build_object('notification_expired_rules',(select coalesce(jsonb_agg(to_jsonb(x) order by x.recorded_at desc),'[]') from notification_private.rule_expirations x where x.event_id=p_event));end if;
 -- Bound ordinary snapshots; older publication pages are available only through the authorized feed.
 result=jsonb_set(result,'{messages}',coalesce((select jsonb_agg(m) from jsonb_array_elements(result->'messages') m where m->>'published_at' is null),'[]'));
 return result;
end $$;
revoke all on function notification_private.eligible(uuid),notification_private.publish(uuid,uuid,text,text,public.delivery_channel[],uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.admin_action(uuid,text,jsonb),public.app_snapshot(uuid),public.can_read_message(uuid,uuid),public.notification_feed(uuid,timestamptz,uuid),public.notification_preferences(uuid,text,jsonb),public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean),public.notification_push_attempt(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_action(uuid,text,jsonb),public.app_snapshot(uuid),public.can_read_message(uuid,uuid),public.notification_feed(uuid,timestamptz,uuid),public.notification_preferences(uuid,text,jsonb) to authenticated;
grant execute on function public.app_snapshot(uuid),public.can_read_message(uuid,uuid),public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean),public.notification_push_attempt(uuid,uuid,text,text) to service_role;
-- schedule_notifications retains its pre-existing service_role-only grant.
commit;
