-- Restore the public PR #21 contracts without undoing applied migrations or data.
-- Source: 919382d988c1b8cb06130f0da3813db7a841ebd1.
-- No data rewrite, code/PIN rotation, session deletion or credential revocation.
begin;

-- These post-21 constraints were not part of the baseline. Keep their function.
drop trigger if exists family_head_integrity on public.invitations;
drop trigger if exists family_head_membership on public.guests;


create or replace function admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
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

create or replace function app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 return app_snapshot_v5(p_event)||jsonb_build_object('invitation_deliveries',(
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'guest_id',guest_id,'invitation_id',invitation_id,'recipient_email',recipient_email,'status',status,'sent_at',sent_at,'created_at',created_at,'request_id',request_id,'bulk',exists(select 1 from invitation_delivery_batches b where b.event_id=invitation_deliveries.event_id and b.request_id=invitation_deliveries.request_id),'attempts',attempts,'last_attempt_at',last_attempt_at,'superseded_by',superseded_by,'guest_ids',(select coalesce(jsonb_agg(m.guest_id),'[]') from invitation_delivery_members m where m.event_id=invitation_deliveries.event_id and m.delivery_id=invitation_deliveries.id)) order by created_at desc),'[]')
 from invitation_deliveries where event_id=p_event and event_role(p_event)='ADMIN'));
end $$;

create or replace function app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare recipients uuid[]; channels delivery_channel[]; content text; mid uuid; tid uuid; receipt_result jsonb; response jsonb; broadcast boolean; contact_result jsonb;
begin
 if p_type='CONTACT_UPDATE' and (event_role(p_event)='ADMIN' or (event_role(p_event)='GUEST' and owns_guest(p_event,(p_payload->>'guest_id')::uuid))) then
   -- Serialize with contact/RSVP writers before checking the persisted opt-out.
   perform 1 from guests where event_id=p_event and id=(p_payload->>'guest_id')::uuid for update;
   -- Also retain opt-outs still waiting in an old client's offline queue.
   if coalesce((p_payload->>'notifications_revoked')::boolean,false) then
     p_payload=p_payload||jsonb_build_object('consent_in_app',false,'consent_push',false,'consent_email',false,'consent_whatsapp',false);
     contact_result=app_mutate_v4(p_event,p_mutation,p_type,p_payload);
     if not coalesce((contact_result->>'duplicate')::boolean,false) then
       update guest_contacts set notifications_revoked=true where event_id=p_event and guest_id=(p_payload->>'guest_id')::uuid;
     end if;
     return contact_result;
   end if;
   if exists(select 1 from guest_contacts where event_id=p_event and guest_id=(p_payload->>'guest_id')::uuid and notifications_revoked is true) then
     p_payload=p_payload||jsonb_build_object('consent_in_app',false,'consent_push',false,'consent_email',false,'consent_whatsapp',false);
   end if;
 end if;
 if p_type is distinct from 'MESSAGE_SEND_TO_GUESTS' and (p_type is distinct from 'MESSAGE_SEND' or not (p_payload ? 'recipient_guest_ids')) then
   return app_mutate_v4(p_event,p_mutation,p_type,p_payload);
 end if;
 if event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 -- A committed operation stays successful even if its targets or retry payload change.
 select result into receipt_result from mutation_receipts where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 if found then return coalesce(receipt_result,'{}'::jsonb)||jsonb_build_object('duplicate',true);end if;
 -- Serialize against guest changes and concurrent retries, then recheck the receipt.
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 select result into receipt_result from mutation_receipts where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 if found then return coalesce(receipt_result,'{}'::jsonb)||jsonb_build_object('duplicate',true);end if;
 if jsonb_typeof(p_payload->'recipient_guest_ids') is distinct from 'array' then raise exception 'invalid recipient list';end if;
 if jsonb_array_length(p_payload->'recipient_guest_ids') not between 1 and 500 then raise exception 'invalid recipient count';end if;
 if nullif(p_payload->>'invitation_id','') is not null or nullif(p_payload->>'recipient_guest_id','') is not null then raise exception 'invalid recipient target';end if;
 select array_agg(distinct value::uuid) into recipients from jsonb_array_elements_text(p_payload->'recipient_guest_ids');
 if array_position(recipients,null) is not null then raise exception 'invalid recipient';end if;
 if cardinality(recipients) <> (select count(*) from guests g join invitations i on i.id=g.invitation_id where g.event_id=p_event and i.event_id=p_event and g.id=any(recipients) and i.active and i.archived_at is null) then raise exception 'invalid recipient';end if;
 content=trim(p_payload->>'content');
 if content is null or length(content) not between 1 and 4000 then raise exception 'invalid message';end if;
 if jsonb_typeof(coalesce(p_payload->'channels','["IN_APP"]'::jsonb)) <> 'array' then raise exception 'invalid channels';end if;
 select array_agg(distinct value::delivery_channel) into channels from jsonb_array_elements_text(coalesce(p_payload->'channels','["IN_APP"]'::jsonb));
 if coalesce(cardinality(channels),0)=0 or array_position(channels,null) is not null then raise exception 'invalid channels';end if;
 if p_payload ? 'create_announcement' and jsonb_typeof(p_payload->'create_announcement') <> 'boolean' then raise exception 'invalid announcement flag';end if;
 broadcast=coalesce((p_payload->>'create_announcement')::boolean,false);
 if broadcast then
   if not (channels @> '{IN_APP}'::delivery_channel[]) then raise exception 'announcement requires IN_APP';end if;
   if cardinality(recipients) <> (select count(*) from guests g join invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.event_id=p_event and i.active and i.archived_at is null) then raise exception 'announcement requires all active recipients';end if;
 end if;
 insert into mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then
   select result into receipt_result from mutation_receipts where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
   return coalesce(receipt_result,'{}'::jsonb)||jsonb_build_object('duplicate',true);
 end if;
 insert into message_threads(event_id,invitation_id) values(p_event,null) returning id into tid;
 insert into messages(event_id,thread_id,from_admin,sender_user_id,content,channels) values(p_event,tid,true,auth.uid(),content,channels) returning id into mid;
 insert into message_recipients(event_id,message_id,guest_id) select p_event,mid,unnest(recipients);
 insert into notification_jobs(event_id,message_id,guest_id,channel,idempotency_key)
   select p_event,mid,r,c,mid||':'||r||':'||c from unnest(recipients) r cross join unnest(channels) c;
 if broadcast then insert into announcements(event_id,title,content) values(p_event,'Mensagem dos noivos',content);end if;
 response=jsonb_build_object('ok',true,'id',mid);
 update mutation_receipts set result=response where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 return response;
end $$;

create or replace function issue_ticket(p_event uuid,p_guest uuid,p_regenerate boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare token text:=encode(gen_random_bytes(32),'hex');
begin
 if event_role(p_event) is distinct from 'ADMIN' and not owns_guest(p_event,p_guest) then raise exception 'unauthorized';end if;
 perform 1 from guests where event_id=p_event and id=p_guest for update;
 if not exists(select 1 from rsvps where event_id=p_event and guest_id=p_guest and status='CONFIRMED') then raise exception 'not confirmed';end if;
 if not p_regenerate and exists(select 1 from qr_credentials where event_id=p_event and guest_id=p_guest and revoked_at is null) then raise exception 'ticket_exists';end if;
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id=p_guest and revoked_at is null;
 insert into qr_credentials(event_id,guest_id,token_hash) values(p_event,p_guest,encode(digest(token,'sha256'),'hex'));
 return jsonb_build_object('guest_id',p_guest,'token',token);
end $$;

-- Retain the additive 007/008 structures and function bodies, but retire the
-- new client entry points. Verified shared access and local identity remain.
revoke all on function public.identify_guest(uuid,uuid),public.issue_family_ticket(uuid,uuid,boolean),public.resolve_checkin_ticket(uuid,text) from public,anon,authenticated,service_role;

revoke all on function public.app_snapshot_v6(uuid),public.app_snapshot_v7(uuid),public.app_mutate_v6(uuid,uuid,text,jsonb),public.admin_action_v6(uuid,text,jsonb) from public,anon,authenticated,service_role;

-- Restore explicit authenticated-only access, including on upgraded databases.
revoke all on function public.app_snapshot(uuid),public.app_mutate(uuid,uuid,text,jsonb),public.admin_action(uuid,text,jsonb),public.issue_ticket(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.app_snapshot(uuid),public.app_mutate(uuid,uuid,text,jsonb),public.admin_action(uuid,text,jsonb),public.issue_ticket(uuid,uuid,boolean) to authenticated;

-- Keep definer functions owned by the trusted owner of the application tables.
-- The production checkpoint must confirm this owner and the private delegates.
do $$
declare owner_name name;
begin
 select pg_get_userbyid(relowner) into owner_name from pg_class where oid='public.invitations'::regclass;
 execute format('alter function public.app_snapshot(uuid) owner to %I',owner_name);
 execute format('alter function public.app_mutate(uuid,uuid,text,jsonb) owner to %I',owner_name);
 execute format('alter function public.admin_action(uuid,text,jsonb) owner to %I',owner_name);
 execute format('alter function public.issue_ticket(uuid,uuid,boolean) owner to %I',owner_name);
end $$;
notify pgrst,'reload schema';
commit;
