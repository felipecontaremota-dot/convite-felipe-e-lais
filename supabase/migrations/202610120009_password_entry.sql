begin;

-- Installation never repairs credentials or a previously installed resolver.
lock table public.invitations,public.invitation_access in access exclusive mode;
do $$
begin
 if exists(select 1 from pg_namespace where nspname='password_entry_private')
 or to_regprocedure('public.redeem_invitation_password(uuid,uuid,text,text)') is not null then raise exception 'password entry already installed or divergent';end if;
 if to_regprocedure('public.redeem_invitation(uuid,uuid,text,text,text)') is null
 or to_regprocedure('extensions.hmac(bytea,bytea,text)') is null
 or to_regprocedure('extensions.gen_random_bytes(integer)') is null then raise exception 'password entry baseline dependency missing';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.invitation_access'::regclass and contype='p')
 or not exists(select 1 from pg_constraint where conrelid='public.invitation_sessions'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (event_id, user_id)') then raise exception 'password entry baseline uniqueness missing';end if;
 if exists(select 1 from public.invitation_access a left join public.invitations i on i.id=a.invitation_id and i.event_id=a.event_id where i.id is null or a.pin !~ '^[0-9]{4}$') then raise exception 'password entry baseline access integrity invalid';end if;

end $$;

create schema password_entry_private authorization postgres;
revoke all on schema password_entry_private from public,anon,authenticated,service_role;
create table password_entry_private.derivation_key (
 singleton boolean primary key default true check(singleton),
 secret bytea not null check(octet_length(secret)=32), generation integer not null default 1 check(generation>0)
);
insert into password_entry_private.derivation_key(singleton,secret) values(true,extensions.gen_random_bytes(32));
create table password_entry_private.resolution (
 event_id uuid not null, fingerprint bytea not null check(octet_length(fingerprint)=32), invitation_id uuid not null unique,
 constraint password_entry_unique primary key(event_id,fingerprint),
 foreign key(event_id,invitation_id) references public.invitations(event_id,id) on delete cascade on update cascade
);
create table password_entry_private.attempt_limits (
 event_id uuid not null references public.events(id) on delete cascade,
 bucket text not null, attempts integer not null check(attempts>0), window_at timestamptz not null,
 primary key(event_id,bucket)
);
alter table password_entry_private.derivation_key enable row level security;
alter table password_entry_private.resolution enable row level security;
alter table password_entry_private.attempt_limits enable row level security;

-- HMAC protects a registry-only disclosure; a full DB backup still includes legacy PINs.
create function password_entry_private.fingerprint(p_event uuid,p_pin text) returns bytea
language sql stable security invoker set search_path=pg_catalog as $$
 select extensions.hmac(convert_to(p_event::text||':'||p_pin,'UTF8'),secret,'sha256') from password_entry_private.derivation_key where singleton;
$$;
-- This is the single eligibility definition used by synchronization, backfill and redeem.
create function password_entry_private.eligible_source(p_invitation uuid)
returns table(event_id uuid,invitation_id uuid,fingerprint bytea)
language sql stable security invoker set search_path=pg_catalog as $$
 select i.event_id,i.id,password_entry_private.fingerprint(i.event_id,a.pin)
 from public.invitations i join public.invitation_access a on a.invitation_id=i.id and a.event_id=i.event_id
 where i.id=p_invitation and i.active and i.archived_at is null and i.code_hash ~ '^[a-f0-9]{64}$' and a.pin ~ '^[0-9]{4}$';
$$;
-- The preflight also consumes the central eligibility definition. All provisional
-- private DDL/key generation rolls back on failure, before any backfill or trigger.
do $$declare collisions integer; affected integer;begin
 select count(*),count(distinct event_id) into collisions,affected from (
  select s.event_id,s.fingerprint from public.invitations i
  cross join lateral password_entry_private.eligible_source(i.id) s
  group by s.event_id,s.fingerprint having count(*)>1
 ) c;
 if collisions>0 then raise exception 'password entry preflight: % collision groups in % events; credentials unchanged',collisions,affected;end if;
end $$;
create function password_entry_private.synchronize(p_invitation uuid) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
declare source record;
begin
 -- Access writers also acquire this parent barrier before they can commit. Do not
 -- lock the access row here: its writer may already own it while waiting on the parent.
 perform 1 from public.invitations where id=p_invitation for no key update;
 select * into source from password_entry_private.eligible_source(p_invitation);
 if not found then delete from password_entry_private.resolution where invitation_id=p_invitation;return;end if;
 begin
  insert into password_entry_private.resolution(event_id,invitation_id,fingerprint) values(source.event_id,source.invitation_id,source.fingerprint)
  on conflict(invitation_id) do update set event_id=excluded.event_id,fingerprint=excluded.fingerprint
  where resolution.event_id is distinct from excluded.event_id or resolution.fingerprint is distinct from excluded.fingerprint;
 exception when unique_violation then raise exception using errcode='P0001',message='invitation password conflict';end;
end $$;
create function password_entry_private.source_changed() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid; old_id uuid; new_id uuid;
begin
 if tg_op='TRUNCATE' then delete from password_entry_private.resolution;return null;end if;
 if tg_table_name='invitations' then
  if tg_op<>'INSERT' then old_id=old.id;end if;
  if tg_op<>'DELETE' then new_id=new.id;end if;
 else
  if tg_op<>'INSERT' then old_id=old.invitation_id;end if;
  if tg_op<>'DELETE' then new_id=new.invitation_id;end if;
 end if;
 -- Acquire both parent barriers before reconciling a reassociation. Remove an
 -- obsolete source first; UUID ordering must not cause a transient self-collision.
 for target in select distinct x from unnest(array[old_id,new_id]) x where x is not null order by x loop
  perform 1 from public.invitations where id=target for no key update;
 end loop;
 if old_id is distinct from new_id and old_id is not null
 and not exists(select 1 from password_entry_private.eligible_source(old_id)) then
  delete from password_entry_private.resolution where invitation_id=old_id;
 end if;
 for target in select distinct x from unnest(array[old_id,new_id]) x where x is not null order by x loop
  perform password_entry_private.synchronize(target);
 end loop;
 return null;
end $$;
create trigger password_entry_invitation_sync after insert or update or delete on public.invitations
for each row execute function password_entry_private.source_changed();
create trigger password_entry_access_sync after insert or update or delete on public.invitation_access
for each row execute function password_entry_private.source_changed();
create trigger password_entry_invitation_truncate after truncate on public.invitations
for each statement execute function password_entry_private.source_changed();
create trigger password_entry_access_truncate after truncate on public.invitation_access
for each statement execute function password_entry_private.source_changed();

insert into password_entry_private.resolution(event_id,invitation_id,fingerprint)
select s.event_id,s.invitation_id,s.fingerprint from public.invitations i cross join lateral password_entry_private.eligible_source(i.id) s;
do $$begin
 if exists((select s.* from public.invitations i cross join lateral password_entry_private.eligible_source(i.id) s except select event_id,invitation_id,fingerprint from password_entry_private.resolution)
 union all (select event_id,invitation_id,fingerprint from password_entry_private.resolution except select s.* from public.invitations i cross join lateral password_entry_private.eligible_source(i.id) s)) then raise exception 'password entry backfill mismatch';end if;
end $$;

-- Only this pre-existing internal helper allocates NEW automatic credentials.
-- Explicit PIN writes never enter this retry path. Existing credentials are untouched.
create or replace function public.create_individual_access(p_event uuid,p_name text,p_phone text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare iid uuid; code text:=encode(extensions.gen_random_bytes(24),'hex'); password text;
 start_at integer; candidate integer; attempt integer; conflict_message text;
begin
 insert into public.invitations(event_id,name,kind,code_hash)
 values(p_event,p_name,'INDIVIDUAL',encode(extensions.digest(code,'sha256'),'hex')) returning id into iid;
 start_at=(get_byte(extensions.gen_random_bytes(2),0)*256+get_byte(extensions.gen_random_bytes(2),1))%10000;
 -- Traverse the finite domain without revisiting candidates. The availability read
 -- only avoids known conflicts; the registry constraint decides concurrent races.
 for attempt in -1..9999 loop
  if attempt=-1 and (p_phone is null or p_phone !~ '^[0-9]{10,11}$') then continue;end if;
  candidate=(start_at+attempt)%10000;
  password=case when attempt=-1 and p_phone ~ '^[0-9]{10,11}$' then right(p_phone,4)
   else lpad(candidate::text,4,'0') end;
  if exists(select 1 from password_entry_private.resolution
   where event_id=p_event and fingerprint=password_entry_private.fingerprint(p_event,password)) then continue;end if;
  begin
   insert into public.invitation_access(event_id,invitation_id,pin,sharing_code) values(p_event,iid,password,code);
   return iid;
  exception when sqlstate 'P0001' then
   get stacked diagnostics conflict_message=message_text;
   if conflict_message<>'invitation password conflict' then raise;end if;
   -- Subtransaction rolls back the rejected access and registry writes together.
  end;
 end loop;
 raise exception using errcode='P0001',message='initial invitation password allocation exhausted';
end $$;
alter function public.create_individual_access(uuid,text,text) owner to postgres;
revoke all on function public.create_individual_access(uuid,text,text) from public,anon,authenticated,service_role;

-- Separate root budgets cannot consume the existing exclusive-link quotas.
-- JWT user and event-wide budgets are enforced even when the origin signal is spoofed.
create function password_entry_private.attempt_allowed(p_event uuid,p_user uuid,p_origin text) returns boolean
language plpgsql security invoker set search_path=pg_catalog as $$
declare key text; n integer; period interval; maximum integer; allowed boolean:=true; instant timestamptz:=clock_timestamp();
begin
 foreach key in array array['event:day','event:quarter','origin:'||encode(password_entry_private.fingerprint(p_event,p_origin),'hex'),'user:'||p_user::text] loop
  period=case when key='event:day' then interval '1 day' else interval '15 minutes' end;
  maximum=case when key='event:day' then 200 when key='event:quarter' then 60 when key like 'origin:%' then 30 else 15 end;
  insert into password_entry_private.attempt_limits(event_id,bucket,attempts,window_at) values(p_event,key,1,instant)
  on conflict(event_id,bucket) do update set attempts=case when attempt_limits.window_at<=instant-period then 1 else attempt_limits.attempts+1 end,
   window_at=case when attempt_limits.window_at<=instant-period then instant else attempt_limits.window_at end returning attempts into n;
  if n>maximum then allowed=false;end if;
 end loop;
 return allowed;
end $$;
create function public.redeem_invitation_password(p_event uuid,p_user uuid,p_pin text,p_bucket text)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare target uuid; expected bytea; linked boolean;
begin
 if p_event is null or p_user is null or p_bucket is null or length(p_bucket)>128
 or not exists(select 1 from public.events where id=p_event)
 or not exists(select 1 from auth.users where id=p_user and is_anonymous)
 or exists(select 1 from public.user_roles where event_id=p_event and user_id=p_user) then return false;end if;
 if not password_entry_private.attempt_allowed(p_event,p_user,p_bucket) or p_pin is null or p_pin !~ '^[0-9]{4}$' then return false;end if;
 expected=password_entry_private.fingerprint(p_event,p_pin);
 select invitation_id into target from password_entry_private.resolution where event_id=p_event and fingerprint=expected;
 if not found then return false;end if;
 perform 1 from public.invitations where id=target and event_id=p_event for no key update;
 if not found or not exists(select 1 from password_entry_private.eligible_source(target) s where s.event_id=p_event and s.fingerprint=password_entry_private.fingerprint(p_event,p_pin)) then return false;end if;
 select exists(select 1 from public.invitation_sessions where event_id=p_event and user_id=p_user and invitation_id=target and pin_verified_at is not null) into linked;
 if linked then return true;end if;
 insert into public.invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values(p_event,p_user,target,clock_timestamp())
 on conflict(event_id,user_id) do update set invitation_id=excluded.invitation_id,pin_verified_at=excluded.pin_verified_at;
 update public.invitations set first_activated_at=coalesce(first_activated_at,clock_timestamp()) where id=target;
 insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,p_user,'ACTIVATION','invitations',target);
 return true;
end $$;

alter table password_entry_private.derivation_key owner to postgres;
alter table password_entry_private.resolution owner to postgres;
alter table password_entry_private.attempt_limits owner to postgres;
alter function password_entry_private.fingerprint(uuid,text) owner to postgres;
alter function password_entry_private.eligible_source(uuid) owner to postgres;
alter function password_entry_private.synchronize(uuid) owner to postgres;
alter function password_entry_private.source_changed() owner to postgres;
alter function password_entry_private.attempt_allowed(uuid,uuid,text) owner to postgres;
alter function public.redeem_invitation_password(uuid,uuid,text,text) owner to postgres;
revoke all on all tables in schema password_entry_private from public,anon,authenticated,service_role;
revoke all on all functions in schema password_entry_private from public,anon,authenticated,service_role;
revoke all on function public.redeem_invitation_password(uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.redeem_invitation_password(uuid,uuid,text,text) to service_role;
commit;
