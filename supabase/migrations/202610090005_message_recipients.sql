-- Extend only messaging. Access-unit CRUD and migrations 001-004 remain unchanged.
-- The existing recipient table is the authority for administrative message visibility.
create function can_read_message(p_event uuid,p_message uuid) returns boolean
language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select exists(select 1 from messages m where m.event_id=p_event and m.id=p_message and (
   event_role(p_event)='ADMIN' or
   event_role(p_event)='GUEST' and m.channels @> '{IN_APP}'::delivery_channel[] and (
     m.from_admin and exists(select 1 from message_recipients r where r.event_id=p_event and r.message_id=m.id and owns_guest(p_event,r.guest_id)) or
     not m.from_admin and m.invitation_id=my_invitation(p_event)
   )
 ));
$$;
revoke all on function can_read_message(uuid,uuid) from public,anon;
grant execute on function can_read_message(uuid,uuid) to authenticated;
drop policy guest_messages on messages;
create policy guest_messages on messages for select to authenticated using(can_read_message(event_id,id));

alter function app_snapshot(uuid) rename to app_snapshot_v4;
revoke all on function app_snapshot_v4(uuid) from public,anon,authenticated,service_role;
create function app_snapshot(p_event uuid) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb; role app_role:=event_role(p_event);
begin
 result=app_snapshot_v4(p_event);
 return result||jsonb_build_object('messages',(
   select coalesce(jsonb_agg(to_jsonb(m)||case when role='ADMIN' then jsonb_build_object('recipient_guest_ids',(
     select coalesce(jsonb_agg(r.guest_id order by r.guest_id),'[]') from message_recipients r where r.event_id=p_event and r.message_id=m.id
   )) else '{}'::jsonb end order by m.created_at desc),'[]') from messages m where m.event_id=p_event and can_read_message(p_event,m.id)
 ));
end $$;
revoke all on function app_snapshot(uuid) from public,anon;
grant execute on function app_snapshot(uuid) to authenticated;

alter function app_mutate(uuid,uuid,text,jsonb) rename to app_mutate_v4;
revoke all on function app_mutate_v4(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare recipients uuid[]; channels delivery_channel[]; content text; mid uuid; tid uuid;
begin
 if p_type <> 'MESSAGE_SEND' or not (p_payload ? 'recipient_guest_ids') then
   return app_mutate_v4(p_event,p_mutation,p_type,p_payload);
 end if;
 if event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if jsonb_typeof(p_payload->'recipient_guest_ids') is distinct from 'array' then raise exception 'invalid recipient list';end if;
 if jsonb_array_length(p_payload->'recipient_guest_ids') not between 1 and 500 then raise exception 'invalid recipient count';end if;
 if nullif(p_payload->>'invitation_id','') is not null or nullif(p_payload->>'recipient_guest_id','') is not null then raise exception 'invalid recipient target';end if;
 select array_agg(distinct value::uuid) into recipients from jsonb_array_elements_text(p_payload->'recipient_guest_ids');
 if array_position(recipients,null) is not null then raise exception 'invalid recipient';end if;
 -- Match the existing event lock so recipient validation cannot race family/guest deletion.
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 if cardinality(recipients) <> (select count(*) from guests g join invitations i on i.id=g.invitation_id where g.event_id=p_event and i.event_id=p_event and g.id=any(recipients) and i.active and i.archived_at is null) then raise exception 'invalid recipient';end if;
 content=trim(p_payload->>'content');
 if content is null or length(content) not between 1 and 4000 then raise exception 'invalid message';end if;
 if jsonb_typeof(coalesce(p_payload->'channels','["IN_APP"]'::jsonb)) <> 'array' then raise exception 'invalid channels';end if;
 select array_agg(distinct value::delivery_channel) into channels from jsonb_array_elements_text(coalesce(p_payload->'channels','["IN_APP"]'::jsonb));
 if coalesce(cardinality(channels),0)=0 or array_position(channels,null) is not null then raise exception 'invalid channels';end if;
 insert into mutation_receipts(event_id,user_id,mutation_id) values(p_event,auth.uid(),p_mutation) on conflict do nothing;
 if not found then return jsonb_build_object('duplicate',true);end if;
 insert into message_threads(event_id,invitation_id) values(p_event,null) returning id into tid;
 insert into messages(event_id,thread_id,from_admin,sender_user_id,content,channels) values(p_event,tid,true,auth.uid(),content,channels) returning id into mid;
 insert into message_recipients(event_id,message_id,guest_id) select p_event,mid,unnest(recipients);
 insert into notification_jobs(event_id,message_id,guest_id,channel,idempotency_key)
   select p_event,mid,r,c,mid||':'||r||':'||c from unnest(recipients) r cross join unnest(channels) c;
 -- A targeted message is not a public announcement, even though invitation_id is null.
 return jsonb_build_object('ok',true,'id',mid);
end $$;
revoke all on function app_mutate(uuid,uuid,text,jsonb) from public,anon;
grant execute on function app_mutate(uuid,uuid,text,jsonb) to authenticated;
