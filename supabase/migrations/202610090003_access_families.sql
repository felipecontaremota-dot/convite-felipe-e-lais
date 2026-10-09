-- Incremental access upgrade. Previously applied migrations remain unchanged.
-- PIN and plaintext sharing code are deliberately ADMIN-only, never part of guest rows.
create table invitation_access (
 invitation_id uuid primary key, event_id uuid not null,
 pin text not null check(pin ~ '^[0-9]{4}$'), sharing_code text,
 foreign key(event_id,invitation_id) references invitations(event_id,id) on delete cascade
);
alter table invitation_access enable row level security;
create policy admin_read on invitation_access for select to authenticated using(event_role(event_id)='ADMIN');
grant select on invitation_access to authenticated;
grant select,insert,update,delete on invitation_access to service_role;
create table guest_admin_details (
 guest_id uuid primary key, event_id uuid not null, notes text not null default '' check(length(notes)<=2000),
 foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade
);
alter table guest_admin_details enable row level security;
create policy admin_read on guest_admin_details for select to authenticated using(event_role(event_id)='ADMIN');
grant select on guest_admin_details to authenticated;
grant select,insert,update,delete on guest_admin_details to service_role;
alter table guests add column is_child boolean not null default false;
alter table guests add column is_adolescent boolean not null default false;
alter table guests add constraint guest_age_group check(not (is_child and is_adolescent));
alter table invitations add column sent_at timestamptz;
alter table invitations add column sent_channel delivery_channel;
alter table invitations add column first_activated_at timestamptz;
alter table invitation_sessions add column pin_verified_at timestamptz;
-- Existing bindings are retained but require PIN verification once after this upgrade.
-- Existing codes/RSVP/contacts remain untouched; ADMIN must configure each legacy family's PIN.
insert into rsvps(event_id,guest_id) select event_id,id from guests on conflict(guest_id) do nothing;

create or replace function my_invitation(p_event uuid) returns uuid language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select s.invitation_id from invitation_sessions s join invitations i on i.id=s.invitation_id
 where s.event_id=p_event and s.user_id=auth.uid() and i.active and s.pin_verified_at is not null
$$;
create or replace function event_role(p_event uuid) returns app_role language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select coalesce((select role from user_roles where event_id=p_event and user_id=auth.uid()),
 case when my_invitation(p_event) is not null then 'GUEST'::app_role end)
$$;

-- Remove the old code-only overload: an older deployed Edge fails closed until upgraded.
drop function redeem_invitation(uuid,uuid,text,text);
create function invitation_attempt_allowed(p_event uuid,p_user uuid,p_code text,p_bucket text,p_identify boolean default false) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare k text; n integer; allowed boolean:=true; prefix text:=case when p_identify then 'identify:' else '' end;
begin
 -- Deterministic lock order and increments even on rejected attempts. No raw address/code/PIN logging.
 foreach k in array array[prefix||'global:'||p_event,prefix||'ip:'||p_bucket,prefix||'code:'||encode(digest(p_code,'sha256'),'hex'),prefix||'user:'||p_user] loop
  insert into invitation_rate_limits(bucket,attempts) values(k,1) on conflict(bucket) do update
  set attempts=case when invitation_rate_limits.window_at<now()-interval '15 minutes' then 1 else invitation_rate_limits.attempts+1 end,
  window_at=case when invitation_rate_limits.window_at<now()-interval '15 minutes' then now() else invitation_rate_limits.window_at end
  returning attempts into n;
  if n > (case when k like prefix||'global:%' then 1000 when p_identify then 60 else 15 end) then allowed=false;end if;
 end loop;
 return allowed;
end $$;
create function identify_invitation(p_event uuid,p_user uuid,p_code text,p_bucket text) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare i invitations;begin
 if not exists(select 1 from auth.users where id=p_user and is_anonymous) or not invitation_attempt_allowed(p_event,p_user,p_code,p_bucket,true) then return null;end if;
 if p_code !~ '^[A-Za-z0-9_-]{32,64}$' then return null;end if;
 select * into i from invitations where event_id=p_event and active and code_hash=encode(digest(p_code,'sha256'),'hex');
 if not found then return null;end if;
 return jsonb_build_object('name',i.name,'activated',exists(select 1 from invitation_sessions where event_id=p_event and user_id=p_user and invitation_id=i.id and pin_verified_at is not null));
end $$;
create function redeem_invitation(p_event uuid,p_user uuid,p_code text,p_pin text,p_bucket text) returns boolean language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare i invitations;allowed boolean;begin
 if not exists(select 1 from auth.users where id=p_user and is_anonymous) or exists(select 1 from user_roles where event_id=p_event and user_id=p_user) then return false;end if;
 allowed=invitation_attempt_allowed(p_event,p_user,p_code,p_bucket);
 select * into i from invitations where event_id=p_event and active and code_hash=encode(digest(p_code,'sha256'),'hex') for update;
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
create or replace function app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role app_role:=event_role(p_event);inv uuid:=my_invitation(p_event);result jsonb;
begin
 -- A revoked device receives an authoritative empty snapshot, clearing its online cache.
 select jsonb_build_object('role',role,'event',to_jsonb(e)) into result from events e where id=p_event;
 result=result||jsonb_build_object(
 'invitations',(select coalesce(jsonb_agg((to_jsonb(i)-'code_hash')||jsonb_build_object('delivery_status',case when i.first_activated_at is not null then 'OPENED' when i.sent_at is not null then 'SENT' else 'NOT_SENT' end)||case when role='ADMIN' then jsonb_build_object('pin',(select pin from invitation_access where invitation_id=i.id),'sharing_code',case when i.code_hash is not null then (select sharing_code from invitation_access where invitation_id=i.id) end,'link_active',i.code_hash is not null,'device_count',(select count(*) from invitation_sessions where invitation_id=i.id and pin_verified_at is not null)) else '{}'::jsonb end),'[]') from invitations i where event_id=p_event and (role='ADMIN' or i.id=inv or role='CEREMONIALIST' and i.active)),
 'guests',(select coalesce(jsonb_agg(to_jsonb(g)||case when role='ADMIN' then jsonb_build_object('admin_notes',coalesce((select notes from guest_admin_details where guest_id=g.id),'')) else '{}'::jsonb end),'[]') from guests g where event_id=p_event and (role='ADMIN' or g.invitation_id=inv or role='CEREMONIALIST' and exists(select 1 from rsvps r where r.guest_id=g.id and r.status='CONFIRMED'))),
 'rsvps',(select coalesce(jsonb_agg(case when role='CEREMONIALIST' then jsonb_build_object('event_id',r.event_id,'guest_id',r.guest_id,'status',r.status,'dietary','','note','','responded_at',r.responded_at,'source',r.source) else to_jsonb(r) end),'[]') from rsvps r where event_id=p_event and (role='ADMIN' or owns_guest(p_event,r.guest_id) or role='CEREMONIALIST' and r.status='CONFIRMED')),
 'contacts',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from guest_contacts c where event_id=p_event and (role='ADMIN' or role='GUEST' and owns_guest(p_event,c.guest_id))),
 'gifts',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from gifts g where event_id=p_event and (role='ADMIN' or role='GUEST' and g.active)),
 'gift_selections',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from gift_selections g where event_id=p_event and (role='ADMIN' or role='GUEST' and owns_guest(p_event,g.guest_id))),
 'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at desc),'[]') from messages m where event_id=p_event and (role='ADMIN' or role='GUEST' and m.channels @> '{IN_APP}'::delivery_channel[] and (m.invitation_id=inv or m.invitation_id is null))),
 'announcements',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from announcements a where event_id=p_event and role in ('ADMIN','GUEST')),
 'rules',(select coalesce(jsonb_agg(to_jsonb(r) order by r.days_before desc),'[]') from notification_rules r where event_id=p_event and role='ADMIN'),
 'credentials',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from qr_credentials q where event_id=p_event and revoked_at is null and (role in ('ADMIN','CEREMONIALIST') or role='GUEST' and owns_guest(p_event,q.guest_id))),
 'notification_jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'channel',j.channel,'status',j.status,'attempts',j.attempts,'last_error',j.last_error,'created_at',j.created_at)),'[]') from notification_jobs j where event_id=p_event and role='ADMIN'),
 'sheet_jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'status',j.status,'attempts',j.attempts,'last_error',j.last_error,'version',j.version)),'[]') from sheet_sync_jobs j where event_id=p_event and role='ADMIN'),
 'checkins',(select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc),'[]') from checkins c where event_id=p_event and role in ('ADMIN','CEREMONIALIST')));
 return result;
end $$;
create or replace function admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare eid uuid:=(p_payload->>'id')::uuid;target uuid;gid uuid;code text;v integer;inv invitations;old_guest guests;
begin
 if event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if p_action in ('INVITATION_SAVE','INVITATION_DISABLE','CODE_ROTATE','CODE_BLOCK','FAMILY_MERGE','FAMILY_SPLIT','PIN_SAVE','ACCESS_REVOKE') and eid is not null then
 select * into inv from invitations where event_id=p_event and id=eid for update;
 if not found then raise exception 'not found';end if;
 if inv.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 end if;
 case p_action
 when 'INVITATION_SAVE' then
 if eid is null then insert into invitations(event_id,name) values(p_event,trim(p_payload->>'name')) returning id into eid;
 if nullif(p_payload->>'primary_name','') is not null then
 insert into guests(event_id,invitation_id,name) values(p_event,eid,trim(p_payload->>'primary_name')) returning id into gid;
 insert into rsvps(event_id,guest_id) values(p_event,gid);
 update invitations set primary_guest_id=gid where id=eid;end if;
 else
 gid=(p_payload->>'primary_guest_id')::uuid;
 if gid is not null and not exists(select 1 from guests where event_id=p_event and id=gid and invitation_id=eid) then raise exception 'invalid primary';end if;
 update invitations set name=trim(p_payload->>'name'),active=(p_payload->>'active')::boolean,primary_guest_id=gid,version=version+1 where id=eid;
 if not (p_payload->>'active')::boolean then delete from invitation_sessions where event_id=p_event and invitation_id=eid;end if;
 end if;
 if nullif(p_payload->>'pin','') is not null then
 insert into invitation_access(invitation_id,event_id,pin) values(eid,p_event,p_payload->>'pin') on conflict(invitation_id) do update set pin=excluded.pin;
 insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'PIN_SAVE','invitations',eid);end if;
 when 'PIN_SAVE' then
 insert into invitation_access(invitation_id,event_id,pin) values(eid,p_event,p_payload->>'pin') on conflict(invitation_id) do update set pin=excluded.pin;
 update invitations set version=version+1 where id=eid;
 -- A PIN change affects future activations only. Revocation is a separate explicit action.
 when 'ACCESS_REVOKE' then
 delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 update invitations set version=version+1 where id=eid;
 when 'INVITATION_DISABLE' then update invitations set active=false,code_hash=null,version=version+1 where id=eid;delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 when 'CODE_ROTATE' then
 if not inv.active then raise exception 'inactive';end if;
 if not exists(select 1 from invitation_access where invitation_id=eid) then raise exception 'pin required';end if;
 code=encode(gen_random_bytes(24),'hex');update invitations set code_hash=encode(digest(code,'sha256'),'hex'),version=version+1 where id=eid;
 delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 update invitation_access set sharing_code=code where invitation_id=eid;
 insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'CODE_ROTATE','invitations',eid);
 return jsonb_build_object('code',code);
 when 'CODE_BLOCK' then update invitations set code_hash=null,version=version+1 where id=eid;delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 when 'GUEST_SAVE' then
 target=(p_payload->>'invitation_id')::uuid;
 perform 1 from invitations where event_id=p_event and id=target and active for update;if not found then raise exception 'invalid invitation';end if;
 gid=(p_payload->>'companion_of')::uuid;
 if gid is not null and (gid=eid or not exists(select 1 from guests where id=gid and event_id=p_event and invitation_id=target)) then raise exception 'invalid companion';end if;
 if eid is null then
 insert into guests(event_id,invitation_id,name,group_label,companion_of) values(p_event,target,trim(p_payload->>'name'),coalesce(p_payload->>'group_label',''),gid) returning id into eid;
 insert into rsvps(event_id,guest_id) values(p_event,eid);
 else
 select * into old_guest from guests where id=eid and event_id=p_event for update;if not found then raise exception 'not found';end if;
 if old_guest.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 update invitations set primary_guest_id=null,version=version+1 where event_id=p_event and primary_guest_id=eid and id<>target;
 update guests set companion_of=null where event_id=p_event and companion_of=eid and invitation_id<>target;
 update guests set name=trim(p_payload->>'name'),group_label=coalesce(p_payload->>'group_label',''),invitation_id=target,companion_of=gid,version=version+1 where id=eid and event_id=p_event;
 if old_guest.invitation_id<>target then
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id=eid and revoked_at is null;
 delete from invitation_sessions where event_id=p_event and invitation_id in (old_guest.invitation_id,target);
 end if;
 end if;
 update guests set is_child=coalesce((p_payload->>'is_child')::boolean,false),is_adolescent=coalesce((p_payload->>'is_adolescent')::boolean,false) where id=eid;
 if p_payload ? 'admin_notes' then insert into guest_admin_details(event_id,guest_id,notes) values(p_event,eid,coalesce(p_payload->>'admin_notes','')) on conflict(guest_id) do update set notes=excluded.notes;end if;
 if p_payload ? 'email' or p_payload ? 'whatsapp' then
 if length(coalesce(p_payload->>'email',''))>320 or length(coalesce(p_payload->>'whatsapp',''))>30 then raise exception 'invalid contact';end if;
 insert into guest_contacts(event_id,guest_id,email,whatsapp) values(p_event,eid,trim(coalesce(p_payload->>'email','')),regexp_replace(coalesce(p_payload->>'whatsapp',''),'[^0-9]','','g'))
 on conflict(guest_id) do update set email=case when p_payload ? 'email' then excluded.email else guest_contacts.email end,whatsapp=case when p_payload ? 'whatsapp' then excluded.whatsapp else guest_contacts.whatsapp end;
 -- Existing consent values and their timestamp deliberately remain untouched.
 end if;
 insert into rsvps(event_id,guest_id) values(p_event,eid) on conflict(guest_id) do nothing;
 if old_guest.invitation_id is not null and old_guest.invitation_id<>target then insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'GUEST_MOVE','guests',eid);end if;
 when 'GUEST_REMOVE' then
 select * into old_guest from guests where event_id=p_event and id=eid for update;if not found then raise exception 'not found';end if;
 if old_guest.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 update invitations set primary_guest_id=null,version=version+1 where event_id=p_event and primary_guest_id=eid;
 update guests set companion_of=null where event_id=p_event and companion_of=eid;
 delete from guests where id=eid and event_id=p_event;
 -- A removed record never causes automatic deletion of the corresponding sheet row.
 when 'FAMILY_MERGE' then
 target=(p_payload->>'target_id')::uuid;
 if target=eid then raise exception 'invalid merge';end if;
 perform 1 from invitations where event_id=p_event and id=target and active for update;if not found then raise exception 'invalid target';end if;
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id in(select id from guests where invitation_id=eid) and revoked_at is null;
 update guests set invitation_id=target,version=version+1 where event_id=p_event and invitation_id=eid;
 update invitations set active=false,code_hash=null,primary_guest_id=null,version=version+1 where id=eid;
 update invitations set version=version+1 where id=target;
 delete from invitation_sessions where event_id=p_event and invitation_id in(eid,target);
 when 'FAMILY_SPLIT' then
 if jsonb_array_length(p_payload->'guest_ids')<1 then raise exception 'empty split';end if;
 if exists(select 1 from jsonb_array_elements_text(p_payload->'guest_ids') x where not exists(select 1 from guests g where g.id=x.value::uuid and g.event_id=p_event and g.invitation_id=eid)) then raise exception 'invalid split';end if;
 insert into invitations(event_id,name) values(p_event,trim(p_payload->>'name')) returning id into target;
 update invitations set primary_guest_id=null,version=version+1 where id=eid;
 update guests set invitation_id=target,companion_of=null,version=version+1 where event_id=p_event and id in(select value::uuid from jsonb_array_elements_text(p_payload->'guest_ids'));
 update guests set companion_of=null where event_id=p_event and invitation_id=eid and companion_of in(select id from guests where invitation_id=target);
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id in(select id from guests where invitation_id=target) and revoked_at is null;
 delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 when 'GIFT_SAVE' then
 if eid is null then
 insert into gifts(event_id,title,description,image_url,external_url,price_label,active,sort_order,reservation_enabled) values(p_event,trim(p_payload->>'title'),coalesce(p_payload->>'description',''),p_payload->>'image_url',p_payload->>'external_url',coalesce(p_payload->>'price_label',''),coalesce((p_payload->>'active')::boolean,true),coalesce((p_payload->>'sort_order')::integer,0),coalesce((p_payload->>'reservation_enabled')::boolean,false));
 else
 select version into v from gifts where event_id=p_event and id=eid for update;if not found then raise exception 'not found';end if;
 if v is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 update gifts set title=trim(p_payload->>'title'),description=p_payload->>'description',image_url=p_payload->>'image_url',external_url=p_payload->>'external_url',price_label=p_payload->>'price_label',active=(p_payload->>'active')::boolean,sort_order=(p_payload->>'sort_order')::integer,reservation_enabled=(p_payload->>'reservation_enabled')::boolean,version=version+1 where id=eid;
 end if;
 when 'GIFT_DELETE' then
 select version into v from gifts where event_id=p_event and id=eid for update;
 if v is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 delete from gifts where id=eid and event_id=p_event;
 when 'RULE_SAVE' then
 select version into v from notification_rules where event_id=p_event and id=eid for update;
 if v is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 update notification_rules set title=p_payload->>'title',body=p_payload->>'body',active=(p_payload->>'active')::boolean,channels=array(select jsonb_array_elements_text(p_payload->'channels')::delivery_channel),version=version+1 where id=eid;
 when 'EVENT_SAVE' then update events set venue_name=p_payload->>'venue_name',address=p_payload->>'address',latitude=(p_payload->>'latitude')::double precision,longitude=(p_payload->>'longitude')::double precision where id=p_event;
 insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'LOCATION_UPDATE','events',p_event);
 when 'CHECKIN_REVERT' then delete from checkins where event_id=p_event and id=eid;
 when 'MESSAGE_READ' then update messages set read_at=now() where event_id=p_event and id=eid;
 else raise exception 'unknown admin action';end case;
 if p_action in ('INVITATION_SAVE','PIN_SAVE','ACCESS_REVOKE','CODE_BLOCK','INVITATION_DISABLE','FAMILY_MERGE','FAMILY_SPLIT','GUEST_SAVE','GUEST_REMOVE') then
 insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),p_action,case when p_action like 'GUEST_%' then 'guests' else 'invitations' end,eid);end if;
 if p_action='INVITATION_SAVE' and inv.primary_guest_id is distinct from (select primary_guest_id from invitations where id=eid) then insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'PRIMARY_CHANGE','invitations',eid);end if;
 return jsonb_build_object('ok',true,'id',eid,'target_id',target);
end $$;

create or replace function app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role app_role:=event_role(p_event);gid uuid:=(p_payload->>'guest_id')::uuid;inv uuid:=my_invitation(p_event);tid uuid;mid uuid;recipient uuid;msg text;chan delivery_channel;method text;
begin
 if role is null then raise exception 'unauthorized';end if;
 insert into mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then return jsonb_build_object('duplicate',true);end if;
 if gid is not null then
 perform 1 from guests where id=gid and event_id=p_event for update;
 if not found then raise exception 'invalid guest';end if;
 if role='GUEST' and not owns_guest(p_event,gid) then raise exception 'unauthorized';end if;
 end if;
 if role='CEREMONIALIST' and p_type<>'CHECKIN_CREATE' then raise exception 'unauthorized';end if;
 case p_type
 when 'RSVP_UPDATE' then
 insert into rsvps(event_id,guest_id,status,dietary,note,responded_at,source) values(p_event,gid,(p_payload->>'status')::rsvp_status,coalesce(p_payload->>'dietary',''),coalesce(p_payload->>'note',''),now(),'APP') on conflict(guest_id) do update set status=excluded.status,dietary=excluded.dietary,note=excluded.note,responded_at=now(),source='APP';
 if p_payload->>'status'<>'CONFIRMED' then update qr_credentials set revoked_at=now() where event_id=p_event and guest_id=gid and revoked_at is null;end if;
 when 'CONTACT_UPDATE' then
 if length(coalesce(p_payload->>'email',''))>320 or length(coalesce(p_payload->>'whatsapp',''))>30 then raise exception 'invalid contact';end if;
 insert into guest_contacts(event_id,guest_id,email,whatsapp,consent_in_app,consent_push,consent_email,consent_whatsapp) values(p_event,gid,coalesce(p_payload->>'email',''),regexp_replace(coalesce(p_payload->>'whatsapp',''),'[^0-9]','','g'),coalesce((p_payload->>'consent_in_app')::boolean,false),coalesce((p_payload->>'consent_push')::boolean,false),coalesce((p_payload->>'consent_email')::boolean,false),coalesce((p_payload->>'consent_whatsapp')::boolean,false)) on conflict(guest_id) do update set email=excluded.email,whatsapp=excluded.whatsapp,consent_in_app=excluded.consent_in_app,consent_push=excluded.consent_push,consent_email=excluded.consent_email,consent_whatsapp=excluded.consent_whatsapp,consent_changed_at=now();
 if not coalesce((p_payload->>'consent_push')::boolean,false) then update device_push_tokens set active=false where event_id=p_event and guest_id=gid;end if;
 when 'GIFT_SELECT' then
 if not exists(select 1 from gifts where id=(p_payload->>'gift_id')::uuid and event_id=p_event and active) then raise exception 'invalid gift';end if;
 if (p_payload->>'selected')::boolean then insert into gift_selections(event_id,guest_id,gift_id) values(p_event,gid,(p_payload->>'gift_id')::uuid) on conflict do nothing;else delete from gift_selections where guest_id=gid and gift_id=(p_payload->>'gift_id')::uuid and event_id=p_event;end if;
 when 'PUSH_REGISTER' then
 if not exists(select 1 from guest_contacts where guest_id=gid and event_id=p_event and consent_push) or p_payload->>'token' !~ '^(ExponentPushToken|ExpoPushToken)\[.{1,200}\]$' then raise exception 'push not allowed';end if;
 insert into device_push_tokens(event_id,guest_id,user_id,token,platform) values(p_event,gid,auth.uid(),p_payload->>'token',p_payload->>'platform') on conflict(event_id,user_id,guest_id,token) do update set active=true;
 when 'CHECKIN_CREATE' then
 if role not in ('ADMIN','CEREMONIALIST') then raise exception 'unauthorized';end if;
 if not exists(select 1 from rsvps where event_id=p_event and guest_id=gid and status='CONFIRMED') then raise exception 'not confirmed';end if;
 method=p_payload->>'method';if method not in ('QR','MANUAL') then raise exception 'invalid method';end if;
 if method='QR' and not exists(select 1 from qr_credentials where event_id=p_event and guest_id=gid and token_hash=p_payload->>'token_hash' and revoked_at is null) then raise exception 'invalid QR';end if;
 insert into checkins(event_id,guest_id,mutation_id,method,actor_id) values(p_event,gid,p_mutation,method,auth.uid()) on conflict(event_id,guest_id) do nothing;
 return (select to_jsonb(c)||jsonb_build_object('duplicate',c.mutation_id<>p_mutation) from checkins c where event_id=p_event and guest_id=gid);
 when 'MESSAGE_SEND' then
 if role='ADMIN' then inv=(p_payload->>'invitation_id')::uuid;recipient=(p_payload->>'recipient_guest_id')::uuid;end if;
 if inv is not null and not exists(select 1 from invitations where id=inv and event_id=p_event and active) then raise exception 'invalid invitation';end if;
 if recipient is not null and not exists(select 1 from guests where id=recipient and event_id=p_event and invitation_id=inv) then raise exception 'invalid recipient';end if;
 if role='GUEST' and p_payload->>'sender_guest_id' is not null and not owns_guest(p_event,(p_payload->>'sender_guest_id')::uuid) then raise exception 'invalid sender';end if;
 msg=trim(p_payload->>'content');
 insert into message_threads(event_id,invitation_id) values(p_event,inv) on conflict(event_id,invitation_id) do update set updated_at=now() returning id into tid;
 insert into messages(event_id,thread_id,invitation_id,recipient_guest_id,sender_guest_id,sender_user_id,from_admin,content,channels) values(p_event,tid,inv,recipient,case when role='GUEST' then (p_payload->>'sender_guest_id')::uuid else null end,auth.uid(),role='ADMIN',msg,case when role='ADMIN' then array(select jsonb_array_elements_text(coalesce(p_payload->'channels','["IN_APP"]'))::delivery_channel) else '{IN_APP}'::delivery_channel[] end) returning id into mid;
 if role='ADMIN' then
 insert into message_recipients(event_id,message_id,guest_id) select p_event,mid,g.id from guests g join invitations i on i.id=g.invitation_id where g.event_id=p_event and i.active and (inv is null or g.invitation_id=inv) and (recipient is null or g.id=recipient);
 for chan in select jsonb_array_elements_text(coalesce(p_payload->'channels','["IN_APP"]'))::delivery_channel loop
 insert into notification_jobs(event_id,message_id,guest_id,channel,idempotency_key) select p_event,mid,mr.guest_id,chan,mid||':'||mr.guest_id||':'||chan from message_recipients mr where message_id=mid on conflict do nothing;
 end loop;
 if inv is null and coalesce(p_payload->'channels','["IN_APP"]') ? 'IN_APP' then insert into announcements(event_id,title,content) values(p_event,'Mensagem dos noivos',msg);end if;
 end if;
 else raise exception 'unknown mutation';end case;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function invitation_attempt_allowed(uuid,uuid,text,text,boolean),identify_invitation(uuid,uuid,text,text),redeem_invitation(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function identify_invitation(uuid,uuid,text,text),redeem_invitation(uuid,uuid,text,text,text) to service_role;
