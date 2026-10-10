\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_announcement(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','dddddddd-0000-4000-8000-000000000006','ADMIN');
insert into invitations(id,event_id,name,kind) values('bbbbbbbb-6000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Announcement family','FAMILY');
insert into guests(id,event_id,invitation_id,name) values
 ('bbbbbbbb-6000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','bbbbbbbb-6000-4000-8000-000000000001','Announcement A'),
 ('bbbbbbbb-6000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','bbbbbbbb-6000-4000-8000-000000000001','Announcement B');
set local role authenticated;
set local request.jwt.claim.sub='dddddddd-0000-4000-8000-000000000006';
do $$declare e uuid:='00000000-0000-4000-8000-000000000001'; ids uuid[];chosen_channels jsonb;flag boolean;r jsonb;retry jsonb;mutation uuid; payload jsonb;before_count integer;
begin
 select array_agg(g.id order by g.id) into ids from guests g join invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.event_id=e and i.active and i.archived_at is null;
 for chosen_channels in select value from (values('["IN_APP"]'::jsonb),('["EMAIL"]'::jsonb),('["IN_APP","EMAIL"]'::jsonb)) c(value) loop
   flag=chosen_channels ? 'IN_APP'; mutation=gen_random_uuid();
   payload=jsonb_build_object('content','All announcement regression '||chosen_channels::text,'recipient_guest_ids',to_jsonb(ids),'channels',chosen_channels,'create_announcement',flag);
   select count(*) into before_count from announcements where event_id=e;
   r=app_mutate(e,mutation,'MESSAGE_SEND_TO_GUESTS',payload);
   perform pg_temp.assert_announcement((select count(*)=cardinality(ids) from message_recipients where message_id=(r->>'id')::uuid),'Todos has all explicit recipients');
   perform pg_temp.assert_announcement((select count(*)=cardinality(ids)*jsonb_array_length(chosen_channels) from notification_jobs where message_id=(r->>'id')::uuid),'Todos has exact chosen_channels outbox');
   perform pg_temp.assert_announcement((select count(*)=before_count+case when flag then 1 else 0 end from announcements where event_id=e),'announcement only with IN_APP');
   if flag then
     perform pg_temp.assert_announcement(exists(select 1 from jsonb_array_elements(app_snapshot(e)->'announcements') a where a->>'content'=payload->>'content'),'Home snapshot contains general notice');
   end if;
   retry=app_mutate(e,mutation,'MESSAGE_SEND_TO_GUESTS','{"invalid":"changed payload"}');
   perform pg_temp.assert_announcement(retry=r||'{"duplicate":true}'::jsonb,'retry returns exact original ID before validations');
   perform pg_temp.assert_announcement((select count(*)=1 from messages where id=(r->>'id')::uuid),'retry has one message');
   perform pg_temp.assert_announcement((select count(*)=cardinality(ids) from message_recipients where message_id=(r->>'id')::uuid),'retry has no duplicate recipients');
   perform pg_temp.assert_announcement((select count(*)=cardinality(ids)*jsonb_array_length(chosen_channels) from notification_jobs where message_id=(r->>'id')::uuid),'retry has no duplicate jobs');
   perform pg_temp.assert_announcement((select count(*)=before_count+case when flag then 1 else 0 end from announcements where event_id=e),'retry has no duplicate announcement');
 end loop;
 -- Person and family are deliberately targeted, even if their subset happens to be all.
 for payload in select jsonb_build_object('content','Targeted announcement regression','recipient_guest_ids',to_jsonb(target.ids),'channels','["IN_APP"]'::jsonb,'create_announcement',false) from (
   select ids[1:1] as ids union all select array_agg(g.id) from guests g where g.invitation_id='bbbbbbbb-6000-4000-8000-000000000001'
 ) target loop
   select count(*) into before_count from announcements where event_id=e;
   perform app_mutate(e,gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',payload);
   perform pg_temp.assert_announcement((select count(*)=before_count from announcements where event_id=e),'person/family never creates public notice');
 end loop;
 begin
   perform app_mutate(e,gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Malicious notice','recipient_guest_ids',to_jsonb(ids[1:1]),'channels','["IN_APP"]'::jsonb,'create_announcement',true));
   raise exception 'ASSERTION: subset announcement accepted';
 exception when others then if SQLERRM <> 'announcement requires all active recipients' then raise;end if;end;
 begin
   perform app_mutate(e,gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Email-only notice','recipient_guest_ids',to_jsonb(ids),'channels','["EMAIL"]'::jsonb,'create_announcement',true));
   raise exception 'ASSERTION: email-only announcement accepted';
 exception when others then if SQLERRM <> 'announcement requires IN_APP' then raise;end if;end;
end$$;
rollback;
\echo Announcement regression passed: all channels, exact set validation, targeted messages, snapshot and idempotent retry.
