begin;
set local lock_timeout='3s';set local statement_timeout='45s';
-- Reuse existing tombstones, publication metadata, receipts and delivery history.
alter function public.admin_action(uuid,text,jsonb) rename to notification_delete_admin_core;
revoke all on function public.notification_delete_admin_core(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare m public.messages; mid uuid;
begin
 if p_action is distinct from 'NOTIFICATION_DELETE' then return public.notification_delete_admin_core(p_event,p_action,p_payload);end if;
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 mid=(p_payload->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('notification:'||p_event,0));
 if not exists(select 1 from public.messages where id=mid and event_id=p_event and published_at is not null and notification_origin is not null and audience='GENERAL' and from_admin) then raise exception 'invalid general publication';end if;
 -- Match admission's guest -> message -> job order. Never wait for a guest while holding the message.
 perform g.id from public.guests g where g.event_id=p_event and exists(select 1 from public.notification_jobs j where j.event_id=p_event and j.message_id=mid and j.guest_id=g.id) order by g.id for update;
 select * into m from public.messages where id=mid and event_id=p_event and published_at is not null and notification_origin is not null and audience='GENERAL' and from_admin for update;
 if not found then raise exception 'invalid general publication';end if;
 if m.deleted_at is not null then return jsonb_build_object('ok',true,'id',mid,'deleted_at',m.deleted_at,'duplicate',true);end if;
 update public.messages set deleted_at=clock_timestamp(),deleted_by=auth.uid() where id=mid and event_id=p_event returning * into m;
 update public.announcements set deleted_at=m.deleted_at where event_id=p_event and message_id=mid and deleted_at is null;
 update public.notification_jobs set status='skipped',locked_at=null,last_error='Notificação excluída'
 where event_id=p_event and message_id=mid and delivery_started_at is null and status in ('pending','failed','processing');
 insert into public.audit_logs(event_id,actor,action,entity,entity_id,metadata) values(p_event,auth.uid(),'NOTIFICATION_DELETE','messages',mid,jsonb_build_object('published_at',m.published_at,'deleted_at',m.deleted_at,'origin',m.notification_origin));
 return jsonb_build_object('ok',true,'id',mid,'deleted_at',m.deleted_at);
end $$;
revoke all on function public.admin_action(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.admin_action(uuid,text,jsonb) to authenticated;

create or replace function public.can_read_message(p_event uuid,p_message uuid) returns boolean language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select case when exists(select 1 from public.messages where id=p_message and event_id=p_event and published_at is not null and notification_origin is not null) then
 public.event_role(p_event)='ADMIN' or public.event_role(p_event)='GUEST' and exists(select 1 from public.messages where id=p_message and event_id=p_event and deleted_at is null) and exists(select 1 from public.invitations where event_id=p_event and id=public.my_invitation(p_event) and active and archived_at is null)
 else public.notification_visibility_core(p_event,p_message) end
$$;
create or replace function public.notification_feed(p_event uuid,p_before timestamptz default null,p_id uuid default null) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 if public.event_role(p_event) not in ('ADMIN','GUEST') or public.event_role(p_event) is null then raise exception 'unauthorized';end if;
 return (select coalesce(jsonb_agg(x order by x.published_at desc,x.id desc),'[]') from (
 select m.id,m.notification_title as title,m.content,m.published_at,m.notification_origin as origin,m.channels,m.deleted_at,
 case when public.event_role(p_event)='ADMIN' then m.deleted_by end deleted_by,
 (select count(*) from public.message_recipients where message_id=m.id) recipient_count,
 (select read_at from public.message_reads where message_id=m.id and reader_key=public.message_reader(p_event)) viewer_read_at
 from public.messages m where m.event_id=p_event and m.published_at is not null and public.can_read_message(p_event,m.id)
 and (p_before is null or (m.published_at,m.id)<(p_before,p_id)) order by m.published_at desc,m.id desc limit 20) x);
end $$;
-- Claimed unadmitted work is blocked atomically by deletion. Admitted calls may finish;
-- their results and receipts must be preserved rather than pretending to unsend them.
create function notification_private.claim_visible(p_event uuid,p_message uuid,p_limit integer) returns setof public.notification_jobs language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 update public.notification_jobs set status='uncertain',last_error='Resultado externo não confirmado; não reenviar automaticamente',locked_at=null
 where (p_event is null or event_id=p_event) and (p_message is null or message_id=p_message) and status='processing' and delivery_started_at is not null and locked_at<clock_timestamp()-interval '10 minutes';
 update public.notification_jobs j set status='skipped',locked_at=null,last_error='Notificação excluída'
 where (p_event is null or j.event_id=p_event) and (p_message is null or j.message_id=p_message) and j.delivery_started_at is null and j.status in ('pending','failed','processing') and exists(select 1 from public.messages m where m.id=j.message_id and m.event_id=j.event_id and m.deleted_at is not null);
 return query
 with candidates as (select j.id from public.notification_jobs j where (p_event is null or j.event_id=p_event) and (p_message is null or j.message_id=p_message)
 and j.delivery_started_at is null and j.attempts<6 and ((j.status in ('pending','failed') and j.next_attempt_at<=now()) or(j.status='processing' and j.locked_at<clock_timestamp()-interval '10 minutes'))
 and not exists(select 1 from public.messages m where m.id=j.message_id and m.event_id=j.event_id and m.deleted_at is not null)
 order by j.created_at,j.id for update of j skip locked limit greatest(0,least(p_limit,50)))
 update public.notification_jobs j set status='processing',locked_at=clock_timestamp(),attempts=j.attempts+1 from candidates c where j.id=c.id and j.delivery_started_at is null and j.status in ('pending','failed','processing') returning j.*;
end $$;
revoke all on function notification_private.claim_visible(uuid,uuid,integer) from public,anon,authenticated,service_role;
create or replace function public.claim_notifications(p_limit integer default 50) returns setof public.notification_jobs language sql security definer set search_path=public,extensions,pg_temp as $$select * from notification_private.claim_visible(null,null,p_limit)$$;
create or replace function public.claim_event_notifications(p_event uuid,p_limit integer default 50,p_message uuid default null) returns setof public.notification_jobs language sql security definer set search_path=public,extensions,pg_temp as $$select * from notification_private.claim_visible(p_event,p_message,p_limit)$$;
-- Existing service-role-only claim/admission grants and RLS policies are unchanged.
alter function public.app_snapshot(uuid) rename to notification_delete_snapshot_core;
revoke all on function public.notification_delete_snapshot_core(uuid) from public,anon,authenticated,service_role;
create function public.app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb; role public.app_role:=public.event_role(p_event);
begin
 result=public.notification_delete_snapshot_core(p_event);
 if role in ('ADMIN','GUEST') then
  result=result||jsonb_build_object('notification_feed_revision',(select count(*) from public.messages where event_id=p_event and published_at is not null and deleted_at is not null),
  'capabilities',coalesce(result->'capabilities','{}')||jsonb_build_object('notification_deletion',true));
 end if;
 return result;
end $$;
revoke all on function public.app_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.app_snapshot(uuid) to authenticated,service_role;
commit;
