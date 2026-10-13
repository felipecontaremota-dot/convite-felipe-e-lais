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
