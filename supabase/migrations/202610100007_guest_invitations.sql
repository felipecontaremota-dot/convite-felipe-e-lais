-- Guest identity follows the existing shared FAMILY trust model; it is not individual authentication.
alter type rsvp_status add value if not exists 'MAYBE';
alter table guests add column salutation text not null default 'NEUTRAL' check(salutation in ('NEUTRAL','MALE','FEMALE'));
alter table guest_contacts add column notifications_revoked boolean;
alter table invitation_sessions add column identified_guest_id uuid references guests(id) on delete set null;

create function current_guest(p_event uuid) returns uuid language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select case when i.kind='INDIVIDUAL' then i.primary_guest_id else s.identified_guest_id end
 from invitation_sessions s join invitations i on i.id=s.invitation_id
 where s.event_id=p_event and s.user_id=auth.uid() and i.id=my_invitation(p_event)
 and (i.kind='INDIVIDUAL' or exists(select 1 from guests g where g.event_id=p_event and g.id=s.identified_guest_id and g.invitation_id=i.id));
$$;
create function identify_guest(p_event uuid,p_guest uuid) returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 if event_role(p_event) is distinct from 'GUEST' or not owns_guest(p_event,p_guest) then raise exception 'unauthorized';end if;
 update invitation_sessions set identified_guest_id=p_guest where event_id=p_event and user_id=auth.uid();
end $$;
create function manages_guest_ticket(p_event uuid,p_guest uuid) returns boolean language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select event_role(p_event)='ADMIN' or (owns_guest(p_event,p_guest) and (current_guest(p_event)=p_guest or exists(select 1 from invitations where id=my_invitation(p_event) and primary_guest_id=current_guest(p_event))));
$$;

-- Existing explicit primary_guest_id is retained. No head is inferred from member order.
create function validate_family_head() returns trigger language plpgsql as $$
begin
 if exists(select 1 from invitations i where (case when TG_TABLE_NAME='invitations' then i.id=NEW.id else i.primary_guest_id=coalesce(NEW.id,OLD.id) end) and i.primary_guest_id is not null and not exists(select 1 from guests g where g.event_id=i.event_id and g.id=i.primary_guest_id and g.invitation_id=i.id)) then raise exception 'invalid family head';end if;
 return null;
end $$;
create constraint trigger family_head_integrity after insert or update on invitations deferrable initially deferred for each row execute function validate_family_head();
create constraint trigger family_head_membership after update or delete on guests deferrable initially deferred for each row execute function validate_family_head();

create table family_qr_credentials (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,
 invitation_id uuid not null,token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),issued_at timestamptz not null default now(),revoked_at timestamptz,
 foreign key(event_id,invitation_id) references invitations(event_id,id) on delete cascade
);
create unique index family_qr_active on family_qr_credentials(event_id,invitation_id) where revoked_at is null;
alter table family_qr_credentials enable row level security;
create policy admin_read on family_qr_credentials for select to authenticated using(event_role(event_id)='ADMIN');
grant select on family_qr_credentials to authenticated;

create table guest_checkin_notices (
 id uuid primary key default gen_random_uuid(),event_id uuid not null references events(id) on delete cascade,
 checkin_id uuid not null unique references checkins(id) on delete cascade,recipient_guest_id uuid not null references guests(id) on delete cascade,
 content text not null,created_at timestamptz not null default now()
);
alter table guest_checkin_notices enable row level security;
create policy recipient_read on guest_checkin_notices for select to authenticated using(event_role(event_id)='ADMIN' or current_guest(event_id)=recipient_guest_id);
grant select on guest_checkin_notices to authenticated;

alter function admin_action(uuid,text,jsonb) rename to admin_action_v6;
create function admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb;
begin
 if event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if p_action in ('GUEST_CREATE','GUEST_UPDATE') and p_payload ? 'salutation' and p_payload->>'salutation' not in ('NEUTRAL','MALE','FEMALE') then raise exception 'invalid salutation';end if;
 result=admin_action_v6(p_event,p_action,p_payload);
 if p_action in ('GUEST_CREATE','GUEST_UPDATE') and p_payload ? 'salutation' then
 update guests set salutation=p_payload->>'salutation' where event_id=p_event and id=(result->>'id')::uuid;
 end if;
 return result;
end $$;
revoke all on function admin_action_v6(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function admin_action(uuid,text,jsonb) to authenticated;

create or replace function issue_ticket(p_event uuid,p_guest uuid,p_regenerate boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare token text:=encode(gen_random_bytes(32),'hex');
begin
 if not coalesce(manages_guest_ticket(p_event,p_guest),false) then raise exception 'unauthorized';end if;
 perform 1 from guests g join invitations i on i.id=g.invitation_id where g.event_id=p_event and g.id=p_guest and i.active and i.archived_at is null for update of g;
 if not found then raise exception 'invalid guest';end if;
 if not p_regenerate and exists(select 1 from qr_credentials where event_id=p_event and guest_id=p_guest and revoked_at is null) then raise exception 'ticket_exists';end if;
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id=p_guest and revoked_at is null;
 insert into qr_credentials(event_id,guest_id,token_hash) values(p_event,p_guest,encode(digest(token,'sha256'),'hex'));
 return jsonb_build_object('guest_id',p_guest,'token',token);
end $$;
create function issue_family_ticket(p_event uuid,p_invitation uuid,p_regenerate boolean default false) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare i invitations;token text:=encode(gen_random_bytes(32),'hex');
begin
 select * into i from invitations where event_id=p_event and id=p_invitation and kind='FAMILY' and active and archived_at is null for update;
 if not found or (event_role(p_event) is distinct from 'ADMIN' and (my_invitation(p_event) is distinct from i.id or current_guest(p_event) is distinct from i.primary_guest_id or i.primary_guest_id is null)) then raise exception 'unauthorized';end if;
 if not p_regenerate and exists(select 1 from family_qr_credentials where event_id=p_event and invitation_id=i.id and revoked_at is null) then raise exception 'ticket_exists';end if;
 update family_qr_credentials set revoked_at=now() where event_id=p_event and invitation_id=i.id and revoked_at is null;
 insert into family_qr_credentials(event_id,invitation_id,token_hash) values(p_event,i.id,encode(digest(token,'sha256'),'hex'));
 return jsonb_build_object('invitation_id',i.id,'token',token);
end $$;

-- Staff-only resolution, opaque credential in / individual or family result out.
create function resolve_checkin_ticket(p_event uuid,p_token text) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare gid uuid;iid uuid;kind text;
begin
 if event_role(p_event) not in ('ADMIN','CEREMONIALIST') or event_role(p_event) is null then raise exception 'unauthorized';end if;
 if p_token !~ '^[a-f0-9]{64}$' then raise exception 'invalid QR';end if;
 select q.guest_id into gid from qr_credentials q join guests g on g.id=q.guest_id join invitations i on i.id=g.invitation_id where q.event_id=p_event and q.token_hash=encode(digest(p_token,'sha256'),'hex') and q.revoked_at is null and i.active and i.archived_at is null;
 if found then kind='INDIVIDUAL';else
 select q.invitation_id into iid from family_qr_credentials q join invitations i on i.id=q.invitation_id where q.event_id=p_event and q.token_hash=encode(digest(p_token,'sha256'),'hex') and q.revoked_at is null and i.kind='FAMILY' and i.active and i.archived_at is null;
 if not found then raise exception 'invalid QR';end if;kind='FAMILY';end if;
 return jsonb_build_object('kind',kind,'title',case when kind='FAMILY' then coalesce((select g.name||' e Família' from invitations i join guests g on g.id=i.primary_guest_id where i.id=iid),(select name from invitations where id=iid)) else (select name from guests where id=gid) end,'guests',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'selected',true,'checked_in',exists(select 1 from checkins c where c.event_id=p_event and c.guest_id=g.id)) order by g.name),'[]') from guests g where g.event_id=p_event and (g.id=gid or g.invitation_id=iid)));
end $$;

alter function app_mutate(uuid,uuid,text,jsonb) rename to app_mutate_v6;
create function app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role app_role:=event_role(p_event);gid uuid;v_result jsonb;ids uuid[];iid uuid;qr uuid;method text;row checkins;head uuid;revoked boolean;
begin
 if p_type not in ('RSVP_UPDATE','CONTACT_UPDATE','CHECKIN_CREATE','CHECKIN_FAMILY') then return app_mutate_v6(p_event,p_mutation,p_type,p_payload);end if;
 if role is null or (role='CEREMONIALIST' and p_type not in ('CHECKIN_CREATE','CHECKIN_FAMILY')) then raise exception 'unauthorized';end if;
 select r.result into v_result from mutation_receipts r where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 if found then return coalesce(v_result,'{}')||jsonb_build_object('duplicate',true);end if;
 insert into mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then select r.result into v_result from mutation_receipts r where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;return coalesce(v_result,'{}')||jsonb_build_object('duplicate',true);end if;
 if p_type in ('RSVP_UPDATE','CONTACT_UPDATE') then
 gid=(p_payload->>'guest_id')::uuid;
 perform 1 from guests where event_id=p_event and id=gid for update;
 if not found or (role='GUEST' and not owns_guest(p_event,gid)) then raise exception 'unauthorized';end if;
 if p_type='RSVP_UPDATE' then
 insert into rsvps(event_id,guest_id,status,dietary,note,responded_at,source) values(p_event,gid,(p_payload->>'status')::rsvp_status,coalesce(p_payload->>'dietary',''),coalesce(p_payload->>'note',''),now(),'APP') on conflict(guest_id) do update set status=excluded.status,dietary=excluded.dietary,note=excluded.note,responded_at=now(),source='APP';
 -- RSVP never issues/revokes check-in credentials.
 else
 if p_payload ? 'notifications_revoked' and regexp_replace(coalesce(p_payload->>'whatsapp',''),'[^0-9]','','g') !~ '^([0-9]{11})?$' then raise exception 'invalid mobile';end if;
 if length(coalesce(p_payload->>'email',''))>320 or length(coalesce(p_payload->>'whatsapp',''))>30 then raise exception 'invalid contact';end if;
 revoked=(p_payload->>'notifications_revoked')::boolean;
 insert into guest_contacts(event_id,guest_id,email,whatsapp,consent_in_app,consent_push,consent_email,consent_whatsapp,notifications_revoked)
 values(p_event,gid,coalesce(p_payload->>'email',''),regexp_replace(coalesce(p_payload->>'whatsapp',''),'[^0-9]','','g'),coalesce(not revoked,(p_payload->>'consent_in_app')::boolean,false),coalesce(not revoked,(p_payload->>'consent_push')::boolean,false),coalesce(not revoked,(p_payload->>'consent_email')::boolean,false),coalesce(not revoked,(p_payload->>'consent_whatsapp')::boolean,false),revoked)
 on conflict(guest_id) do update set email=excluded.email,whatsapp=excluded.whatsapp,consent_in_app=excluded.consent_in_app,consent_push=excluded.consent_push,consent_email=excluded.consent_email,consent_whatsapp=excluded.consent_whatsapp,notifications_revoked=excluded.notifications_revoked,consent_changed_at=now();
 if revoked or not coalesce((p_payload->>'consent_push')::boolean,false) and revoked is null then update device_push_tokens set active=false where event_id=p_event and guest_id=gid;end if;
 end if;
 v_result=jsonb_build_object('ok',true);
 else
 if role not in ('ADMIN','CEREMONIALIST') then raise exception 'unauthorized';end if;
 method=coalesce(p_payload->>'method','QR');
 if method not in ('QR','MANUAL') then raise exception 'invalid method';end if;
 if p_type='CHECKIN_FAMILY' then
 if method<>'QR' then raise exception 'invalid method';end if;
 select q.invitation_id,q.id into iid,qr from family_qr_credentials q join invitations i on i.id=q.invitation_id where q.event_id=p_event and q.token_hash=p_payload->>'token_hash' and q.revoked_at is null and i.active and i.archived_at is null and i.kind='FAMILY' for update of q;
 if not found then raise exception 'invalid QR';end if;
 select array_agg(distinct value::uuid order by value::uuid) into ids from jsonb_array_elements_text(p_payload->'guest_ids');
 if coalesce(cardinality(ids),0)=0 or cardinality(ids)>500 or exists(select 1 from unnest(ids) x where not exists(select 1 from guests where event_id=p_event and id=x and invitation_id=iid)) then raise exception 'invalid selected members';end if;
 else
 gid=(p_payload->>'guest_id')::uuid;ids=array[gid];
 if method='QR' then
 perform 1 from qr_credentials q join guests g on g.id=q.guest_id join invitations i on i.id=g.invitation_id where q.event_id=p_event and q.guest_id=gid and q.token_hash=p_payload->>'token_hash' and q.revoked_at is null and i.active and i.archived_at is null for update of q;
 if not found then raise exception 'invalid QR';end if;
 end if;
 end if;
 v_result=jsonb_build_object('ok',true,'checkins','[]'::jsonb);
 foreach gid in array ids loop
 perform 1 from guests g join invitations i on i.id=g.invitation_id where g.event_id=p_event and g.id=gid and i.active and i.archived_at is null and (iid is null or g.invitation_id=iid) for update of g;
 if not found then raise exception 'invalid guest';end if;
 insert into checkins(event_id,guest_id,mutation_id,method,actor_id) values(p_event,gid,case when p_type='CHECKIN_CREATE' then p_mutation else gen_random_uuid() end,method,auth.uid()) on conflict(event_id,guest_id) do nothing returning * into row;
 if found and p_type='CHECKIN_CREATE' and method='QR' then
 select i.primary_guest_id into head from guests g join invitations i on i.id=g.invitation_id where g.id=gid and i.kind='FAMILY';
 if head is not null and head<>gid then insert into guest_checkin_notices(event_id,checkin_id,recipient_guest_id,content) values(p_event,row.id,head,(select name||' acabou de confirmar presença' from guests where id=gid)) on conflict(checkin_id) do nothing;end if;
 end if;
 v_result=jsonb_set(v_result,'{checkins}',(v_result->'checkins')||jsonb_build_array((select to_jsonb(c) from checkins c where c.event_id=p_event and c.guest_id=gid)));
 end loop;
 if p_type='CHECKIN_CREATE' then select to_jsonb(c)||jsonb_build_object('duplicate',c.mutation_id<>p_mutation) into v_result from checkins c where c.event_id=p_event and c.guest_id=gid;end if;
 end if;
 update mutation_receipts set result=v_result where event_id=p_event and user_id=auth.uid() and mutation_id=p_mutation;
 return v_result;
end $$;
revoke all on function app_mutate_v6(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function app_mutate(uuid,uuid,text,jsonb) to authenticated;

alter function app_snapshot(uuid) rename to app_snapshot_v6;
create function app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare s jsonb;role app_role:=event_role(p_event);
begin
 s=app_snapshot_v6(p_event);
 -- Attendance is independent of RSVP. Keep the ceremonial projection limited
 -- to active access units and continue withholding contacts and RSVP notes.
 if role='CEREMONIALIST' then
 s=jsonb_set(s,'{guests}',(select coalesce(jsonb_agg(to_jsonb(g) order by g.name),'[]') from guests g join invitations i on i.id=g.invitation_id where g.event_id=p_event and i.event_id=p_event and i.active and i.archived_at is null));
 s=jsonb_set(s,'{rsvps}',(select coalesce(jsonb_agg(jsonb_build_object('event_id',r.event_id,'guest_id',r.guest_id,'status',r.status,'dietary','','note','','responded_at',r.responded_at,'source',r.source)),'[]') from rsvps r join guests g on g.id=r.guest_id join invitations i on i.id=g.invitation_id where r.event_id=p_event and g.event_id=p_event and i.event_id=p_event and i.active and i.archived_at is null));
 end if;
 s=jsonb_set(s,'{credentials}',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from qr_credentials q where event_id=p_event and revoked_at is null and (role in ('ADMIN','CEREMONIALIST') or role='GUEST' and manages_guest_ticket(p_event,q.guest_id))));
 return s||jsonb_build_object('current_guest_id',current_guest(p_event),'family_credentials',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from family_qr_credentials q join invitations i on i.id=q.invitation_id where q.event_id=p_event and q.revoked_at is null and (role in ('ADMIN','CEREMONIALIST') or role='GUEST' and i.id=my_invitation(p_event) and i.primary_guest_id=current_guest(p_event))),
 'checkin_notices',(select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]') from guest_checkin_notices n where event_id=p_event and (role='ADMIN' or role='GUEST' and recipient_guest_id=current_guest(p_event) and not coalesce((select notifications_revoked from guest_contacts where guest_id=n.recipient_guest_id),false))));
end $$;
revoke all on function app_snapshot_v6(uuid) from public,anon,authenticated;
grant execute on function app_snapshot(uuid),identify_guest(uuid,uuid),issue_family_ticket(uuid,uuid,boolean),resolve_checkin_ticket(uuid,text) to authenticated;
revoke all on function identify_guest(uuid,uuid),issue_family_ticket(uuid,uuid,boolean),resolve_checkin_ticket(uuid,text) from public,anon;
