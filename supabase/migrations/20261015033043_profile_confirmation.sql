begin;
set local lock_timeout='5s';
-- Install at the existing profile delegation layer, so old and new public wrappers
-- (name/PIN and messaging) keep their OIDs, behavior and capabilities.
do $baseline$
declare definition text; item text;
begin
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'untrusted public schema writer';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and (table_name='guests' and column_name='profile_confirmed_at' or table_name='invitation_sessions' and column_name='profile_guest_id')) or to_regprocedure('public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)') is not null or to_regprocedure('public.profile_confirmation_snapshot_core(uuid)') is not null then raise exception 'profile confirmation partial or already installed';end if;
 if to_regprocedure('public.internal_mutation_core(uuid,uuid,text,jsonb)') is null or to_regprocedure('public.internal_snapshot_core(uuid)') is null or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='guest_contacts' and column_name='communications_revoked') then raise exception 'profile confirmation requires profile/consent baseline';end if;
 foreach item in array array['public.internal_mutation_core(uuid,uuid,text,jsonb)','public.internal_snapshot_core(uuid)'] loop
  if not exists(select 1 from pg_proc where oid=to_regprocedure(item) and proowner='postgres'::regrole and prosecdef and prorettype='jsonb'::regtype and proconfig=array['search_path=public, extensions, pg_temp']) or has_function_privilege('anon',item,'EXECUTE') or has_function_privilege('authenticated',item,'EXECUTE') or has_function_privilege('service_role',item,'EXECUTE') then raise exception 'profile baseline owner/config/ACL drift';end if;
 end loop;
 if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) or exists(select 1 from pg_class where oid in ('public.guests'::regclass,'public.guest_contacts'::regclass,'public.invitation_sessions'::regclass) and (not relrowsecurity or relowner in ('anon'::regrole,'authenticated'::regrole))) or exists(select 1 from pg_policies where schemaname='public' and tablename in ('guests','guest_contacts','invitation_sessions') and cmd<>'SELECT') then raise exception 'profile baseline RLS drift';end if;
 if position('MESSAGE_SEND_TO_GUESTS' in pg_get_functiondef('public.internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure))=0 or position('app_snapshot_v5' in pg_get_functiondef('public.internal_snapshot_core(uuid)'::regprocedure))=0 then raise exception 'profile baseline delegation drift';end if;

 -- Reviewed immutable profile delegation contracts, not nominal version names.
 if not exists(select 1 from pg_proc where oid='public.internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure and md5(replace(prosrc,E'\r','')) in ('ef2fd1b7f6dd0dd55090b4fa8336d227')) then raise exception 'profile baseline source drift';end if;
 if not exists(select 1 from pg_proc where oid='public.internal_snapshot_core(uuid)'::regprocedure and md5(replace(prosrc,E'\r','')) in ('20c1ef3917626d85a5a0da71c8365172')) then raise exception 'profile baseline source drift';end if;
 -- Copy the real implementations; CREATE OR REPLACE below preserves all callers' OIDs.
 definition=pg_get_functiondef('public.internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure);
 execute replace(definition,'FUNCTION public.internal_mutation_core(','FUNCTION public.profile_confirmation_mutation_core(');
 definition=pg_get_functiondef('public.internal_snapshot_core(uuid)'::regprocedure);
 execute replace(definition,'FUNCTION public.internal_snapshot_core(','FUNCTION public.profile_confirmation_snapshot_core(');
end $baseline$;
revoke all on function public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb),public.profile_confirmation_snapshot_core(uuid) from public,anon,authenticated,service_role;

alter table public.guests add column profile_confirmed_at timestamptz;
alter table public.invitation_sessions add column profile_guest_id uuid,
 add constraint invitation_sessions_profile_guest_fkey foreign key(event_id,profile_guest_id) references public.guests(event_id,id) on delete set null (profile_guest_id);
-- NULL for every existing guest. No inferred confirmation/backfill from prior logins.

create or replace function public.internal_mutation_core(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); inv uuid; gid uuid; chosen uuid; g public.guests; c public.guest_contacts;
 prior jsonb; response jsonb; inserted boolean; full_name text; phone text; mail text; confirmed timestamptz;
begin
 if p_type is distinct from 'PROFILE_IDENTIFY' and p_type is distinct from 'PROFILE_CONFIRM' then return public.profile_confirmation_mutation_core(p_event,p_mutation,p_type,p_payload);end if;
 if uid is null or public.event_role(p_event) is distinct from 'GUEST' or p_mutation is null then raise exception 'unauthorized';end if;
 if jsonb_typeof(p_payload->'guest_id') is distinct from 'string' then raise exception 'invalid profile guest';end if;
 gid=(p_payload->>'guest_id')::uuid;
 -- Same durable receipt contract. Acquire the receipt before guest locks, as CONTACT_UPDATE does.
 insert into public.mutation_receipts(event_id,user_id,mutation_id) values(p_event,uid,p_mutation) on conflict do nothing returning true into inserted;
 -- Canonical roster/name alias edits take this event lock before locking a guest.
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 inv=public.my_invitation(p_event);
 if inv is null or not exists(select 1 from public.invitations where event_id=p_event and id=inv and active and archived_at is null) then raise exception 'unauthorized';end if;
 select profile_guest_id into chosen from public.invitation_sessions where event_id=p_event and user_id=uid and invitation_id=inv for update;
 if not found then raise exception 'unauthorized';end if;
 select * into g from public.guests where event_id=p_event and id=gid and invitation_id=inv for update;
 if not found or not public.owns_guest(p_event,gid) then raise exception 'unauthorized';end if;
 if inserted is distinct from true then
  select result into prior from public.mutation_receipts where event_id=p_event and user_id=uid and mutation_id=p_mutation;
  if prior->>'profile_action' is distinct from p_type or prior->>'guest_id' is distinct from gid::text then raise exception 'profile confirmation conflict';end if;
  return prior||jsonb_build_object('duplicate',true);
 end if;
 if p_type='PROFILE_IDENTIFY' then
  -- A declaration within the authorized unit, never a claim of individual authentication.
  update public.invitation_sessions set profile_guest_id=gid where event_id=p_event and user_id=uid;
  response=jsonb_build_object('ok',true,'profile_action',p_type,'guest_id',gid,'confirmed_at',g.profile_confirmed_at);
 else
  if chosen is distinct from gid and (select count(*) from public.guests where event_id=p_event and invitation_id=inv)<>1 then raise exception 'profile identity required';end if;
  if g.profile_confirmed_at is not null then
   response=jsonb_build_object('ok',true,'profile_action',p_type,'guest_id',gid,'confirmed_at',g.profile_confirmed_at,'already_confirmed',true);
  else
   if p_payload ?| array['consent_in_app','consent_push','consent_email','consent_whatsapp','communications_revoked'] then raise exception 'profile consent changes forbidden';end if;
   if jsonb_typeof(p_payload->'name') is distinct from 'string' or jsonb_typeof(p_payload->'whatsapp') is distinct from 'string' or jsonb_typeof(p_payload->'email') is distinct from 'string' then raise exception 'invalid profile fields';end if;
   if length(p_payload->>'name')>800 or length(p_payload->>'whatsapp')>30 or length(p_payload->>'email')>322 then raise exception 'invalid profile fields';end if;
   full_name=trim(regexp_replace(normalize(p_payload->>'name',NFC),'[[:space:]'||chr(160)||chr(8239)||']+',' ','g'));
   if length(full_name) not between 1 and 200 or full_name ~ '[[:cntrl:]]' or full_name ~ ('['||chr(8203)||'-'||chr(8207)||chr(8234)||'-'||chr(8238)||chr(8288)||'-'||chr(8303)||chr(65279)||']') then raise exception 'invalid profile name';end if;
   if p_payload->>'whatsapp' ~ '[^+0-9 ()-]' then raise exception 'invalid profile whatsapp';end if;
   phone=regexp_replace(p_payload->>'whatsapp','[^0-9]','','g');
   if phone !~ '^(55)?[1-9][1-9]9[0-9]{8}$' then raise exception 'invalid profile whatsapp';end if;
   mail=trim(p_payload->>'email');
   if length(mail) not between 3 and 320 or length(split_part(mail,'@',1))>64 or length(split_part(mail,'@',2))>253 or mail !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$' or mail ~ '^\.|\.\.|\.@' then raise exception 'invalid profile email';end if;
   select * into c from public.guest_contacts where event_id=p_event and guest_id=gid for update;
   if jsonb_typeof(p_payload->'version') is distinct from 'number' or g.version is distinct from (p_payload->>'version')::integer or not(p_payload ? 'contact_updated_at') or c.updated_at is distinct from (p_payload->>'contact_updated_at')::timestamptz then raise exception 'profile confirmation conflict';end if;
   -- Only data fields change. Existing channel choices, revocations and consent timestamp remain untouched.
   insert into public.guest_contacts(event_id,guest_id,email,whatsapp) values(p_event,gid,mail,phone)
    on conflict(guest_id) do update set email=excluded.email,whatsapp=excluded.whatsapp;
   confirmed=clock_timestamp();
   update public.guests set name=full_name,version=version+1,profile_confirmed_at=confirmed where event_id=p_event and id=gid;
   update public.invitations set name=case when kind='INDIVIDUAL' then full_name else name end,version=version+1 where event_id=p_event and id=inv;
   -- A name correction must not make the existing name/PIN login ambiguous.
   -- Optional on older profile/password baselines; no name/PIN tables are fabricated.
   if to_regclass('name_pin_private.aliases') is not null and to_regprocedure('name_pin_private.normalize_name(text)') is not null then
    if name_pin_private.normalize_name(full_name) is null then raise exception 'invalid profile name';end if;
    if name_pin_private.normalize_name(g.name) is distinct from name_pin_private.normalize_name(full_name) and exists(
     select 1 from name_pin_private.aliases a join name_pin_private.aliases b on b.event_id=a.event_id and b.name_fingerprint=a.name_fingerprint and b.pin_fingerprint=a.pin_fingerprint and b.invitation_id<>a.invitation_id
     where a.event_id=p_event and a.invitation_id=inv and a.name_fingerprint=name_pin_private.fingerprint(p_event,'name:v1',name_pin_private.normalize_name(full_name))
    ) then raise exception 'profile login conflict';end if;
   end if;
   update public.invitation_sessions set profile_guest_id=gid where event_id=p_event and user_id=uid;
   insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,uid,'PROFILE_CONFIRM','guests',gid);
   response=jsonb_build_object('ok',true,'profile_action',p_type,'guest_id',gid,'confirmed_at',confirmed);
  end if;
 end if;
 update public.mutation_receipts r set result=response where r.event_id=p_event and r.user_id=uid and r.mutation_id=p_mutation;
 return response;
end $$;
revoke all on function public.internal_mutation_core(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;

create or replace function public.internal_snapshot_core(p_event uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; inv uuid; selected uuid; amount integer; confirmed timestamptz;
begin
 result=public.profile_confirmation_snapshot_core(p_event);
 if public.event_role(p_event) is distinct from 'GUEST' then return result||jsonb_build_object('profile_confirmation',jsonb_build_object('supported',true));end if;
 inv=public.my_invitation(p_event);
 select count(*) into amount from public.guests where event_id=p_event and invitation_id=inv;
 select g.id into selected from public.invitation_sessions s join public.guests g on g.event_id=s.event_id and g.id=s.profile_guest_id and g.invitation_id=s.invitation_id where s.event_id=p_event and s.user_id=auth.uid() and s.invitation_id=inv;
 if selected is null and amount=1 then select id into selected from public.guests where event_id=p_event and invitation_id=inv;end if;
 select profile_confirmed_at into confirmed from public.guests where event_id=p_event and id=selected and invitation_id=inv;
 -- Top-level capability is intentionally independent of messaging's capabilities object.
 -- Both installation orders preserve it without rewriting any public/auth function.
 return result||jsonb_build_object('profile_confirmation',jsonb_build_object('supported',true,'guest_id',selected,'confirmed_at',confirmed));
end $$;
revoke all on function public.internal_snapshot_core(uuid) from public,anon,authenticated,service_role;
commit;
