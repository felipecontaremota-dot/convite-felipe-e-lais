begin;

-- Fail on structural drift before preserving the approved public implementations.
do $$
begin
 if to_regprocedure('public.app_mutate(uuid,uuid,text,jsonb)') is null
 or to_regprocedure('public.app_snapshot(uuid)') is null
 or to_regprocedure('public.app_mutate_v4(uuid,uuid,text,jsonb)') is null
 or to_regprocedure('public.app_snapshot_v5(uuid)') is null then raise exception 'profile baseline RPC missing';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='guest_contacts' and column_name='communications_revoked')
 or to_regprocedure('public.internal_mutation_core(uuid,uuid,text,jsonb)') is not null
 or to_regprocedure('public.internal_snapshot_core(uuid)') is not null
 or to_regprocedure('public.internal_can_receive_communication(uuid,uuid,public.delivery_channel)') is not null
 or to_regprocedure('public.can_receive_announcements(uuid)') is not null
 or to_regprocedure('public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)') is not null
 or to_regprocedure('public.finish_notification_attempt(uuid,uuid,integer,timestamptz,text,text,text,timestamptz)') is not null
 or to_regprocedure('public.app_mutate_v7(uuid,uuid,text,jsonb)') is not null
 or to_regprocedure('public.app_snapshot_v7(uuid)') is not null then raise exception 'profile baseline already changed';end if;
 if not exists(select 1 from pg_proc where oid='public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure and proargnames=array['p_event','p_mutation','p_type','p_payload'] and prorettype='jsonb'::regtype and prosecdef and proowner='postgres'::regrole and proconfig=array['search_path=public, extensions, pg_temp'] and md5(prosrc)='ef2fd1b7f6dd0dd55090b4fa8336d227')
 or not exists(select 1 from pg_proc where oid='public.app_snapshot(uuid)'::regprocedure and proargnames=array['p_event'] and prorettype='jsonb'::regtype and prosecdef and proowner='postgres'::regrole and proconfig=array['search_path=public, extensions, pg_temp'] and md5(prosrc)='20c1ef3917626d85a5a0da71c8365172') then raise exception 'profile baseline implementation mismatch';end if;
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('app_mutate','app_snapshot'))<>2 then raise exception 'profile public overload drift';end if;
 if has_function_privilege('anon','public.app_mutate(uuid,uuid,text,jsonb)','EXECUTE') or has_function_privilege('anon','public.app_snapshot(uuid)','EXECUTE') or not has_function_privilege('authenticated','public.app_mutate(uuid,uuid,text,jsonb)','EXECUTE') or not has_function_privilege('authenticated','public.app_snapshot(uuid)','EXECUTE') then raise exception 'profile baseline public ACL mismatch';end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'untrusted public schema writer';end if;
 if not exists(select 1 from pg_policy where polrelid='public.announcements'::regclass and polname='announcement_read' and pg_get_expr(polqual,polrelid) like '%event_role%GUEST%') then raise exception 'profile announcement policy mismatch';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_jobs'::regclass and conname='notification_jobs_status_check') then raise exception 'profile job status contract missing';end if;
end $$;

-- Preserve channel authorizations while applying a durable global opt-out.
alter table public.guest_contacts add column communications_revoked boolean not null default false;

-- The stored channel choices are not overwritten by the global gate.
create function public.internal_can_receive_communication(p_event uuid,p_guest uuid,p_channel public.delivery_channel)
returns boolean language sql stable security invoker set search_path=public,extensions,pg_temp as $$
 select exists(select 1 from public.guests g left join public.guest_contacts c on c.event_id=g.event_id and c.guest_id=g.id
 where g.event_id=p_event and g.id=p_guest and not coalesce(c.communications_revoked,false)
 and case p_channel when 'IN_APP' then coalesce(c.consent_in_app,true) when 'EMAIL' then coalesce(c.consent_email,false)
 when 'PUSH' then coalesce(c.consent_push,false) when 'WHATSAPP' then coalesce(c.consent_whatsapp,false) else false end);
$$;

-- This marker distinguishes a claimed job from an admitted provider attempt.
alter table public.notification_jobs add column delivery_started_at timestamptz;
alter table public.notification_jobs drop constraint notification_jobs_status_check;
alter table public.notification_jobs add constraint notification_jobs_status_check check(status in ('pending','processing','sent','failed','skipped','uncertain'));

alter function public.app_mutate(uuid,uuid,text,jsonb) rename to internal_mutation_core;
revoke all on function public.internal_mutation_core(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role public.app_role:=public.event_role(p_event); gid uuid; previous public.guest_contacts; revoked boolean; payload jsonb:=p_payload; response jsonb; prior jsonb;
begin
 if p_type is distinct from 'CONTACT_UPDATE' and p_type is distinct from 'PUSH_REGISTER' then return internal_mutation_core(p_event,p_mutation,p_type,p_payload);end if;
 if role is null or role not in ('ADMIN','GUEST') then raise exception 'unauthorized';end if;
 select result into prior from public.mutation_receipts where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 if found then return coalesce(prior,'{}'::jsonb)||jsonb_build_object('duplicate',true);end if;
 insert into public.mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then select result into prior from public.mutation_receipts where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;return coalesce(prior,'{}'::jsonb)||jsonb_build_object('duplicate',true);end if;
 gid=(p_payload->>'guest_id')::uuid;
 -- Serialize all contact updates and push registration for the same member.
 perform 1 from guests where id=gid and event_id=p_event for update;
 if not found then raise exception 'invalid guest';end if;
 if role='GUEST' and not owns_guest(p_event,gid) then raise exception 'unauthorized';end if;
 select * into previous from guest_contacts where event_id=p_event and guest_id=gid;
 if p_type='CONTACT_UPDATE' then
  revoked=coalesce(previous.communications_revoked,false);
  if p_payload ? 'communications_revoked' then
   if jsonb_typeof(p_payload->'communications_revoked') <> 'boolean' then raise exception 'invalid revocation';end if;
   revoked=(p_payload->>'communications_revoked')::boolean;
  end if;
  if p_payload ? 'communications_revoked' or coalesce(previous.communications_revoked,false) then
   -- The new Profile controls only the global gate, never authorizations.
   -- Restore from the database, not a stale or manipulated client snapshot.
   payload=payload||jsonb_build_object(
    'consent_in_app',coalesce(previous.consent_in_app,true),
    'consent_push',coalesce(previous.consent_push,false),
    'consent_email',coalesce(previous.consent_email,false),
    'consent_whatsapp',coalesce(previous.consent_whatsapp,false));
  end if;
  if length(coalesce(payload->>'email',previous.email,''))>320 or length(coalesce(payload->>'whatsapp',previous.whatsapp,''))>30 then raise exception 'invalid contact';end if;
  insert into guest_contacts(event_id,guest_id,email,whatsapp,consent_in_app,consent_push,consent_email,consent_whatsapp,communications_revoked)
  values(p_event,gid,coalesce(payload->>'email',previous.email,''),regexp_replace(coalesce(payload->>'whatsapp',previous.whatsapp,''),'[^0-9]','','g'),coalesce((payload->>'consent_in_app')::boolean,previous.consent_in_app,true),coalesce((payload->>'consent_push')::boolean,previous.consent_push,false),coalesce((payload->>'consent_email')::boolean,previous.consent_email,false),coalesce((payload->>'consent_whatsapp')::boolean,previous.consent_whatsapp,false),revoked)
  on conflict(guest_id) do update set email=excluded.email,whatsapp=excluded.whatsapp,consent_in_app=excluded.consent_in_app,consent_push=excluded.consent_push,consent_email=excluded.consent_email,consent_whatsapp=excluded.consent_whatsapp,communications_revoked=excluded.communications_revoked,consent_changed_at=now();
  if revoked or not coalesce((payload->>'consent_push')::boolean,previous.consent_push,false) then update device_push_tokens set active=false where event_id=p_event and guest_id=gid;end if;
  -- A confirmed opt-out cancels waiting attempts, never an already admitted external call.
  update public.notification_jobs j set status='skipped',last_error='Consentimento ausente/revogado',locked_at=null
  where j.event_id=p_event and j.guest_id=gid and j.delivery_started_at is null
    and j.status in ('pending','failed','processing')
    and not public.internal_can_receive_communication(p_event,gid,j.channel);
 else
  if not public.internal_can_receive_communication(p_event,gid,'PUSH') or p_payload->>'token' is null or p_payload->>'token' !~ '^(ExponentPushToken|ExpoPushToken)\[.{1,200}\]$' then raise exception 'push not allowed';end if;
  insert into device_push_tokens(event_id,guest_id,user_id,token,platform) values(p_event,gid,auth.uid(),p_payload->>'token',p_payload->>'platform') on conflict(event_id,user_id,guest_id,token) do update set active=true;
 end if;
 response=jsonb_build_object('ok',true,'id',null);
 update public.mutation_receipts set result=response where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 return response;
end $$;
revoke all on function public.app_mutate(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.app_mutate(uuid,uuid,text,jsonb) to authenticated,service_role;

create or replace function public.can_read_message(p_event uuid,p_message uuid) returns boolean
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select exists(select 1 from messages m where m.event_id=p_event and m.id=p_message and (
   event_role(p_event)='ADMIN' or
   event_role(p_event)='GUEST' and m.channels @> '{IN_APP}'::delivery_channel[] and (
     m.from_admin and exists(
       select 1 from message_recipients r
       where r.event_id=p_event and r.message_id=m.id and owns_guest(p_event,r.guest_id)
         and public.internal_can_receive_communication(p_event,r.guest_id,'IN_APP')
     ) or
     not m.from_admin and m.invitation_id=my_invitation(p_event)
   )
 ));
$$;

-- Share the guest access rule between direct Data API reads and snapshots.
-- SECURITY DEFINER avoids evaluating this through unrelated table RLS.
create function public.can_receive_announcements(p_event uuid) returns boolean
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select event_role(p_event)='GUEST' and exists(
   select 1 from guests g
   where g.event_id=p_event and owns_guest(p_event,g.id)
     and public.internal_can_receive_communication(p_event,g.id,'IN_APP')
 );
$$;
revoke all on function public.can_receive_announcements(uuid) from public,anon;
grant execute on function public.can_receive_announcements(uuid) to authenticated;
alter policy announcement_read on public.announcements using(can_receive_announcements(event_id));
-- The separate admin_read policy remains unchanged.

-- General IN_APP notices remain visible to authorized members of a shared
-- access unit. With no authorized member, direct reads and snapshots agree.
alter function public.app_snapshot(uuid) rename to internal_snapshot_core;
revoke all on function public.internal_snapshot_core(uuid) from public,anon,authenticated,service_role;
create function public.app_snapshot(p_event uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb;
begin
 result=internal_snapshot_core(p_event);
 if event_role(p_event)='GUEST' and not can_receive_announcements(p_event) then
   result=result||jsonb_build_object('announcements','[]'::jsonb);
 end if;
 return result;
end $$;
revoke all on function public.app_snapshot(uuid) from public,anon;
grant execute on function public.app_snapshot(uuid) to authenticated,service_role;

-- Admission and contact changes share the guest lock. Only the current lease can start once.
create function public.authorize_notification_attempt(p_event uuid,p_job uuid,p_guest uuid,p_channel public.delivery_channel,p_attempt integer,p_lease timestamptz,p_start boolean default false)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare j public.notification_jobs;
begin
 perform 1 from public.guests where id=p_guest and event_id=p_event for update;
 if not found then return jsonb_build_object('authorized',false,'reason','invalid_job');end if;
 select * into j from public.notification_jobs where id=p_job and event_id=p_event for update;
 if not found or j.guest_id is distinct from p_guest or j.channel is distinct from p_channel then return jsonb_build_object('authorized',false,'reason','invalid_job');end if;
 if j.status='skipped' and j.last_error like 'Consentimento%' then return jsonb_build_object('authorized',false,'reason','consent');end if;
 if j.status<>'processing' or j.attempts is distinct from p_attempt or j.locked_at is distinct from p_lease or p_lease is null or p_lease<clock_timestamp()-interval '10 minutes' then return jsonb_build_object('authorized',false,'reason','lease');end if;
 if j.delivery_started_at is not null then
  -- Never reclaim a provider call whose outcome was lost; no new attempt is admitted.
  return jsonb_build_object('authorized',false,'reason','in_progress');
 end if;
 if not public.internal_can_receive_communication(p_event,p_guest,p_channel)
 or (j.rule_id is not null and not exists(select 1 from public.notification_rules where id=j.rule_id and event_id=p_event and active)) then
  update public.notification_jobs set status='skipped',last_error='Consentimento ausente/revogado ou regra desativada',locked_at=null where id=j.id;
  return jsonb_build_object('authorized',false,'reason','consent');
 end if;
 if p_start then update public.notification_jobs set delivery_started_at=clock_timestamp() where id=j.id returning delivery_started_at into j.delivery_started_at;end if;
 return jsonb_build_object('authorized',true,'admission',j.delivery_started_at);
end $$;

create function public.finish_notification_attempt(p_event uuid,p_job uuid,p_attempt integer,p_lease timestamptz,p_status text,p_provider text,p_provider_id text default null,p_admission timestamptz default null)
returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare j public.notification_jobs;
begin
 if p_status not in ('sent','failed','skipped','uncertain') or p_status is null then raise exception 'invalid delivery status';end if;
 select * into j from public.notification_jobs where id=p_job and event_id=p_event for update;
 if not found or j.status<>'processing' or j.attempts is distinct from p_attempt or j.locked_at is distinct from p_lease or p_lease is null or j.delivery_started_at is distinct from p_admission then return false;end if;
 update public.notification_jobs set status=p_status,locked_at=null,
 delivery_started_at=case when p_status='uncertain' then delivery_started_at else null end,
 last_error=case p_status when 'uncertain' then 'Resultado externo não confirmado; não reenviar automaticamente' when 'failed' then 'Falha definitiva de entrega' when 'skipped' then 'Entrega não realizada' else null end,
 next_attempt_at=clock_timestamp()+interval '5 minutes'
 where id=j.id;
 insert into public.delivery_attempts(event_id,job_id,status,provider,provider_id,error)
 values(p_event,p_job,p_status,p_provider,p_provider_id,case when p_status='uncertain' then 'Resultado externo não confirmado' when p_status='failed' then 'Falha definitiva de entrega' else null end);
 return true;
end $$;

-- Explicit final ACLs do not rely on the differing clean-install/production grants.
alter function public.internal_mutation_core(uuid,uuid,text,jsonb) owner to postgres;
alter function public.internal_snapshot_core(uuid) owner to postgres;
alter function public.app_mutate(uuid,uuid,text,jsonb) owner to postgres;
alter function public.app_snapshot(uuid) owner to postgres;
alter function public.internal_can_receive_communication(uuid,uuid,public.delivery_channel) owner to postgres;
alter function public.can_read_message(uuid,uuid) owner to postgres;
alter function public.can_receive_announcements(uuid) owner to postgres;
alter function public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean) owner to postgres;
alter function public.finish_notification_attempt(uuid,uuid,integer,timestamptz,text,text,text,timestamptz) owner to postgres;
revoke all on function public.internal_can_receive_communication(uuid,uuid,public.delivery_channel),public.internal_mutation_core(uuid,uuid,text,jsonb),public.internal_snapshot_core(uuid) from public,anon,authenticated,service_role;
revoke all on function public.app_mutate(uuid,uuid,text,jsonb),public.app_snapshot(uuid),public.can_read_message(uuid,uuid),public.can_receive_announcements(uuid),public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean),public.finish_notification_attempt(uuid,uuid,integer,timestamptz,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.app_mutate(uuid,uuid,text,jsonb),public.app_snapshot(uuid),public.can_read_message(uuid,uuid) to authenticated,service_role;
grant execute on function public.can_receive_announcements(uuid) to authenticated;
grant execute on function public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean),public.finish_notification_attempt(uuid,uuid,integer,timestamptz,text,text,text,timestamptz) to service_role;

-- A crashed admitted attempt is uncertain, not an automatically retryable lease.
create or replace function public.claim_notifications(p_limit integer default 50)
returns setof public.notification_jobs language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 update public.notification_jobs set status='uncertain',last_error='Resultado externo não confirmado; não reenviar automaticamente',locked_at=null
 where status='processing' and delivery_started_at is not null and locked_at<clock_timestamp()-interval '10 minutes';
 return query update public.notification_jobs set status='processing',locked_at=clock_timestamp(),attempts=attempts+1
 where id in(select id from public.notification_jobs where delivery_started_at is null and attempts<6
 and ((status in ('pending','failed') and next_attempt_at<=now()) or (status='processing' and locked_at<clock_timestamp()-interval '10 minutes'))
 order by created_at,id for update skip locked limit greatest(0,least(p_limit,50))) returning *;
end $$;
create or replace function public.claim_event_notifications(p_event uuid,p_limit integer default 50,p_message uuid default null)
returns setof public.notification_jobs language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 update public.notification_jobs set status='uncertain',last_error='Resultado externo não confirmado; não reenviar automaticamente',locked_at=null
 where event_id=p_event and (p_message is null or message_id=p_message) and status='processing'
 and delivery_started_at is not null and locked_at<clock_timestamp()-interval '10 minutes';
 return query update public.notification_jobs set status='processing',locked_at=clock_timestamp(),attempts=attempts+1
 where id in(select id from public.notification_jobs where event_id=p_event and (p_message is null or message_id=p_message)
 and delivery_started_at is null and attempts<6
 and ((status in ('pending','failed') and next_attempt_at<=now()) or (status='processing' and locked_at<clock_timestamp()-interval '10 minutes'))
 order by created_at,id for update skip locked limit greatest(0,least(p_limit,50))) returning *;
end $$;
alter function public.claim_notifications(integer) owner to postgres;
alter function public.claim_event_notifications(uuid,integer,uuid) owner to postgres;
revoke all on function public.claim_notifications(integer),public.claim_event_notifications(uuid,integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.claim_notifications(integer),public.claim_event_notifications(uuid,integer,uuid) to service_role;

commit;
