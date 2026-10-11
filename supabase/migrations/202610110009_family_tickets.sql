-- Separate entry credentials; website codes/PINs and prior migrations are untouched.
create table family_qr_credentials (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade,
 invitation_id uuid not null, token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz not null default now(), revoked_at timestamptz,
 foreign key(event_id,invitation_id) references invitations(event_id,id) on delete cascade
);
create unique index family_qr_active on family_qr_credentials(event_id,invitation_id) where revoked_at is null;
alter table family_qr_credentials enable row level security;
create policy family_qr_read on family_qr_credentials for select to authenticated using(
 event_role(event_id) in ('ADMIN','CEREMONIALIST') or event_role(event_id)='GUEST' and my_invitation(event_id)=invitation_id
);
grant select on family_qr_credentials to authenticated;

create function issue_family_ticket(p_event uuid,p_invitation uuid,p_regenerate boolean default false) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare token text:=encode(gen_random_bytes(32),'hex'); unit invitations;
begin
 if event_role(p_event) is distinct from 'ADMIN' and (event_role(p_event) is distinct from 'GUEST' or my_invitation(p_event) is distinct from p_invitation) then raise exception 'unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 select * into unit from invitations where event_id=p_event and id=p_invitation for update;
 if not found or unit.kind<>'FAMILY' or not unit.active or unit.archived_at is not null then raise exception 'invalid family';end if;
 if not exists(select 1 from guests g join rsvps r on r.guest_id=g.id and r.event_id=g.event_id where g.event_id=p_event and g.invitation_id=p_invitation and r.status='CONFIRMED') then raise exception 'not confirmed';end if;
 if p_regenerate is not true and exists(select 1 from family_qr_credentials where event_id=p_event and invitation_id=p_invitation and revoked_at is null) then raise exception 'ticket_exists';end if;
 update family_qr_credentials set revoked_at=now() where event_id=p_event and invitation_id=p_invitation and revoked_at is null;
 insert into family_qr_credentials(event_id,invitation_id,token_hash) values(p_event,p_invitation,encode(digest(token,'sha256'),'hex'));
 insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),case when p_regenerate then 'FAMILY_QR_ROTATE' else 'FAMILY_QR_ISSUE' end,'invitations',p_invitation);
 return jsonb_build_object('invitation_id',p_invitation,'token',token);
end$$;
revoke all on function issue_family_ticket(uuid,uuid,boolean) from public,anon;
grant execute on function issue_family_ticket(uuid,uuid,boolean) to authenticated,service_role;

alter function app_snapshot(uuid) rename to app_snapshot_v8;
revoke all on function app_snapshot_v8(uuid) from public,anon,authenticated,service_role;
create function app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 return app_snapshot_v8(p_event)||jsonb_build_object('family_credentials',(
 select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) from family_qr_credentials c where event_id=p_event and
 (event_role(p_event) in ('ADMIN','CEREMONIALIST') or event_role(p_event)='GUEST' and my_invitation(p_event)=c.invitation_id)));
end$$;
revoke all on function app_snapshot(uuid) from public,anon;
grant execute on function app_snapshot(uuid) to authenticated,service_role;

alter function app_mutate(uuid,uuid,text,jsonb) rename to app_mutate_v8;
revoke all on function app_mutate_v8(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare unit invitations; gids uuid[]; gid uuid; arriving guests; entry checkins; response jsonb; prior jsonb;
 inserted boolean; entries jsonb:='[]'; tid uuid; mid uuid; primary_id uuid;
begin
 if p_type is distinct from 'CHECKIN_CREATE' and p_type is distinct from 'CHECKIN_FAMILY_CREATE' then return app_mutate_v8(p_event,p_mutation,p_type,p_payload);end if;
 if event_role(p_event) is null or event_role(p_event) not in ('ADMIN','CEREMONIALIST') then raise exception 'unauthorized';end if;
 select result into prior from mutation_receipts where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 if found then return coalesce(prior,'{}')||jsonb_build_object('duplicate',true);end if;
 -- Same event lock as administrative membership edits, then deterministic member locks.
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 insert into mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then select result into prior from mutation_receipts where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;return coalesce(prior,'{}')||jsonb_build_object('duplicate',true);end if;
 if p_type='CHECKIN_FAMILY_CREATE' then
  select * into unit from invitations where event_id=p_event and id=(p_payload->>'invitation_id')::uuid for update;
  if not found or unit.kind<>'FAMILY' or not unit.active or unit.archived_at is not null then raise exception 'invalid family';end if;
  if not exists(select 1 from family_qr_credentials where event_id=p_event and invitation_id=unit.id and token_hash=p_payload->>'token_hash' and revoked_at is null) then raise exception 'invalid family QR';end if;
  if jsonb_typeof(p_payload->'guest_ids') is distinct from 'array' or jsonb_array_length(p_payload->'guest_ids')=0 then raise exception 'invalid members';end if;
  select array_agg(distinct value::uuid order by value::uuid) into gids from jsonb_array_elements_text(p_payload->'guest_ids');
 else
  gid=(p_payload->>'guest_id')::uuid;
  select * into unit from invitations where event_id=p_event and id=(select invitation_id from guests where event_id=p_event and id=gid) for update;
  if not found or not unit.active or unit.archived_at is not null then raise exception 'invalid guest';end if;
  gids=array[gid];
  if p_payload->>'method' is null or p_payload->>'method' not in ('QR','MANUAL') then raise exception 'invalid method';end if;
 end if;
 perform 1 from guests where event_id=p_event and id=any(gids) order by id for update;
 -- Validate the WHOLE selection before writing any arrivals.
 if cardinality(gids)<>(select count(*) from guests g join rsvps r on r.event_id=g.event_id and r.guest_id=g.id where g.event_id=p_event and g.invitation_id=unit.id and g.id=any(gids) and r.status='CONFIRMED') then raise exception 'invalid or unconfirmed members';end if;
 if p_type='CHECKIN_CREATE' and p_payload->>'method'='QR' and not exists(select 1 from qr_credentials where event_id=p_event and guest_id=gid and token_hash=p_payload->>'token_hash' and revoked_at is null) then raise exception 'invalid QR';end if;
 foreach gid in array gids loop
  insert into checkins(event_id,guest_id,mutation_id,method,actor_id)
  values(p_event,gid,case when p_type='CHECKIN_CREATE' then p_mutation else gen_random_uuid() end,case when p_type='CHECKIN_FAMILY_CREATE' then 'QR' else p_payload->>'method' end,auth.uid()) on conflict(event_id,guest_id) do nothing returning * into entry;
  inserted=found;
  if not inserted then select * into entry from checkins where event_id=p_event and guest_id=gid;end if;
  entries=entries||jsonb_build_array(to_jsonb(entry)||jsonb_build_object('duplicate',not inserted));
  if inserted then
   insert into audit_logs(event_id,actor,action,entity,entity_id,metadata) values(p_event,auth.uid(),'CHECKIN_CREATE','checkins',entry.id,jsonb_build_object('source',p_type,'mutation_id',p_mutation));
   -- Individual arrivals use the existing IN_APP inbox; never mutate RSVP.
   primary_id=unit.primary_guest_id;
   if p_type='CHECKIN_CREATE' and unit.kind='FAMILY' and primary_id is not null and primary_id<>gid and exists(
     select 1 from guests recipient left join guest_contacts c on c.event_id=recipient.event_id and c.guest_id=recipient.id
     where recipient.event_id=p_event and recipient.invitation_id=unit.id and recipient.id=primary_id and coalesce(c.consent_in_app,true) and not coalesce(c.communications_revoked,false)
   ) then
    select * into arriving from guests where id=gid and event_id=p_event;
    insert into message_threads(event_id,invitation_id) values(p_event,unit.id) on conflict(event_id,invitation_id) do update set updated_at=now() returning id into tid;
    insert into messages(event_id,thread_id,invitation_id,recipient_guest_id,sender_user_id,from_admin,channels,content)
    values(p_event,tid,unit.id,primary_id,auth.uid(),true,'{IN_APP}',arriving.name||' acabou de confirmar presença') returning id into mid;
    insert into message_recipients(event_id,message_id,guest_id) values(p_event,mid,primary_id);
    insert into audit_logs(event_id,actor,action,entity,entity_id,metadata) values(p_event,auth.uid(),'CHECKIN_NOTIFICATION','messages',mid,jsonb_build_object('checkin_id',entry.id,'event_type','CHECK_IN'));
   end if;
  end if;
 end loop;
 response=case when p_type='CHECKIN_CREATE' then entries->0 else jsonb_build_object('ok',true,'checkins',entries) end;
 update mutation_receipts set result=response where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 return response;
end$$;
revoke all on function app_mutate(uuid,uuid,text,jsonb) from public,anon;
grant execute on function app_mutate(uuid,uuid,text,jsonb) to authenticated,service_role;
