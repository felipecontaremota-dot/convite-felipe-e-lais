-- Existing rows become FAMILY without changing codes, passwords, sessions or guests.
alter table invitations add column kind text not null default 'FAMILY' check(kind in ('FAMILY','INDIVIDUAL'));
alter table invitations add column archived_at timestamptz;
alter table events add column gps_url text;
alter table events add column version integer not null default 1;
alter table events add constraint gps_https check(gps_url is null or (length(gps_url)<=2048 and gps_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'));

-- A deferred invariant allows atomic creation/moves, but never a live standalone
-- unit with zero/multiple people. Existing FAMILY rows are unaffected.
create function check_access_unit() returns trigger language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare ids uuid[]; unit invitations; n integer;
begin
 if tg_table_name='guests' then
  if tg_op='INSERT' then ids=array[new.invitation_id];
  elsif tg_op='DELETE' then ids=array[old.invitation_id];
  else ids=array[old.invitation_id,new.invitation_id];end if;
 else ids=array[new.id];end if;
 for unit in select * from invitations where id=any(ids) and kind='INDIVIDUAL' and active loop
  select count(*) into n from guests where invitation_id=unit.id;
  if n<>1 or not exists(select 1 from guests where invitation_id=unit.id and id=unit.primary_guest_id) then raise exception 'invalid individual unit';end if;
 end loop;
 return null;
end $$;
create constraint trigger access_unit_guest after insert or update or delete on guests deferrable initially deferred for each row execute function check_access_unit();
create constraint trigger access_unit_invitation after insert or update on invitations deferrable initially deferred for each row execute function check_access_unit();

-- Private helper. Passwords/codes are never in audit metadata or URLs.
create function create_individual_access(p_event uuid,p_name text,p_phone text) returns uuid language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare iid uuid; code text:=encode(gen_random_bytes(24),'hex'); password text;
begin
 password=case when p_phone ~ '^[0-9]{10,11}$' then right(p_phone,4) else lpad(((get_byte(gen_random_bytes(2),0)*256+get_byte(gen_random_bytes(2),1))%10000)::text,4,'0') end;
 insert into invitations(event_id,name,kind,code_hash) values(p_event,p_name,'INDIVIDUAL',encode(digest(code,'sha256'),'hex')) returning id into iid;
 insert into invitation_access(event_id,invitation_id,pin,sharing_code) values(p_event,iid,password,code);
 return iid;
end $$;

-- Keep unrelated operations byte-for-byte in the previous function, but make
-- it private: clients cannot bypass the new model via the legacy entrypoint.
alter function admin_action(uuid,text,jsonb) rename to admin_action_v3;
revoke all on function admin_action_v3(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare eid uuid:=(p_payload->>'id')::uuid; iid uuid; target uuid; g guests; unit invitations; item jsonb; gid uuid;
 guest_name text; phone text; contact_email text; group_value text; result jsonb;
begin
 if event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 -- Serialize administrative changes for this event, with deterministic lock order.
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 if p_action in ('FAMILY_MERGE','FAMILY_SPLIT') then raise exception 'retired admin action';end if;
 if p_action in ('GUEST_CREATE','GUEST_UPDATE') then
  if p_action='GUEST_UPDATE' then
   select * into g from guests where event_id=p_event and id=eid for update;
   if not found then raise exception 'not found';end if;
   if g.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
  end if;
  if p_payload ? 'invitation_id' or p_payload ? 'companion_of' or p_payload ? 'is_adolescent' then raise exception 'unsupported guest field';end if;
  guest_name=trim(p_payload->>'name');
  if guest_name is null or length(guest_name)<1 or length(guest_name)>200 then raise exception 'invalid name';end if;
  group_value=coalesce(p_payload->>'group_label','');
  if group_value not in ('','Familiar da noiva','Familiar do noivo','Convidado(a) da noiva','Convidado(a) do noivo') and group_value is distinct from g.group_label then raise exception 'invalid group';end if;
  phone=regexp_replace(coalesce(p_payload->>'whatsapp',''),'[^0-9]','','g');
  if length(phone) in (12,13) and left(phone,2)='55' then phone=substr(phone,3);end if;
  contact_email=trim(coalesce(p_payload->>'email',''));
  if (phone<>'' and phone !~ '^[0-9]{10,11}$') or length(contact_email)>320 or (contact_email<>'' and contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'invalid contact';end if;
  if p_action='GUEST_CREATE' then
   iid=create_individual_access(p_event,guest_name,phone);
   insert into guests(event_id,invitation_id,name,group_label,is_child) values(p_event,iid,guest_name,group_value,coalesce((p_payload->>'is_child')::boolean,false)) returning id into eid;
   update invitations set primary_guest_id=eid where id=iid;
   insert into rsvps(event_id,guest_id) values(p_event,eid);
  else
   iid=g.invitation_id;
   update guests set name=guest_name,group_label=group_value,is_child=coalesce((p_payload->>'is_child')::boolean,false),is_adolescent=false,version=version+1 where id=eid;
   update invitations set name=guest_name,version=version+1 where id=iid and kind='INDIVIDUAL';
  end if;
  insert into guest_admin_details(event_id,guest_id,notes) values(p_event,eid,coalesce(p_payload->>'admin_notes','')) on conflict(guest_id) do update set notes=excluded.notes;
  insert into guest_contacts(event_id,guest_id,email,whatsapp) values(p_event,eid,contact_email,phone) on conflict(guest_id) do update set email=excluded.email,whatsapp=excluded.whatsapp;
  -- Existing consent values/timestamp and RSVP are deliberately preserved.
 elsif p_action in ('FAMILY_ADD_MEMBERS','GUEST_ASSIGN_FAMILY','GUEST_REMOVE_FROM_FAMILY','GUEST_DELETE','GUEST_DELETE_BATCH','FAMILY_DELETE') then
  if p_action in ('FAMILY_ADD_MEMBERS','GUEST_ASSIGN_FAMILY') then
   target=(p_payload->>'target_id')::uuid;
   select * into unit from invitations where id=target and event_id=p_event and kind='FAMILY' and active and archived_at is null for update;
   if not found then raise exception 'invalid family';end if;
   if unit.version is distinct from (p_payload->>'target_version')::integer then raise exception 'conflict';end if;
   if unit.code_hash is null or not exists(select 1 from invitation_access where invitation_id=target) then raise exception 'family access required';end if;
  end if;
  if p_action='FAMILY_DELETE' then
   select * into unit from invitations where id=eid and event_id=p_event and kind='FAMILY' and archived_at is null for update;
   if not found then raise exception 'not found';end if;
   if unit.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
   -- Guests are also versioned in batch payloads; family deletion is protected
   -- by its version, bumped on every membership/guest-field change below.
   p_payload=p_payload||jsonb_build_object('guests',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'version',version,'invitation_version',unit.version)),'[]') from guests where invitation_id=eid));
  end if;
  if jsonb_typeof(p_payload->'guests') is distinct from 'array' or (p_action<>'FAMILY_DELETE' and jsonb_array_length(p_payload->'guests')<1) or (p_action<>'FAMILY_DELETE' and jsonb_array_length(p_payload->'guests')>500) then raise exception 'invalid batch';end if;
  if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_payload->'guests') x) then raise exception 'duplicate guest';end if;
  -- Validate every expected version before changing any source invitation.
  for item in select value from jsonb_array_elements(p_payload->'guests') order by value->>'id' loop
   select * into g from guests where id=(item->>'id')::uuid and event_id=p_event for update;
   if not found then raise exception 'not found';end if;
   select * into unit from invitations where id=g.invitation_id and event_id=p_event for update;
   if g.version is distinct from (item->>'version')::integer or unit.version is distinct from (item->>'invitation_version')::integer then raise exception 'conflict';end if;
   if p_action in ('FAMILY_ADD_MEMBERS','GUEST_ASSIGN_FAMILY') and (g.invitation_id=target or (unit.kind='FAMILY' and coalesce((p_payload->>'confirm_move')::boolean,false)=false)) then raise exception 'confirm family move';end if;
   if p_action in ('GUEST_REMOVE_FROM_FAMILY','FAMILY_DELETE') and unit.kind<>'FAMILY' then raise exception 'invalid family';end if;
  end loop;
  for item in select value from jsonb_array_elements(p_payload->'guests') order by value->>'id' loop
   select * into g from guests where id=(item->>'id')::uuid and event_id=p_event;
   select * into unit from invitations where id=g.invitation_id and event_id=p_event;
   -- A shared anonymous UID cannot identify one former member; revoke all
   -- source/target bindings to prevent either roster leaking across the move.
   delete from invitation_sessions where event_id=p_event and invitation_id in(g.invitation_id,target);
   update qr_credentials set revoked_at=now() where event_id=p_event and guest_id=g.id and revoked_at is null;
   update guests set companion_of=null where event_id=p_event and companion_of=g.id;
   if p_action in ('GUEST_DELETE','GUEST_DELETE_BATCH') then
    update invitations set primary_guest_id=null where id=g.invitation_id and primary_guest_id=g.id;
    delete from guests where id=g.id and event_id=p_event;
   else
    if p_action in ('GUEST_REMOVE_FROM_FAMILY','FAMILY_DELETE') then
     select whatsapp into phone from guest_contacts where guest_id=g.id;
     phone=coalesce(phone,'');if length(phone) in (12,13) and left(phone,2)='55' then phone=substr(phone,3);end if;
     iid=create_individual_access(p_event,g.name,phone);
     update invitations set primary_guest_id=g.id where id=iid;
    else iid=target;end if;
    update guests set invitation_id=iid,companion_of=null,version=version+1 where id=g.id;
    update invitations set primary_guest_id=null where id=g.invitation_id and primary_guest_id=g.id;
   end if;
   update invitations set version=version+1 where id=g.invitation_id;
   if unit.kind='INDIVIDUAL' then
    update invitations set active=false,archived_at=now(),code_hash=null,primary_guest_id=null where id=unit.id;
    update invitation_access set sharing_code=null where invitation_id=unit.id;
   end if;
   insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),p_action,'guests',g.id);
  end loop;
  if target is not null then update invitations set version=version+1 where id=target;end if;
  if p_action='FAMILY_DELETE' then
   update invitations set active=false,archived_at=now(),code_hash=null,primary_guest_id=null,version=version+1 where id=eid;
   delete from invitation_sessions where event_id=p_event and invitation_id=eid;
   update invitation_access set sharing_code=null where invitation_id=eid;
   insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),p_action,'invitations',eid);
  end if;
 elsif p_action='EVENT_SAVE' then
  perform 1 from events where id=p_event and version=(p_payload->>'version')::integer for update;
  if not found then raise exception 'conflict';end if;
  update events set venue_name=nullif(trim(p_payload->>'venue_name'),''),address=nullif(trim(p_payload->>'address'),''),gps_url=nullif(trim(p_payload->>'gps_url'),''),version=version+1 where id=p_event;
  insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'LOCATION_UPDATE','events',p_event);
 else
  -- Existing clients may still edit FAMILY members. They cannot create/move an
  -- INDIVIDUAL via the legacy action, nor re-enable an archived unit.
  if p_action='GUEST_SAVE' then
   if exists(select 1 from invitations where id=(p_payload->>'invitation_id')::uuid and (kind='INDIVIDUAL' or archived_at is not null)) or exists(select 1 from guests legacy_guest join invitations i on i.id=legacy_guest.invitation_id where legacy_guest.id=eid and i.kind='INDIVIDUAL') then raise exception 'use guest actions';end if;
  end if;
  if eid is not null and p_action in ('INVITATION_SAVE','INVITATION_DISABLE','PIN_SAVE','CODE_ROTATE','CODE_BLOCK','ACCESS_REVOKE') then
   if exists(select 1 from invitations where id=eid and archived_at is not null) then raise exception 'archived';end if;
   if p_action in ('INVITATION_SAVE','INVITATION_DISABLE') and exists(select 1 from invitations where id=eid and kind='INDIVIDUAL') then raise exception 'use guest actions';end if;
  end if;
  result=admin_action_v3(p_event,p_action,p_payload);
  return result;
 end if;
 if p_action in ('GUEST_CREATE','GUEST_UPDATE') then
  if p_action='GUEST_UPDATE' then update invitations set version=version+1 where id=iid and kind='FAMILY';end if;
  insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),p_action,'guests',eid);
 end if;
 return jsonb_build_object('ok',true,'id',eid,'invitation_id',iid);
end $$;
revoke all on function check_access_unit(),create_individual_access(uuid,text,text),admin_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function admin_action(uuid,text,jsonb) to authenticated;
