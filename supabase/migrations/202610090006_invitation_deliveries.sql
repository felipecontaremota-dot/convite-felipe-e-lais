-- Incremental only: migrations 001–005 have already been applied in production.
create table invitation_deliveries (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade,
 invitation_id uuid not null, guest_id uuid not null, channel delivery_channel not null default 'EMAIL' check(channel='EMAIL'),
 request_id uuid not null, status text not null default 'pending' check(status in ('pending','sent','skipped','failed')),
 recipient_email text not null, provider text, provider_id text, error text check(length(error)<=300),
 created_at timestamptz not null default now(), sent_at timestamptz,
 foreign key(event_id,invitation_id) references invitations(event_id,id) on delete cascade,
 foreign key(event_id,guest_id) references guests(event_id,id) on delete cascade,
 unique(event_id,request_id,guest_id,channel),
 unique(event_id,request_id,invitation_id,recipient_email,channel)
);
create index invitation_deliveries_guest on invitation_deliveries(event_id,guest_id,created_at desc);
alter table invitation_deliveries enable row level security;
create policy admin_read on invitation_deliveries for select to authenticated using(event_role(event_id)='ADMIN');
grant select on invitation_deliveries to authenticated;
grant select,insert,update on invitation_deliveries to service_role;

-- Atomic reservation. Only its winner receives credentials, exclusively over service_role RPC.
-- A duplicate returns the recorded status even if the contact or access unit has since changed.
create function prepare_invitation_delivery(p_event uuid,p_request uuid,p_guest uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare g guests;i invitations; a invitation_access; d invitation_deliveries; email text;
begin
 perform pg_advisory_xact_lock(hashtextextended('invitation-send:'||p_event||':'||p_request,0));
 select * into d from invitation_deliveries where event_id=p_event and request_id=p_request and guest_id=p_guest and channel='EMAIL';
 if found then return jsonb_build_object('id',d.id,'status',d.status,'error',d.error,'duplicate',true);end if;
 select * into g from guests where event_id=p_event and id=p_guest;
 if not found then raise exception 'invalid recipient';end if;
 select * into i from invitations where event_id=p_event and id=g.invitation_id;
 select lower(trim(c.email)) into email from guest_contacts c where c.event_id=p_event and c.guest_id=p_guest;
 email=coalesce(email,'');
 select * into d from invitation_deliveries where event_id=p_event and request_id=p_request and invitation_id=i.id and recipient_email=email and channel='EMAIL';
 if found then return jsonb_build_object('id',d.id,'status',d.status,'error',d.error,'duplicate',true);end if;
 select * into a from invitation_access where event_id=p_event and invitation_id=i.id;
 insert into invitation_deliveries(event_id,invitation_id,guest_id,request_id,recipient_email,status,error)
 values(p_event,i.id,g.id,p_request,email,
 case when not i.active or i.archived_at is not null or i.code_hash is null or a.sharing_code is null or a.pin is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'skipped' else 'pending' end,
 case when email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'E-mail ausente ou inválido' when not i.active or i.archived_at is not null or i.code_hash is null or a.sharing_code is null or a.pin is null then 'Convite indisponível' end)
 on conflict do nothing returning * into d;
 if not found then raise exception 'delivery reservation conflict';end if;
 return jsonb_build_object('id',d.id,'status',d.status,'error',d.error,'duplicate',false)
 ||case when d.status='pending' then jsonb_build_object('email',email,'name',g.name,'unit_name',i.name,'code',a.sharing_code,'password',a.pin) else '{}'::jsonb end;
end $$;
create function finish_invitation_delivery(p_id uuid,p_status text,p_provider text,p_provider_id text,p_error text) returns void
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare d invitation_deliveries;
begin
 if p_status not in ('sent','skipped','failed') then raise exception 'invalid status';end if;
 update invitation_deliveries set status=p_status,provider=p_provider,provider_id=p_provider_id,error=left(p_error,300),sent_at=case when p_status='sent' then now() end
 where id=p_id and status='pending' returning * into d;
 if found and p_status='sent' then
 update invitations set sent_at=coalesce(sent_at,now()),sent_channel='EMAIL' where event_id=d.event_id and id=d.invitation_id;
 end if;
end $$;
revoke all on function prepare_invitation_delivery(uuid,uuid,uuid),finish_invitation_delivery(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function prepare_invitation_delivery(uuid,uuid,uuid),finish_invitation_delivery(uuid,text,text,text,text) to service_role;

-- Preserve the worker API; add a bounded, event-specific claim for authenticated ADMIN dispatch.
create function claim_event_notifications(p_event uuid,p_limit integer default 50,p_message uuid default null) returns setof notification_jobs
language sql security definer set search_path=public,extensions,pg_temp as $$
 update notification_jobs set status='processing',locked_at=now(),attempts=attempts+1
 where id in(select id from notification_jobs where event_id=p_event and (p_message is null or message_id=p_message) and attempts<6
 and ((status in ('pending','failed') and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '10 minutes'))
 order by created_at,id for update skip locked limit greatest(0,least(p_limit,50))) returning *;
$$;
revoke all on function claim_event_notifications(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function claim_event_notifications(uuid,integer,uuid) to service_role;
alter function app_snapshot(uuid) rename to app_snapshot_v5;
revoke all on function app_snapshot_v5(uuid) from public,anon,authenticated,service_role;
create function app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 return app_snapshot_v5(p_event)||jsonb_build_object('invitation_deliveries',(
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'guest_id',guest_id,'invitation_id',invitation_id,'recipient_email',recipient_email,'status',status,'sent_at',sent_at,'created_at',created_at) order by created_at desc),'[]')
 from invitation_deliveries where event_id=p_event and event_role(p_event)='ADMIN'));
end $$;
revoke all on function app_snapshot(uuid) from public,anon;
grant execute on function app_snapshot(uuid) to authenticated;
create function invitation_delivery_targets(p_event uuid) returns jsonb language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select coalesce(jsonb_agg(g.id order by g.id),'[]') from guests g join invitations i on i.event_id=g.event_id and i.id=g.invitation_id
 join guest_contacts c on c.event_id=g.event_id and c.guest_id=g.id
 where g.event_id=p_event and i.active and i.archived_at is null and trim(c.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;
revoke all on function invitation_delivery_targets(uuid) from public,anon,authenticated;
grant execute on function invitation_delivery_targets(uuid) to service_role;
