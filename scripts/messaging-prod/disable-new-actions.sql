-- Emergency ONLY after authorization; data/tombstones/consents/admission remain intact.
begin;
DO $verify$
DECLARE r record;
BEGIN
 for r in select * from (values ('messages','deleted_at','timestamptz'),('messages','deleted_by','uuid'),('messages','audience','text'),('messages','legacy_admin_read_at','timestamptz'),('messages','notification_title','text'),('announcements','message_id','uuid'),('announcements','deleted_at','timestamptz'),('events','notification_scheduling_enabled','bool')) expected(tbl,col,typ) loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.col and udt_name=r.typ) then raise exception 'STOP: v2 column %.%',r.tbl,r.col;end if;
 end loop;
 for r in select * from (values ('messages_visible_event'),('messages_unit_history'),('message_reads'),('message_reads_reader'),('notification_schedules'),('notification_schedules_event'),('notification_schedules_due')) expected(obj) loop
  if to_regclass('public.'||r.obj) is null then raise exception 'STOP: v2 relation %',r.obj;end if;
 end loop;
 for r in select * from (values ('public.message_reader(uuid)'),('public.messaging_visibility_core(uuid,uuid)'),('public.messaging_mutation_core(uuid,uuid,text,jsonb)'),('public.messaging_admin_core(uuid,text,jsonb)'),('public.messaging_snapshot_core(uuid)'),('public.messaging_schedule_core()'),('public.messaging_admission_core(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)')) expected(sig) loop
  if to_regprocedure(r.sig) is null then raise exception 'STOP: v2 function %',r.sig;end if;
  if has_function_privilege('anon',r.sig,'EXECUTE') or (r.sig<>'public.message_reader(uuid)' and (has_function_privilege('authenticated',r.sig,'EXECUTE') or has_function_privilege('service_role',r.sig,'EXECUTE'))) then raise exception 'STOP: exposed internal %',r.sig;end if;
 end loop;
 if not exists(select 1 from pg_constraint where conrelid='public.message_reads'::regclass and convalidated and pg_get_constraintdef(oid)='PRIMARY KEY (message_id, reader_key)') or not exists(select 1 from pg_constraint where conrelid='public.message_reads'::regclass and convalidated and pg_get_constraintdef(oid)='FOREIGN KEY (event_id, message_id) REFERENCES messages(event_id, id) ON DELETE CASCADE') then raise exception 'STOP: read receipt keys';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='message_reads' and policyname='own_message_reads' and cmd='SELECT' and qual like '%message_reader%' and qual like '%can_read_message%') or not exists(select 1 from pg_policies where schemaname='public' and tablename='notification_schedules' and policyname='admin_schedules' and cmd='SELECT') then raise exception 'STOP: new RLS policies';end if;
 if exists(select 1 from pg_class where oid in ('public.message_reads'::regclass,'public.notification_schedules'::regclass) and not relrowsecurity) then raise exception 'STOP: RLS disabled';end if;
 if has_table_privilege('anon','public.message_reads','SELECT') or has_table_privilege('authenticated','public.message_reads','INSERT,UPDATE,DELETE') or has_table_privilege('anon','public.notification_schedules','SELECT') or has_table_privilege('authenticated','public.notification_schedules','INSERT,UPDATE,DELETE') then raise exception 'STOP: direct writes or anonymous reads';end if;
 for r in select unnest(array['public.app_snapshot(uuid)','public.app_mutate(uuid,uuid,text,jsonb)','public.admin_action(uuid,text,jsonb)','public.can_read_message(uuid,uuid)']) sig loop
  if has_function_privilege('anon',r.sig,'EXECUTE') or not has_function_privilege('authenticated',r.sig,'EXECUTE') then raise exception 'STOP: RPC ACL %',r.sig;end if;
 end loop;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.message_reader(uuid)') and md5(replace(prosrc,E'\r',''))='6c23161fce468af95e595c7856394dc5' and proowner='postgres'::regrole) then raise exception 'STOP: v2 function body/owner differs: message_reader';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.can_read_message(uuid,uuid)') and md5(replace(prosrc,E'\r',''))='bf59c43d1d7951f495eaee39d4d9c79a' and proowner='postgres'::regrole) then raise exception 'STOP: v2 function body/owner differs: can_read_message';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.app_mutate(uuid,uuid,text,jsonb)') and md5(replace(prosrc,E'\r',''))='1230a99db328805389bb9dafbaa7ea93' and proowner='postgres'::regrole) then raise exception 'STOP: v2 function body/owner differs: app_mutate';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.admin_action(uuid,text,jsonb)') and md5(replace(prosrc,E'\r',''))='511d8041e5ab4a81a8d433dc6d1f9bc6' and proowner='postgres'::regrole) then raise exception 'STOP: v2 function body/owner differs: admin_action';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.schedule_notifications()') and md5(replace(prosrc,E'\r',''))='e8d0bf142c67a9a3a793b7b794532ebd' and proowner='postgres'::regrole) then raise exception 'STOP: v2 function body/owner differs: schedule_notifications';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.app_snapshot(uuid)') and md5(replace(prosrc,E'\r',''))='06e0544049ddb6078e279a8fd1a1a5be' and proowner='postgres'::regrole) then raise exception 'STOP: v2 function body/owner differs: app_snapshot';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)') and md5(replace(prosrc,E'\r',''))='3bb5e7f704b38dadd9e45b006b30d052' and proowner='postgres'::regrole) then raise exception 'STOP: v2 function body/owner differs: authorize_notification_attempt';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='announcements' and policyname='announcement_read' and qual like '%deleted_at IS NULL%') then raise exception 'STOP: announcement tombstone policy';end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.notification_schedules'::regclass and tgname='schedule_touch' and not tgisinternal) then raise exception 'STOP: schedule touch trigger';end if;
 if exists(select 1 from public.announcements a join public.messages m on m.id=a.message_id where a.event_id<>m.event_id) then raise exception 'STOP: cross-event projection';end if;

 -- Exact structural equivalence of the reviewed extension catalog.
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='announcements' and column_name='message_id' and udt_name='uuid' and is_nullable='YES' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift announcements.message_id';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='announcements' and column_name='deleted_at' and udt_name='timestamptz' and is_nullable='YES' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift announcements.deleted_at';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='events' and column_name='notification_scheduling_enabled' and udt_name='bool' and is_nullable='NO' and column_default is not distinct from 'false') then raise exception 'STOP: extension column/default drift events.notification_scheduling_enabled';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='message_reads' and column_name='event_id' and udt_name='uuid' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift message_reads.event_id';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='message_reads' and column_name='message_id' and udt_name='uuid' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift message_reads.message_id';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='message_reads' and column_name='reader_key' and udt_name='text' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift message_reads.reader_key';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='message_reads' and column_name='read_at' and udt_name='timestamptz' and is_nullable='NO' and column_default is not distinct from 'now()') then raise exception 'STOP: extension column/default drift message_reads.read_at';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='deleted_at' and udt_name='timestamptz' and is_nullable='YES' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift messages.deleted_at';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='deleted_by' and udt_name='uuid' and is_nullable='YES' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift messages.deleted_by';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='notification_title' and udt_name='text' and is_nullable='YES' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift messages.notification_title';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='legacy_admin_read_at' and udt_name='timestamptz' and is_nullable='YES' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift messages.legacy_admin_read_at';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='audience' and udt_name='text' and is_nullable='NO' and column_default is not distinct from '''LEGACY''::text') then raise exception 'STOP: extension column/default drift messages.audience';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='id' and udt_name='uuid' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.id';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='event_id' and udt_name='uuid' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.event_id';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='title' and udt_name='text' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.title';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='body' and udt_name='text' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.body';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='scheduled_at' and udt_name='timestamptz' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.scheduled_at';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='audience' and udt_name='text' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.audience';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='invitation_id' and udt_name='uuid' and is_nullable='YES' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.invitation_id';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='recipient_guest_ids' and udt_name='_uuid' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.recipient_guest_ids';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='channels' and udt_name='_delivery_channel' and is_nullable='NO' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.channels';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='active' and udt_name='bool' and is_nullable='NO' and column_default is not distinct from 'true') then raise exception 'STOP: extension column/default drift notification_schedules.active';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='status' and udt_name='text' and is_nullable='NO' and column_default is not distinct from '''scheduled''::text') then raise exception 'STOP: extension column/default drift notification_schedules.status';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='version' and udt_name='int4' and is_nullable='NO' and column_default is not distinct from '1') then raise exception 'STOP: extension column/default drift notification_schedules.version';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='created_by' and udt_name='uuid' and is_nullable='YES' and column_default is not distinct from null) then raise exception 'STOP: extension column/default drift notification_schedules.created_by';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='created_at' and udt_name='timestamptz' and is_nullable='NO' and column_default is not distinct from 'now()') then raise exception 'STOP: extension column/default drift notification_schedules.created_at';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='notification_schedules' and column_name='updated_at' and udt_name='timestamptz' and is_nullable='NO' and column_default is not distinct from 'now()') then raise exception 'STOP: extension column/default drift notification_schedules.updated_at';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.announcements'::regclass and conname='announcements_message_id_fkey' and convalidated and pg_get_constraintdef(oid)='FOREIGN KEY (message_id) REFERENCES messages(id)') then raise exception 'STOP: extension constraint drift announcements_message_id_fkey';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.message_reads'::regclass and conname='message_reads_event_id_message_id_fkey' and convalidated and pg_get_constraintdef(oid)='FOREIGN KEY (event_id, message_id) REFERENCES messages(event_id, id) ON DELETE CASCADE') then raise exception 'STOP: extension constraint drift message_reads_event_id_message_id_fkey';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.message_reads'::regclass and conname='message_reads_pkey' and convalidated and pg_get_constraintdef(oid)='PRIMARY KEY (message_id, reader_key)') then raise exception 'STOP: extension constraint drift message_reads_pkey';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='messages_audience_check' and convalidated and pg_get_constraintdef(oid)='CHECK ((audience = ANY (ARRAY[''GENERAL''::text, ''FAMILY''::text, ''INDIVIDUAL''::text, ''PRIVATE''::text, ''LEGACY''::text])))') then raise exception 'STOP: extension constraint drift messages_audience_check';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='messages_deleted_by_fkey' and convalidated and pg_get_constraintdef(oid)='FOREIGN KEY (deleted_by) REFERENCES auth.users(id) ON DELETE SET NULL') then raise exception 'STOP: extension constraint drift messages_deleted_by_fkey';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.messages'::regclass and conname='messages_notification_title_check' and convalidated and pg_get_constraintdef(oid)='CHECK ((length(notification_title) <= 160))') then raise exception 'STOP: extension constraint drift messages_notification_title_check';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_audience_check' and convalidated and pg_get_constraintdef(oid)='CHECK ((audience = ANY (ARRAY[''GENERAL''::text, ''FAMILY''::text, ''INDIVIDUAL''::text])))') then raise exception 'STOP: extension constraint drift notification_schedules_audience_check';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_body_check' and convalidated and pg_get_constraintdef(oid)='CHECK (((length(body) >= 1) AND (length(body) <= 3800)))') then raise exception 'STOP: extension constraint drift notification_schedules_body_check';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_channels_check' and convalidated and pg_get_constraintdef(oid)='CHECK ((cardinality(channels) > 0))') then raise exception 'STOP: extension constraint drift notification_schedules_channels_check';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_created_by_fkey' and convalidated and pg_get_constraintdef(oid)='FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL') then raise exception 'STOP: extension constraint drift notification_schedules_created_by_fkey';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_event_id_fkey' and convalidated and pg_get_constraintdef(oid)='FOREIGN KEY (event_id) REFERENCES events(id)') then raise exception 'STOP: extension constraint drift notification_schedules_event_id_fkey';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_event_id_invitation_id_fkey' and convalidated and pg_get_constraintdef(oid)='FOREIGN KEY (event_id, invitation_id) REFERENCES invitations(event_id, id)') then raise exception 'STOP: extension constraint drift notification_schedules_event_id_invitation_id_fkey';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_pkey' and convalidated and pg_get_constraintdef(oid)='PRIMARY KEY (id)') then raise exception 'STOP: extension constraint drift notification_schedules_pkey';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_recipient_guest_ids_check' and convalidated and pg_get_constraintdef(oid)='CHECK (((cardinality(recipient_guest_ids) >= 1) AND (cardinality(recipient_guest_ids) <= 500)))') then raise exception 'STOP: extension constraint drift notification_schedules_recipient_guest_ids_check';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_status_check' and convalidated and pg_get_constraintdef(oid)='CHECK ((status = ANY (ARRAY[''scheduled''::text, ''dispatched''::text, ''cancelled''::text])))') then raise exception 'STOP: extension constraint drift notification_schedules_status_check';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.notification_schedules'::regclass and conname='notification_schedules_title_check' and convalidated and pg_get_constraintdef(oid)='CHECK (((length(title) >= 1) AND (length(title) <= 160)))') then raise exception 'STOP: extension constraint drift notification_schedules_title_check';end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='message_reads_reader' and indexdef='CREATE INDEX message_reads_reader ON public.message_reads USING btree (event_id, reader_key, message_id)') then raise exception 'STOP: extension index drift message_reads_reader';end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='messages_unit_history' and indexdef='CREATE INDEX messages_unit_history ON public.messages USING btree (event_id, invitation_id, created_at, id) WHERE (deleted_at IS NULL)') then raise exception 'STOP: extension index drift messages_unit_history';end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='messages_visible_event' and indexdef='CREATE INDEX messages_visible_event ON public.messages USING btree (event_id, created_at, id) WHERE (deleted_at IS NULL)') then raise exception 'STOP: extension index drift messages_visible_event';end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='notification_schedules_due' and indexdef='CREATE INDEX notification_schedules_due ON public.notification_schedules USING btree (scheduled_at, id) WHERE ((status = ''scheduled''::text) AND active)') then raise exception 'STOP: extension index drift notification_schedules_due';end if;
 if not exists(select 1 from pg_indexes where schemaname='public' and indexname='notification_schedules_event' and indexdef='CREATE INDEX notification_schedules_event ON public.notification_schedules USING btree (event_id, scheduled_at, id)') then raise exception 'STOP: extension index drift notification_schedules_event';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='announcements' and policyname='announcement_read' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='((deleted_at IS NULL) AND can_receive_announcements(event_id))' and with_check is not distinct from null) then raise exception 'STOP: extension policy drift announcements.announcement_read';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='message_reads' and policyname='own_message_reads' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='((reader_key = message_reader(event_id)) AND can_read_message(event_id, message_id))' and with_check is not distinct from null) then raise exception 'STOP: extension policy drift message_reads.own_message_reads';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='guest_messages' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='can_read_message(event_id, id)' and with_check is not distinct from null) then raise exception 'STOP: extension policy drift messages.guest_messages';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='notification_schedules' and policyname='admin_schedules' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='(event_role(event_id) = ''ADMIN''::app_role)' and with_check is not distinct from null) then raise exception 'STOP: extension policy drift notification_schedules.admin_schedules';end if;
 if (select count(*) from pg_policies where schemaname='public' and tablename in ('message_reads','notification_schedules'))<>2 then raise exception 'STOP: unexpected policy on new tables';end if;
 if exists(select 1 from pg_constraint where conrelid in ('public.message_reads'::regclass,'public.notification_schedules'::regclass) and not convalidated) then raise exception 'STOP: unvalidated extension constraint';end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('app_mutate','app_snapshot','admin_action','can_read_message','message_reader','schedule_notifications','authorize_notification_attempt') group by proname having count(*)<>1) then raise exception 'STOP: public overload drift';end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('app_mutate','app_snapshot','admin_action','can_read_message','message_reader','schedule_notifications','authorize_notification_attempt') and proconfig is distinct from array['search_path=public, extensions, pg_temp']) then raise exception 'STOP: v2 search_path drift';end if;
END $verify$;

create or replace function public.app_mutate(p_event uuid,p_mutation uuid,p_type text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare role public.app_role:=public.event_role(p_event); result jsonb; mid uuid; tid uuid; inv uuid; anchor public.messages; ids uuid[]; category text; content text; prior jsonb;
begin
 if p_type='MESSAGE_REPLY' then raise exception 'messaging v2 temporarily disabled';end if;
 if p_type not in ('MESSAGE_SEND','MESSAGE_SEND_TO_GUESTS','MESSAGE_REPLY','MESSAGE_READ') then return public.messaging_mutation_core(p_event,p_mutation,p_type,p_payload);end if;
 if auth.uid() is null or role is null or role not in ('ADMIN','GUEST') then raise exception 'unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended('messaging:'||p_event||':'||auth.uid(),0));
 select r.result into prior from public.mutation_receipts r where r.event_id=p_event and r.user_id=auth.uid() and r.mutation_id=p_mutation;
 if found then return coalesce(prior,'{}')||jsonb_build_object('duplicate',true);end if;
 if p_type='MESSAGE_READ' then
  mid=(p_payload->>'id')::uuid;
  perform 1 from public.messages where event_id=p_event and id=mid for share;
  if not public.can_read_message(p_event,mid) then raise exception 'unauthorized';end if;
  if exists(select 1 from public.messages where id=mid and from_admin=(role='ADMIN')) then raise exception 'invalid read';end if;
  insert into public.message_reads(event_id,message_id,reader_key) values(p_event,mid,public.message_reader(p_event)) on conflict do nothing;
  result=jsonb_build_object('ok',true,'id',mid);
 elsif p_type='MESSAGE_REPLY' then
  if role<>'ADMIN' then raise exception 'unauthorized';end if;
  perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
  select * into anchor from public.messages where event_id=p_event and id=(p_payload->>'message_id')::uuid and not from_admin and deleted_at is null for share;
  if not found or anchor.invitation_id is null then raise exception 'invalid conversation';end if;
  select array_agg(g.id) into ids from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id
   where g.event_id=p_event and g.invitation_id=anchor.invitation_id and i.active and i.archived_at is null and (anchor.sender_guest_id is null or g.id=anchor.sender_guest_id);
  result=public.messaging_mutation_core(p_event,p_mutation,'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content',p_payload->>'content','recipient_guest_ids',to_jsonb(ids),'channels',coalesce(p_payload->'channels','["IN_APP"]'::jsonb)));
  mid=(result->>'id')::uuid;
  update public.messages set thread_id=anchor.thread_id,invitation_id=anchor.invitation_id,audience='PRIVATE' where id=mid;
  insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'MESSAGE_REPLY','messages',mid);
  return result;
 elsif p_type='MESSAGE_SEND' and role='GUEST' then
  inv=public.my_invitation(p_event); content=trim(p_payload->>'content');
  if inv is null or content is null or length(content) not between 1 and 4000 then raise exception 'invalid message';end if;
  if nullif(p_payload->>'sender_guest_id','') is not null and not public.owns_guest(p_event,(p_payload->>'sender_guest_id')::uuid) then raise exception 'invalid sender';end if;
  insert into public.message_threads(event_id,invitation_id) values(p_event,inv) on conflict(event_id,invitation_id) do update set updated_at=now() returning id into tid;
  insert into public.messages(event_id,thread_id,invitation_id,sender_guest_id,sender_user_id,content,audience)
   values(p_event,tid,inv,nullif(p_payload->>'sender_guest_id','')::uuid,auth.uid(),content,'PRIVATE') returning id into mid;
  result=jsonb_build_object('ok',true,'id',mid);
 else
  if role<>'ADMIN' then raise exception 'unauthorized';end if;
  -- Recipient validation/idempotency remain in the canonical implementation.
  if p_payload ? 'create_announcement' and jsonb_typeof(p_payload->'create_announcement')<>'boolean' then raise exception 'invalid announcement flag';end if;
  category=coalesce(p_payload->>'audience',case when coalesce((p_payload->>'create_announcement')::boolean,false) then 'GENERAL' else 'LEGACY' end);
  if category not in ('GENERAL','FAMILY','INDIVIDUAL','LEGACY') then raise exception 'invalid audience';end if;
  result=public.messaging_mutation_core(p_event,p_mutation,p_type,p_payload||jsonb_build_object('create_announcement',false));
  mid=(result->>'id')::uuid;
  if mid is not null then
   if coalesce((p_payload->>'create_announcement')::boolean,false) and not exists(select 1 from public.messages where id=mid and channels @> '{IN_APP}'::public.delivery_channel[]) then raise exception 'announcement requires IN_APP';end if;
   if category='GENERAL' and (select count(*) from public.message_recipients where message_id=mid)<>(select count(*) from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.event_id=p_event and i.active and i.archived_at is null) then raise exception 'announcement requires all active recipients';end if;
   if category='FAMILY' and (select count(distinct g.invitation_id) from public.message_recipients r join public.guests g on g.id=r.guest_id and g.event_id=r.event_id where r.message_id=mid)<>1 then raise exception 'invalid family recipients';end if;
   update public.messages set audience=category,invitation_id=case when category='FAMILY' then (select g.invitation_id from public.message_recipients r join public.guests g on g.id=r.guest_id where r.message_id=mid group by g.invitation_id) else invitation_id end where id=mid;
   if category='GENERAL' and exists(select 1 from public.messages where id=mid and channels @> '{IN_APP}'::public.delivery_channel[]) then
    insert into public.announcements(event_id,title,content,message_id) select p_event,'Mensagem dos noivos',m.content,mid from public.messages m where m.id=mid;
   end if;
  end if;
  return result;
 end if;
 insert into public.mutation_receipts(event_id,user_id,mutation_id,result) values(p_event,auth.uid(),p_mutation,result);
 return result;
end $$;
create or replace function public.admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare mid uuid; m public.messages; s public.notification_schedules; ids uuid[]; ch public.delivery_channel[]; sid uuid; due timestamptz; category text; inv uuid;
begin
 if p_action in ('MESSAGE_DELETE','NOTIFICATION_SAVE','NOTIFICATION_CANCEL') then raise exception 'messaging v2 temporarily disabled';end if;
 if p_action not in ('MESSAGE_READ','MESSAGE_DELETE','NOTIFICATION_SAVE','NOTIFICATION_CANCEL') then return public.messaging_admin_core(p_event,p_action,p_payload);end if;
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 perform pg_advisory_xact_lock(hashtextextended('admin:'||p_event,0));
 if p_action='NOTIFICATION_SAVE' and not coalesce((select notification_scheduling_enabled from public.events where id=p_event),false) then raise exception 'notification scheduling not enabled';end if;
 if p_action='MESSAGE_READ' then
  mid=(p_payload->>'id')::uuid;
  if not public.can_read_message(p_event,mid) or not exists(select 1 from public.messages where id=mid and not from_admin) then raise exception 'invalid message';end if;
  insert into public.message_reads values(p_event,mid,public.message_reader(p_event),now()) on conflict do nothing;
  update public.messages set read_at=coalesce(read_at,now()) where id=mid; -- legacy compatibility only; new counters use viewer_read_at.
 elsif p_action='MESSAGE_DELETE' then
  mid=(p_payload->>'id')::uuid;
  select * into m from public.messages where event_id=p_event and id=mid for update;
  if not found or not m.from_admin then raise exception 'invalid message';end if;
  if m.deleted_at is not null then return jsonb_build_object('ok',true);end if;
  if exists(select 1 from public.announcements a where a.event_id=p_event and a.message_id is null and a.content=m.content and a.created_at=m.created_at) then raise exception 'legacy announcement needs association';end if;
  update public.messages set deleted_at=now(),deleted_by=auth.uid() where id=mid;
  update public.announcements set deleted_at=now() where event_id=p_event and message_id=mid;
  update public.notification_jobs set status='skipped',locked_at=null,last_error='Mensagem excluída' where event_id=p_event and (message_id=mid or id=mid and rule_id is not null and channel='IN_APP') and delivery_started_at is null and status in ('pending','failed','processing');
  insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'MESSAGE_DELETE','messages',mid);
 else
  sid=(p_payload->>'id')::uuid;
  if sid is null then raise exception 'invalid schedule id';end if;
  -- Serialize client-supplied IDs globally, including simultaneous requests from different events.
  perform pg_advisory_xact_lock(hashtextextended('notification-schedule:'||sid,0));
  select * into s from public.notification_schedules where id=sid for update;
  if found and s.event_id=p_event and p_action='NOTIFICATION_CANCEL' and s.status='cancelled' then return jsonb_build_object('ok',true,'duplicate',true);end if;
  if found and (s.event_id<>p_event or (s.status<>'scheduled' and not(p_action='NOTIFICATION_CANCEL' and s.status='dispatched'))) then raise exception 'schedule immutable';end if;
  if p_action='NOTIFICATION_CANCEL' then
   if s.id is null then raise exception 'not found';end if;
   if s.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
   if s.status='dispatched' then
    perform 1 from public.messages where event_id=p_event and id=sid for update;
    if exists(select 1 from public.notification_jobs where event_id=p_event and message_id=sid and (delivery_started_at is not null or status in ('sent','uncertain'))) then raise exception 'delivery already admitted';end if;
    update public.messages set deleted_at=now(),deleted_by=auth.uid() where event_id=p_event and id=sid;
    update public.notification_jobs set status='skipped',locked_at=null,last_error='Notificação cancelada' where event_id=p_event and message_id=sid and status in ('pending','failed','processing');
   end if;
   update public.notification_schedules set status='cancelled',active=false,version=version+1 where id=sid;
  else
   if length(trim(coalesce(p_payload->>'title',''))) not between 1 and 160 or length(trim(coalesce(p_payload->>'body',''))) not between 1 and 3800 then raise exception 'invalid notification content';end if;
   if s.id is not null and nullif(p_payload->>'version','') is null then
    if s.title=trim(p_payload->>'title') and s.body=trim(p_payload->>'body') and s.scheduled_at=(p_payload->>'scheduled_at')::timestamptz and to_jsonb(s.recipient_guest_ids) @> (p_payload->'recipient_guest_ids') and (p_payload->'recipient_guest_ids') @> to_jsonb(s.recipient_guest_ids) and to_jsonb(s.channels) @> (p_payload->'channels') and (p_payload->'channels') @> to_jsonb(s.channels) and s.audience=p_payload->>'audience' and s.invitation_id is not distinct from nullif(p_payload->>'invitation_id','')::uuid and s.active=coalesce((p_payload->>'active')::boolean,true) then return jsonb_build_object('ok',true,'duplicate',true);end if;
    raise exception 'conflict';
   end if;
   if s.id is not null and s.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
   if s.id is null and (exists(select 1 from public.messages where id=sid) or exists(select 1 from public.notification_jobs where id=sid)) then raise exception 'invalid schedule id';end if;
   if coalesce(p_payload->>'scheduled_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'invalid future date';end if;
   due=(p_payload->>'scheduled_at')::timestamptz;
   if due is null or not isfinite(due) or due<=clock_timestamp() then raise exception 'invalid future date';end if;
   select array_agg(distinct value::uuid) into ids from jsonb_array_elements_text(p_payload->'recipient_guest_ids');
   select array_agg(distinct value::public.delivery_channel) into ch from jsonb_array_elements_text(p_payload->'channels');
   if ch @> '{PUSH}'::public.delivery_channel[] and octet_length(to_jsonb(trim(p_payload->>'title')||E'\n'||trim(p_payload->>'body'))::text)>3000 then raise exception 'push content too long';end if;
   if ch @> '{WHATSAPP}'::public.delivery_channel[] and octet_length(trim(p_payload->>'title')||E'\n'||trim(p_payload->>'body'))>1000 then raise exception 'whatsapp content too long';end if;
   if cardinality(ids) not between 1 and 500 or coalesce(cardinality(ch),0)=0 or array_position(ch,null) is not null then raise exception 'invalid recipients/channels';end if;
   if (select count(*) from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.event_id=p_event and g.id=any(ids) and i.active and i.archived_at is null)<>cardinality(ids) then raise exception 'invalid recipients';end if;
   category=p_payload->>'audience';
   if category is null or category not in ('GENERAL','FAMILY','INDIVIDUAL') then raise exception 'invalid audience';end if;
   inv=nullif(p_payload->>'invitation_id','')::uuid;
   if category='GENERAL' and cardinality(ids)<>(select count(*) from public.guests g join public.invitations i on i.id=g.invitation_id and i.event_id=g.event_id where g.event_id=p_event and i.active and i.archived_at is null) then raise exception 'announcement requires all active recipients';end if;
   if category='FAMILY' and (inv is null or exists(select 1 from public.guests where id=any(ids) and invitation_id<>inv)) then raise exception 'invalid family recipients';end if;
   insert into public.notification_schedules(id,event_id,title,body,scheduled_at,audience,invitation_id,recipient_guest_ids,channels,active,created_by)
   values(sid,p_event,trim(p_payload->>'title'),trim(p_payload->>'body'),due,category,case when category='FAMILY' then inv end,ids,ch,coalesce((p_payload->>'active')::boolean,true),auth.uid())
   on conflict(id) do update set title=excluded.title,body=excluded.body,scheduled_at=excluded.scheduled_at,audience=excluded.audience,invitation_id=excluded.invitation_id,recipient_guest_ids=excluded.recipient_guest_ids,channels=excluded.channels,active=excluded.active,version=notification_schedules.version+1;
  end if;
  insert into public.audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),p_action,'notification_schedules',sid);
 end if;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.app_snapshot(p_event uuid) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare result jsonb; role public.app_role:=public.event_role(p_event);
begin
 result=public.messaging_snapshot_core(p_event);
 return result||jsonb_build_object('capabilities',jsonb_build_object('messaging_v2',false,'notification_schedules',false),
 'messages',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('viewer_read_at',(select r.read_at from public.message_reads r where r.message_id=m.id and r.reader_key=public.message_reader(p_event)))||case when role='ADMIN' then jsonb_build_object('recipient_guest_ids',(select coalesce(jsonb_agg(r.guest_id),'[]') from public.message_recipients r where r.message_id=m.id)) else '{}'::jsonb end order by m.created_at,m.id),'[]') from public.messages m where m.event_id=p_event and public.can_read_message(p_event,m.id)),
 'announcements',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from public.announcements a where a.event_id=p_event and a.deleted_at is null and (role='ADMIN' or role='GUEST' and public.can_receive_announcements(p_event))),
 'notification_schedules',(select coalesce(jsonb_agg(to_jsonb(s) order by s.scheduled_at,s.id),'[]') from public.notification_schedules s where s.event_id=p_event and role='ADMIN'),
 'notification_jobs',(select coalesce(jsonb_agg(to_jsonb(j)-'idempotency_key'-'provider_id'),'[]') from public.notification_jobs j where j.event_id=p_event and role='ADMIN'));
end $$;
commit;
