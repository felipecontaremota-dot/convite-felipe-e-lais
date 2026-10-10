-- Incremental only: migrations 001–005 have already been applied in production.
create table invitation_deliveries (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade,
 invitation_id uuid not null, guest_id uuid not null, channel delivery_channel not null default 'EMAIL' check(channel='EMAIL'),
 request_id uuid not null, status text not null default 'pending' check(status in ('pending','sent','skipped','failed')),
 recipient_email text not null, provider text, provider_id text, error text check(length(error)<=300),
 created_at timestamptz not null default now(), sent_at timestamptz,
 attempts integer not null default 0 check(attempts>=0), locked_at timestamptz, last_attempt_at timestamptz,
 first_attempt_at timestamptz, claim_token uuid, superseded_by uuid, payload_hash text check(payload_hash ~ '^[a-f0-9]{64}$'),
 foreign key(event_id,invitation_id) references invitations(event_id,id) on delete cascade,
 -- guest_id is a historical identifier: guest deletion must not erase uncertain delivery outcomes.
 unique(event_id,request_id,guest_id,channel),
 unique(event_id,request_id,invitation_id,recipient_email,channel)
);
create index invitation_deliveries_guest on invitation_deliveries(event_id,guest_id,created_at desc);
alter table invitation_deliveries enable row level security;
create policy admin_read on invitation_deliveries for select to authenticated using(event_role(event_id)='ADMIN');
grant select on invitation_deliveries to authenticated;
grant select,insert,update on invitation_deliveries to service_role;

-- Keep operation identity if a guest/delivery is later deleted; no contact or credentials.
create table invitation_delivery_members(event_id uuid references events(id) on delete cascade,request_id uuid not null,guest_id uuid not null,delivery_id uuid references invitation_deliveries(id) on delete set null,primary key(event_id,request_id,guest_id));
alter table invitation_delivery_members enable row level security;

-- Atomic reservation; credentials are returned only by the service_role RPC.
-- Terminal duplicates return their recorded status; pending retries must acquire a lease.
create function prepare_invitation_delivery(p_event uuid,p_request uuid,p_guest uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare g guests;i invitations; a invitation_access; d invitation_deliveries; email text; duplicate boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtextextended('invitation-send:'||p_event||':'||p_request,0));
 if exists(select 1 from invitation_delivery_members where event_id=p_event and request_id=p_request and guest_id=p_guest and delivery_id is null) then return jsonb_build_object('id',null,'status','pending','reason','payload_changed');end if;
 select * into d from invitation_deliveries where event_id=p_event and request_id=p_request and (guest_id=p_guest or id=(select delivery_id from invitation_delivery_members where event_id=p_event and request_id=p_request and guest_id=p_guest)) and channel='EMAIL';
 if not found then
   select * into g from guests where event_id=p_event and id=p_guest;
   if not found then raise exception 'invalid recipient';end if;
   select * into i from invitations where event_id=p_event and id=g.invitation_id;
   select lower(trim(c.email)) into email from guest_contacts c where c.event_id=p_event and c.guest_id=p_guest;
   email=coalesce(email,'');
   select * into d from invitation_deliveries where event_id=p_event and request_id=p_request and invitation_id=i.id and recipient_email=email and channel='EMAIL';
   if not found then
     select * into a from invitation_access where event_id=p_event and invitation_id=i.id;
     insert into invitation_deliveries(event_id,invitation_id,guest_id,request_id,recipient_email,status,error)
     values(p_event,i.id,g.id,p_request,email,
     case when not i.active or i.archived_at is not null or i.code_hash is null or a.sharing_code is null or a.pin is null or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'skipped' else 'pending' end,
     case when email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'E-mail ausente ou inválido' when not i.active or i.archived_at is not null or i.code_hash is null or a.sharing_code is null or a.pin is null then 'Convite indisponível' end) returning * into d;
   else duplicate=true;end if;
 else duplicate=true;end if;
 insert into invitation_delivery_members(event_id,request_id,guest_id,delivery_id) values(p_event,p_request,p_guest,d.id) on conflict do nothing;
 if d.status<>'pending' then return jsonb_build_object('id',d.id,'status',d.status,'error',d.error,'duplicate',duplicate);end if;
 -- Reconstruct using the reservation's original guest, including family dedup aliases.
 select * into g from guests where event_id=p_event and id=d.guest_id;
 select * into i from invitations where event_id=p_event and id=d.invitation_id;
 select * into a from invitation_access where event_id=p_event and invitation_id=d.invitation_id;
 select lower(trim(c.email)) into email from guest_contacts c where c.event_id=p_event and c.guest_id=g.id;
 return jsonb_build_object('id',d.id,'status',d.status,'duplicate',duplicate,'email',d.recipient_email,'name',g.name,'code',a.sharing_code,'password',a.pin,
 'attempted',d.attempts>0,'available',coalesce(g.invitation_id=d.invitation_id and i.active and i.archived_at is null and i.code_hash is not null and a.sharing_code is not null and a.pin is not null and (d.attempts=0 or email=d.recipient_email),false));
end $$;
create function claim_invitation_delivery(p_id uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare d invitation_deliveries; token uuid;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid payload hash';end if;
 select * into d from invitation_deliveries where id=p_id for update;
 if not found then raise exception 'invalid delivery';end if;
 if d.status<>'pending' then return jsonb_build_object('claimed',false,'status',d.status);end if;
 if d.superseded_by is not null then return jsonb_build_object('claimed',false,'status','pending','reason','superseded');end if;
 if d.locked_at>clock_timestamp()-interval '2 minutes' then return jsonb_build_object('claimed',false,'status','pending','reason','processing');end if;
 -- Use the FIRST attempt as the fixed 24h deadline; retries must not slide the window.
 if d.first_attempt_at<=clock_timestamp()-interval '24 hours' then
   update invitation_deliveries set error='Resultado não confirmado; janela segura expirada' where id=p_id;
   return jsonb_build_object('claimed',false,'status','pending','reason','expired');
 end if;
 if d.payload_hash is not null and d.payload_hash<>p_hash then
   update invitation_deliveries set error='Dados do convite alterados; resultado anterior não confirmado' where id=p_id;
   return jsonb_build_object('claimed',false,'status','pending','reason','payload_changed');
 end if;
 token=gen_random_uuid();
 update invitation_deliveries set attempts=attempts+1,locked_at=clock_timestamp(),last_attempt_at=clock_timestamp(),first_attempt_at=coalesce(first_attempt_at,clock_timestamp()),payload_hash=coalesce(payload_hash,p_hash),claim_token=token where id=p_id;
 return jsonb_build_object('claimed',true,'status','pending','token',token);
end $$;
create function finish_invitation_delivery(p_id uuid,p_status text,p_provider text,p_provider_id text,p_error text,p_claim uuid) returns boolean
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare d invitation_deliveries;
begin
 if p_status not in ('pending','sent','skipped','failed') then raise exception 'invalid status';end if;
 update invitation_deliveries set status=p_status,provider=p_provider,provider_id=p_provider_id,error=left(p_error,300),sent_at=case when p_status='sent' then clock_timestamp() end,locked_at=null,claim_token=null
 where id=p_id and status='pending' and claim_token=p_claim returning * into d;
 if not found then return false;end if;
 if p_status='sent' then update invitations set sent_at=coalesce(sent_at,clock_timestamp()),sent_channel='EMAIL' where event_id=d.event_id and id=d.invitation_id;end if;
 return true;
end $$;
revoke all on function prepare_invitation_delivery(uuid,uuid,uuid),claim_invitation_delivery(uuid,text),finish_invitation_delivery(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function prepare_invitation_delivery(uuid,uuid,uuid),claim_invitation_delivery(uuid,text),finish_invitation_delivery(uuid,text,text,text,text,uuid) to service_role;

-- Freeze the bulk membership and reserve every item atomically before the first POST.
create table invitation_delivery_batches(event_id uuid references events(id) on delete cascade,request_id uuid,guest_ids uuid[] not null,primary key(event_id,request_id));
alter table invitation_delivery_batches enable row level security;
create function prepare_invitation_batch(p_event uuid,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare ids uuid[]; guest uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('invitation-send:'||p_event||':'||p_request,0));
 select guest_ids into ids from invitation_delivery_batches where event_id=p_event and request_id=p_request;
 if not found then
   select array_agg(g.id order by g.id) into ids from guests g join invitations i on i.event_id=g.event_id and i.id=g.invitation_id join guest_contacts c on c.event_id=g.event_id and c.guest_id=g.id
   where g.event_id=p_event and i.active and i.archived_at is null and trim(c.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
   ids=coalesce(ids,'{}'::uuid[]);
   insert into invitation_delivery_batches values(p_event,p_request,ids);
   foreach guest in array ids loop perform prepare_invitation_delivery(p_event,p_request,guest);end loop;
 end if;
 return to_jsonb(ids);
end $$;
revoke all on function prepare_invitation_batch(uuid,uuid) from public,anon,authenticated;
grant execute on function prepare_invitation_batch(uuid,uuid) to service_role;

-- An explicit override reserves its replacement and acknowledges the old request atomically.
create function prepare_invitation_resend(p_event uuid,p_previous uuid,p_request uuid,p_guest uuid default null) returns void
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 if p_previous=p_request then raise exception 'invalid resend';end if;
 perform pg_advisory_xact_lock(hashtextextended('invitation-send:'||p_event||':'||p_previous,0));
 if exists(select 1 from invitation_deliveries where event_id=p_event and request_id=p_previous and superseded_by is not null and superseded_by<>p_request) then raise exception 'operation already superseded';end if;
 -- The replacement was reserved in the same transaction; retry must not revalidate mutable aliases.
 if exists(select 1 from invitation_deliveries where event_id=p_event and request_id=p_previous and superseded_by=p_request) then return;end if;
 if exists(select 1 from invitation_delivery_batches where event_id=p_event and request_id=p_previous) then
   if p_guest is not null then raise exception 'bulk resend requires whole operation';end if;
   perform prepare_invitation_batch(p_event,p_request);
 else
   if p_guest is null or not (
     exists(select 1 from invitation_delivery_members m join invitation_deliveries d on d.id=m.delivery_id and d.event_id=m.event_id join guests g on g.event_id=m.event_id and g.id=m.guest_id and g.invitation_id=d.invitation_id where m.event_id=p_event and m.request_id=p_previous and m.guest_id=p_guest)
     or exists(select 1 from invitation_deliveries d join guests g on g.event_id=d.event_id and g.invitation_id=d.invitation_id join guest_contacts c on c.event_id=g.event_id and c.guest_id=g.id where d.event_id=p_event and d.request_id=p_previous and g.id=p_guest and lower(trim(c.email))=d.recipient_email)
   ) then raise exception 'invalid previous operation';end if;
   perform prepare_invitation_delivery(p_event,p_request,p_guest);
 end if;
 update invitation_deliveries set superseded_by=p_request where event_id=p_event and request_id=p_previous and status='pending';
end $$;
revoke all on function prepare_invitation_resend(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function prepare_invitation_resend(uuid,uuid,uuid,uuid) to service_role;

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
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'guest_id',guest_id,'invitation_id',invitation_id,'recipient_email',recipient_email,'status',status,'sent_at',sent_at,'created_at',created_at,'request_id',request_id,'bulk',exists(select 1 from invitation_delivery_batches b where b.event_id=invitation_deliveries.event_id and b.request_id=invitation_deliveries.request_id),'attempts',attempts,'last_attempt_at',last_attempt_at,'superseded_by',superseded_by,'guest_ids',(select coalesce(jsonb_agg(m.guest_id),'[]') from invitation_delivery_members m where m.event_id=invitation_deliveries.event_id and m.delivery_id=invitation_deliveries.id)) order by created_at desc),'[]')
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

-- Persist committed messaging results; historical receipts deliberately remain NULL.
alter table mutation_receipts add column result jsonb;
create or replace function app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare recipients uuid[]; channels delivery_channel[]; content text; mid uuid; tid uuid; receipt_result jsonb; response jsonb; broadcast boolean;
begin
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
revoke all on function app_mutate(uuid,uuid,text,jsonb) from public,anon;
grant execute on function app_mutate(uuid,uuid,text,jsonb) to authenticated;
