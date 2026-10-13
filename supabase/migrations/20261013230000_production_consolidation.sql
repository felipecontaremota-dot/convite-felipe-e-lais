-- Production consolidation: baseline 007 -> current canonical state.
-- Target: production databases whose last applied canonical migration is
-- 202610110007_home_greeting.sql.
--
-- This migration intentionally DOES NOT install the superseded password-only
-- architecture from 202610120009_password_entry.sql.
--
-- It composes the approved profile/consent changes (008) followed by the
-- definitive name + PIN access architecture. Existing functional data and
-- credentials are preserved by the underlying migrations.
--
-- IMPORTANT: keep this file for controlled production application. Do not use
-- an automatic db push that also installs historical 008/009/010 around it.

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

-- Definitive public access layer (name + unit PIN); 009 is intentionally skipped.

begin;
-- Incremental replacement of password-only entry. Existing public rows and credentials
-- are never rewritten. Colliding legacy combinations are indexed, but fail closed.
lock table public.invitations, public.invitation_access, public.guests in access exclusive mode;
create extension if not exists unaccent with schema extensions;
create schema name_pin_private authorization postgres;
revoke all on schema name_pin_private from public, anon, authenticated, service_role;
create collation name_pin_private.canonical_case (provider=icu, locale='und', deterministic=true);
create table name_pin_private.derivation_key (
 singleton boolean primary key default true check(singleton),
 secret bytea not null check(octet_length(secret)=32)
);
insert into name_pin_private.derivation_key values(true,extensions.gen_random_bytes(32));
create table name_pin_private.aliases (
 event_id uuid not null, name_fingerprint bytea not null check(octet_length(name_fingerprint)=32),
 pin_fingerprint bytea not null check(octet_length(pin_fingerprint)=32), invitation_id uuid not null,
 primary key(event_id,name_fingerprint,pin_fingerprint,invitation_id),
 foreign key(event_id,invitation_id) references public.invitations(event_id,id) on delete cascade
);
create index name_pin_invitation on name_pin_private.aliases(invitation_id);
create table name_pin_private.attempt_limits (
 event_id uuid not null references public.events(id) on delete cascade,
 bucket text not null, attempts integer not null check(attempts>0), window_at timestamptz not null,
 primary key(event_id,bucket)
);
alter table name_pin_private.derivation_key enable row level security;
alter table name_pin_private.aliases enable row level security;
alter table name_pin_private.attempt_limits enable row level security;

create function name_pin_private.normalize_name(value text) returns text
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare result text; cp integer;
begin
 if value is null or length(value)>400 or octet_length(value)>1600 then return null;end if;
 result=normalize(value,NFKC);
 -- Explicit Unicode White_Space policy; controls/format characters are rejected.
 foreach cp in array array[9,10,11,12,13,133,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288] loop
  result=replace(result,chr(cp),' ');
 end loop;
 if result ~ '[[:cntrl:]]' then return null;end if;
 foreach cp in array array[173,1564,6158,8203,8204,8205,8206,8207,8234,8235,8236,8237,8238,8288,8289,8290,8291,8292,8293,8294,8295,8296,8297,65279,847,8298,8299,8300,8301,8302,8303,65529,65530,65531] loop
  if strpos(result,chr(cp))>0 then return null;end if;
 end loop;
 if result ~ ('['||chr(65024)||'-'||chr(65039)||chr(917760)||'-'||chr(917999)||chr(917536)||'-'||chr(917631)||']') then return null;end if;
 result=upper(extensions.unaccent('extensions.unaccent'::regdictionary,result) collate name_pin_private.canonical_case);
 result=btrim(regexp_replace(result,' +',' ','g'));
 if length(result)<1 or length(result)>200 then return null;end if;
 return result;
end $$;
create function name_pin_private.fingerprint(p_event uuid,p_purpose text,p_value text) returns bytea
language sql stable security invoker set search_path=pg_catalog as $$
 select extensions.hmac(convert_to(p_purpose||':'||p_event::text||':'||length(p_value)::text||':'||p_value,'UTF8'),secret,'sha256')
 from name_pin_private.derivation_key where singleton;
$$;
create function name_pin_private.sources(p_invitation uuid)
returns table(event_id uuid,name_fingerprint bytea,pin_fingerprint bytea,invitation_id uuid)
language sql stable security invoker set search_path=pg_catalog as $$
 select distinct i.event_id,name_pin_private.fingerprint(i.event_id,'name:v1',n.value),
 name_pin_private.fingerprint(i.event_id,'pin:v1',a.pin),i.id
 from public.invitations i join public.invitation_access a on a.event_id=i.event_id and a.invitation_id=i.id
 join public.guests g on g.event_id=i.event_id and g.invitation_id=i.id
 cross join lateral (select name_pin_private.normalize_name(g.name) value) n
 where i.id=p_invitation and i.active and i.archived_at is null
 and i.code_hash ~ '^[a-f0-9]{64}$' and a.pin ~ '^[0-9]{4}$' and n.value is not null;
$$;
create function name_pin_private.source_lock() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare e uuid;
begin
 -- Canonical admin_action already takes this event lock BEFORE locking rows.
 -- Redemption takes it too, so a member/PIN change cannot race its validation.
 for e in select distinct x from unnest(array[case when tg_op<>'INSERT' then old.event_id end,case when tg_op<>'DELETE' then new.event_id end]) x where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtextextended('admin:'||e::text,0));
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create function name_pin_private.source_changed() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid; before_id uuid; after_id uuid;
begin
 if tg_op='TRUNCATE' then delete from name_pin_private.aliases;return null;end if;
 if tg_table_name='invitations' then
  if tg_op<>'INSERT' then before_id=old.id;end if;
  if tg_op<>'DELETE' then after_id=new.id;end if;
 else
  if tg_op<>'INSERT' then before_id=old.invitation_id;end if;
  if tg_op<>'DELETE' then after_id=new.invitation_id;end if;
 end if;
 for target in select distinct x from unnest(array[before_id,after_id]) x where x is not null order by x loop
  delete from name_pin_private.aliases where invitation_id=target;
  insert into name_pin_private.aliases select * from name_pin_private.sources(target);
 end loop;
 return null;
end $$;
-- Retire 009 synchronization: global PIN uniqueness is incompatible with homonyms.
drop trigger if exists password_entry_invitation_sync on public.invitations;
drop trigger if exists password_entry_access_sync on public.invitation_access;
drop trigger if exists password_entry_invitation_truncate on public.invitations;
drop trigger if exists password_entry_access_truncate on public.invitation_access;
create or replace function public.redeem_invitation_password(p_event uuid,p_user uuid,p_pin text,p_bucket text)
returns boolean language sql security definer set search_path=pg_catalog as $$ select false $$;
revoke all on function public.redeem_invitation_password(uuid,uuid,text,text) from public,anon,authenticated,service_role;
create or replace function public.create_individual_access(p_event uuid,p_name text,p_phone text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare iid uuid; code text:=encode(extensions.gen_random_bytes(24),'hex'); pin text; bytes bytea;
begin
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event::text,0));
 bytes=extensions.gen_random_bytes(2);
 pin=case when p_phone ~ '^[0-9]{10,11}$' then right(p_phone,4)
 else lpad(((get_byte(bytes,0)*256+get_byte(bytes,1))%10000)::text,4,'0') end;
 insert into public.invitations(event_id,name,kind,code_hash)
 values(p_event,p_name,'INDIVIDUAL',encode(extensions.digest(code,'sha256'),'hex')) returning id into iid;
 insert into public.invitation_access(event_id,invitation_id,pin,sharing_code) values(p_event,iid,pin,code);
 return iid;
end $$;
create trigger name_pin_invitation_lock before insert or update or delete on public.invitations for each row execute function name_pin_private.source_lock();
create trigger name_pin_access_lock before insert or update or delete on public.invitation_access for each row execute function name_pin_private.source_lock();
create trigger name_pin_guest_lock before insert or update or delete on public.guests for each row execute function name_pin_private.source_lock();
create trigger name_pin_invitation_sync after insert or update or delete on public.invitations for each row execute function name_pin_private.source_changed();
create trigger name_pin_access_sync after insert or update or delete on public.invitation_access for each row execute function name_pin_private.source_changed();
create trigger name_pin_guest_sync after insert or update or delete on public.guests for each row execute function name_pin_private.source_changed();
create trigger name_pin_invitation_truncate after truncate on public.invitations for each statement execute function name_pin_private.source_changed();
create trigger name_pin_access_truncate after truncate on public.invitation_access for each statement execute function name_pin_private.source_changed();
create trigger name_pin_guest_truncate after truncate on public.guests for each statement execute function name_pin_private.source_changed();
insert into name_pin_private.aliases select s.* from public.invitations i cross join lateral name_pin_private.sources(i.id) s;

create function name_pin_private.attempt_allowed(p_event uuid,p_user uuid,p_origin text,p_name text) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare key text; n integer; maximum integer; period interval; allowed boolean:=true; instant timestamptz:=clock_timestamp();
begin
 foreach key in array array['event:day','event:quarter','origin:'||encode(name_pin_private.fingerprint(p_event,'origin:v1',p_origin),'hex'),'user:'||p_user::text,'name:'||encode(name_pin_private.fingerprint(p_event,'attempt-name:v1',p_name),'hex')] loop
  if key like 'origin:%' and p_origin='unknown' then continue;end if;
  period=case when key='event:day' then interval '1 day' else interval '15 minutes' end;
  maximum=case when key='event:day' then 1000 when key='event:quarter' then 200 when key like 'origin:%' then 30 else 15 end;
  insert into name_pin_private.attempt_limits values(p_event,key,1,instant)
  on conflict(event_id,bucket) do update set attempts=case when attempt_limits.window_at<=instant-period then 1 else attempt_limits.attempts+1 end,
  window_at=case when attempt_limits.window_at<=instant-period then instant else attempt_limits.window_at end returning attempts into n;
  if n>maximum then allowed=false;end if;
 end loop;
 return allowed;
end $$;
create function public.redeem_invitation_by_name(p_event uuid,p_user uuid,p_name text,p_pin text,p_bucket text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare normalized text; nf bytea; pf bytea; targets uuid[]; target uuid;
begin
 if p_event is null or p_user is null or p_bucket is null or length(p_bucket)>128
 or not exists(select 1 from public.events where id=p_event)
 or not exists(select 1 from auth.users where id=p_user and is_anonymous)
 or exists(select 1 from public.user_roles where event_id=p_event and user_id=p_user) then return null;end if;
 normalized=name_pin_private.normalize_name(p_name);
 if not name_pin_private.attempt_allowed(p_event,p_user,p_bucket,coalesce(normalized,'<invalid>'))
 or normalized is null or p_pin is null or p_pin !~ '^[0-9]{4}$' then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event::text,0));
 nf=name_pin_private.fingerprint(p_event,'name:v1',normalized);
 pf=name_pin_private.fingerprint(p_event,'pin:v1',p_pin);
 select array_agg(distinct a.invitation_id) into targets from name_pin_private.aliases a
 where a.event_id=p_event and a.name_fingerprint=nf and a.pin_fingerprint=pf;
 if coalesce(cardinality(targets),0)<>1 then return null;end if;
 target=targets[1];
 perform 1 from public.invitations where id=target and event_id=p_event for no key update;
 if not found or not exists(select 1 from name_pin_private.sources(target) s
 where s.event_id=p_event and s.name_fingerprint=nf and s.pin_fingerprint=pf) then return null;end if;
 if exists(select 1 from public.invitation_sessions where event_id=p_event and user_id=p_user and invitation_id=target and pin_verified_at is not null) then return jsonb_build_object('linked',true,'invitation_id',target);end if;
 insert into public.invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values(p_event,p_user,target,clock_timestamp())
 on conflict(event_id,user_id) do update set invitation_id=excluded.invitation_id,pin_verified_at=excluded.pin_verified_at;
 update public.invitations set first_activated_at=coalesce(first_activated_at,clock_timestamp()) where id=target;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,p_user,'ACTIVATION','invitations',target);
 return jsonb_build_object('linked',true,'invitation_id',target);
end $$;
create or replace function public.my_invitation(p_event uuid) returns uuid
language sql stable security definer set search_path=pg_catalog as $$
 select s.invitation_id from public.invitation_sessions s join public.invitations i on i.id=s.invitation_id and i.event_id=s.event_id
 where s.event_id=p_event and s.user_id=auth.uid() and i.active and i.archived_at is null and s.pin_verified_at is not null;
$$;
-- Add the authoritative binding for post-login checks; ADMIN-only conflict metadata.
alter function public.app_snapshot(uuid) rename to name_pin_snapshot_core;
revoke all on function public.name_pin_snapshot_core(uuid) from public,anon,authenticated,service_role;
create function public.app_snapshot(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 result=public.name_pin_snapshot_core(p_event)||jsonb_build_object('current_invitation_id',public.my_invitation(p_event));
 if public.event_role(p_event)='ADMIN' then
  result=jsonb_set(result,'{invitations}',coalesce((select jsonb_agg(i||jsonb_build_object('name_login_conflict',exists(
   select 1 from name_pin_private.aliases a join name_pin_private.aliases b on b.event_id=a.event_id and b.name_fingerprint=a.name_fingerprint and b.pin_fingerprint=a.pin_fingerprint and b.invitation_id<>a.invitation_id
   where a.invitation_id=(i->>'id')::uuid))) from jsonb_array_elements(result->'invitations') i),'[]'::jsonb));
 end if;
 return result;
end $$;
revoke all on all tables in schema name_pin_private from public,anon,authenticated,service_role;
revoke all on all functions in schema name_pin_private from public,anon,authenticated,service_role;
revoke all on function public.redeem_invitation_by_name(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.redeem_invitation_by_name(uuid,uuid,text,text,text) to service_role;
revoke all on function public.app_snapshot(uuid) from public,anon;
grant execute on function public.app_snapshot(uuid) to authenticated,service_role;
revoke all on function public.create_individual_access(uuid,text,text) from public,anon,authenticated,service_role;
-- All private objects are created/owned by the migration's postgres role.
alter function public.redeem_invitation_by_name(uuid,uuid,text,text,text) owner to postgres;
alter function public.create_individual_access(uuid,text,text) owner to postgres;
alter function public.app_snapshot(uuid) owner to postgres;

-- Legacy credentials unchanged; share the event barrier and reject archived units.
create or replace function identify_invitation(p_event uuid,p_user uuid,p_code text,p_bucket text) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare i invitations;begin
 if not exists(select 1 from auth.users where id=p_user and is_anonymous) or not invitation_attempt_allowed(p_event,p_user,p_code,p_bucket,true) then return null;end if;
 if p_code !~ '^[A-Za-z0-9_-]{32,64}$' then return null;end if;
 select * into i from invitations where event_id=p_event and active and archived_at is null and code_hash=encode(digest(p_code,'sha256'),'hex');
 if not found then return null;end if;
 return jsonb_build_object('name',i.name,'activated',exists(select 1 from invitation_sessions where event_id=p_event and user_id=p_user and invitation_id=i.id and pin_verified_at is not null));
end $$;
create or replace function redeem_invitation(p_event uuid,p_user uuid,p_code text,p_pin text,p_bucket text) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare i invitations;allowed boolean;begin
 if not exists(select 1 from auth.users where id=p_user and is_anonymous) or exists(select 1 from user_roles where event_id=p_event and user_id=p_user) then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event::text,0));
 allowed=invitation_attempt_allowed(p_event,p_user,p_code,p_bucket);
 select * into i from invitations where event_id=p_event and active and archived_at is null and code_hash=encode(digest(p_code,'sha256'),'hex') for update;
 if not allowed or i.id is null or p_code !~ '^[A-Za-z0-9_-]{32,64}$' or p_pin is null or p_pin !~ '^[0-9]{4}$'
 or not exists(select 1 from invitation_access where invitation_id=i.id and event_id=p_event and pin=p_pin) then
  if exists(select 1 from events where id=p_event) then insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,p_user,'ACTIVATION_FAILED','invitations',i.id);end if;
  return false;
 end if;
 insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values(p_event,p_user,i.id,now())
 on conflict(event_id,user_id) do update set invitation_id=excluded.invitation_id,pin_verified_at=now();
 update invitations set first_activated_at=coalesce(first_activated_at,now()) where id=i.id;
 insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,p_user,'ACTIVATION','invitations',i.id);
 return true;
end $$;

-- Return the exact committed target, detecting concurrent switches of this UID.
-- No code/PIN/name is returned.
create function public.redeem_invitation_link(p_event uuid,p_user uuid,p_code text,p_pin text,p_bucket text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid;
begin
 if not public.redeem_invitation(p_event,p_user,p_code,p_pin,p_bucket) then return null;end if;
 select invitation_id into target from public.invitation_sessions where event_id=p_event and user_id=p_user;
 return jsonb_build_object('linked',true,'invitation_id',target);
end $$;
alter function public.redeem_invitation_link(uuid,uuid,text,text,text) owner to postgres;
revoke all on function public.redeem_invitation_link(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.redeem_invitation_link(uuid,uuid,text,text,text) to service_role;

commit;
