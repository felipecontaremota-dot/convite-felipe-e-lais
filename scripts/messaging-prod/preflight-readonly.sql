-- READ ONLY. STOP on any exception; success is a catalog gate, not proof of login/provider delivery.
begin transaction read only;
set local statement_timeout='30s';
DO $preflight$
DECLARE r record; n integer;
BEGIN
 if current_user <> 'postgres' then raise exception 'STOP: run with the reviewed SQL Editor postgres owner';end if;
 if has_schema_privilege('anon','public','CREATE') or has_schema_privilege('authenticated','public','CREATE') then raise exception 'STOP: untrusted public schema writer';end if;
 for r in select * from (values
('announcements','id','uuid'),
('announcements','event_id','uuid'),
('announcements','title','text'),
('announcements','content','text'),
('announcements','rule_id','uuid'),
('announcements','created_at','timestamptz'),
('announcements','updated_at','timestamptz'),
('audit_logs','id','uuid'),
('audit_logs','event_id','uuid'),
('audit_logs','actor','uuid'),
('audit_logs','action','text'),
('audit_logs','entity','text'),
('audit_logs','entity_id','uuid'),
('audit_logs','metadata','jsonb'),
('audit_logs','created_at','timestamptz'),
('audit_logs','updated_at','timestamptz'),
('events','id','uuid'),
('events','title','text'),
('events','starts_at','timestamptz'),
('events','timezone','text'),
('events','venue_name','text'),
('events','address','text'),
('events','latitude','float8'),
('events','longitude','float8'),
('events','created_at','timestamptz'),
('events','updated_at','timestamptz'),
('events','gps_url','text'),
('events','version','int4'),
('guests','id','uuid'),
('guests','event_id','uuid'),
('guests','invitation_id','uuid'),
('guests','name','text'),
('guests','group_label','text'),
('guests','version','int4'),
('guests','companion_of','uuid'),
('guests','created_at','timestamptz'),
('guests','updated_at','timestamptz'),
('guests','is_child','bool'),
('guests','is_adolescent','bool'),
('guests','greeting_form','text'),
('invitations','id','uuid'),
('invitations','event_id','uuid'),
('invitations','name','text'),
('invitations','active','bool'),
('invitations','code_hash','text'),
('invitations','primary_guest_id','uuid'),
('invitations','version','int4'),
('invitations','created_at','timestamptz'),
('invitations','updated_at','timestamptz'),
('invitations','sent_at','timestamptz'),
('invitations','sent_channel','delivery_channel'),
('invitations','first_activated_at','timestamptz'),
('invitations','kind','text'),
('invitations','archived_at','timestamptz'),
('message_recipients','id','uuid'),
('message_recipients','event_id','uuid'),
('message_recipients','message_id','uuid'),
('message_recipients','guest_id','uuid'),
('message_recipients','created_at','timestamptz'),
('message_recipients','updated_at','timestamptz'),
('message_threads','id','uuid'),
('message_threads','event_id','uuid'),
('message_threads','invitation_id','uuid'),
('message_threads','created_at','timestamptz'),
('message_threads','updated_at','timestamptz'),
('messages','id','uuid'),
('messages','event_id','uuid'),
('messages','thread_id','uuid'),
('messages','invitation_id','uuid'),
('messages','recipient_guest_id','uuid'),
('messages','sender_guest_id','uuid'),
('messages','sender_user_id','uuid'),
('messages','from_admin','bool'),
('messages','channels','_delivery_channel'),
('messages','content','text'),
('messages','read_at','timestamptz'),
('messages','created_at','timestamptz'),
('messages','updated_at','timestamptz'),
('mutation_receipts','event_id','uuid'),
('mutation_receipts','user_id','uuid'),
('mutation_receipts','mutation_id','uuid'),
('mutation_receipts','created_at','timestamptz'),
('mutation_receipts','result','jsonb'),
('notification_jobs','id','uuid'),
('notification_jobs','event_id','uuid'),
('notification_jobs','rule_id','uuid'),
('notification_jobs','message_id','uuid'),
('notification_jobs','guest_id','uuid'),
('notification_jobs','channel','delivery_channel'),
('notification_jobs','idempotency_key','text'),
('notification_jobs','status','text'),
('notification_jobs','attempts','int4'),
('notification_jobs','last_error','text'),
('notification_jobs','next_attempt_at','timestamptz'),
('notification_jobs','locked_at','timestamptz'),
('notification_jobs','created_at','timestamptz'),
('notification_jobs','updated_at','timestamptz'),
('notification_jobs','delivery_started_at','timestamptz')
 ) expected(tbl,col,typ) loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.tbl and column_name=r.col and udt_name=r.typ) then raise exception 'STOP: baseline column %.% / % missing or different',r.tbl,r.col,r.typ;end if;
 end loop;
 for r in select * from (values
('public.app_snapshot(uuid)','jsonb'),
('public.app_mutate(uuid,uuid,text,jsonb)','jsonb'),
('public.admin_action(uuid,text,jsonb)','jsonb'),
('public.can_read_message(uuid,uuid)','bool'),
('public.can_receive_announcements(uuid)','bool'),
('public.schedule_notifications()','void'),
('public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)','jsonb'),
('public.event_role(uuid)','app_role'),
('public.my_invitation(uuid)','uuid'),
('public.owns_guest(uuid,uuid)','bool'),
('public.touch_row()','trigger'),
('public.internal_mutation_core(uuid,uuid,text,jsonb)','jsonb'),
('public.internal_snapshot_core(uuid)','jsonb')
 ) expected(sig,typ) loop
  if to_regprocedure(r.sig) is null then raise exception 'STOP: missing %',r.sig;end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure(r.sig) and prorettype=to_regtype('public.'||r.typ) or oid=to_regprocedure(r.sig) and prorettype=to_regtype('pg_catalog.'||r.typ)) then raise exception 'STOP: return type %',r.sig;end if;
  if (select proowner <> 'postgres'::regrole from pg_proc where oid=to_regprocedure(r.sig)) then raise exception 'STOP: owner %',r.sig;end if;
 end loop;
 -- Reject partial installs or a second execution, including index/function-only remnants.
 if exists(select 1 from information_schema.columns where table_schema='public' and (table_name='messages' and column_name in ('deleted_at','deleted_by','audience','legacy_admin_read_at','notification_title') or table_name='announcements' and column_name in ('message_id','deleted_at') or table_name='events' and column_name='notification_scheduling_enabled'))
 or to_regclass('public.message_reads') is not null or to_regclass('public.notification_schedules') is not null
 or exists(select 1 from pg_proc where pronamespace='public'::regnamespace and (proname like 'messaging_%' or proname='message_reader'))
 or exists(select 1 from pg_class where relnamespace='public'::regnamespace and relname in ('messages_visible_event','messages_unit_history','message_reads_reader','notification_schedules_event','notification_schedules_due')) then raise exception 'STOP: v2 already installed, partial installation or name collision; do not retry DDL';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20261014171048') then raise exception 'STOP: migration history claims v2 without its structure';end if;
 for r in select * from (values ('messages','guest_messages'),('announcements','announcement_read')) expected(tbl,pol) loop
  if not exists(select 1 from pg_policies where schemaname='public' and tablename=r.tbl and policyname=r.pol and cmd='SELECT' and roles=array['authenticated']::name[]) then raise exception 'STOP: policy %.%',r.tbl,r.pol;end if;
 end loop;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='guest_messages' and qual='can_read_message(event_id, id)') or not exists(select 1 from pg_policies where schemaname='public' and tablename='announcements' and policyname='announcement_read' and qual='can_receive_announcements(event_id)') then raise exception 'STOP: unexpected policy contract';end if;
 for r in select unnest(array['messages','announcements','notification_jobs','message_recipients']) tbl loop
  if not exists(select 1 from pg_class where oid=to_regclass('public.'||r.tbl) and relrowsecurity) then raise exception 'STOP: RLS disabled on %',r.tbl;end if;
 end loop;
 for r in select * from (values ('messages','UNIQUE (event_id, id)'),('message_threads','UNIQUE (event_id, invitation_id)'),('message_recipients','UNIQUE (message_id, guest_id)'),('announcements','UNIQUE (event_id, id)'),('messages','FOREIGN KEY (event_id, thread_id) REFERENCES message_threads(event_id, id)'),('messages','FOREIGN KEY (event_id, invitation_id) REFERENCES invitations(event_id, id)'),('message_threads','FOREIGN KEY (event_id, invitation_id) REFERENCES invitations(event_id, id)'),('message_recipients','FOREIGN KEY (event_id, message_id) REFERENCES messages(event_id, id) ON DELETE CASCADE'),('message_recipients','FOREIGN KEY (event_id, guest_id) REFERENCES guests(event_id, id) ON DELETE CASCADE')) expected(tbl,def) loop
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||r.tbl) and convalidated and pg_get_constraintdef(oid)=r.def) then raise exception 'STOP: constraint % / %',r.tbl,r.def;end if;
 end loop;
 for r in select unnest(array['public.app_snapshot(uuid)','public.app_mutate(uuid,uuid,text,jsonb)','public.admin_action(uuid,text,jsonb)']) sig loop
  if has_function_privilege('anon',r.sig,'EXECUTE') or not has_function_privilege('authenticated',r.sig,'EXECUTE') then raise exception 'STOP: public RPC ACL %',r.sig;end if;
 end loop;
 if has_function_privilege('authenticated','public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)','EXECUTE') or not has_function_privilege('service_role','public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)','EXECUTE') then raise exception 'STOP: worker admission ACL';end if;
 -- Canonical recipient pipeline and consent gates are real dependencies, unlike a name/PIN marker.
 if position('MESSAGE_SEND_TO_GUESTS' in pg_get_functiondef(coalesce(to_regprocedure('public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)'), 'public.internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure)))=0
 or position('internal_mutation_core' in pg_get_functiondef('public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure))=0
 or position('CONTACT_UPDATE' in pg_get_functiondef('public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure))=0
 or position('PUSH_REGISTER' in pg_get_functiondef('public.app_mutate(uuid,uuid,text,jsonb)'::regprocedure))=0
 or position('admin_action_v3' in pg_get_functiondef('public.admin_action(uuid,text,jsonb)'::regprocedure))=0
 or position('internal_can_receive_communication' in pg_get_functiondef('public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)'::regprocedure))=0 then raise exception 'STOP: canonical recipient/consent/delegation contract not recognized';end if;
 if to_regprocedure('public.name_pin_snapshot_core(uuid)') is null then
  if position('internal_snapshot_core' in pg_get_functiondef('public.app_snapshot(uuid)'::regprocedure))=0 or position('can_receive_announcements' in pg_get_functiondef('public.app_snapshot(uuid)'::regprocedure))=0 then raise exception 'STOP: profile snapshot delegation not recognized';end if;
 else
  if position('name_pin_snapshot_core' in pg_get_functiondef('public.app_snapshot(uuid)'::regprocedure))=0 then raise exception 'STOP: name/PIN snapshot delegation not recognized';end if;
 end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.app_mutate(uuid,uuid,text,jsonb)') and md5(replace(prosrc,E'\r','')) in ('399af79479c421d3ac6e0f3bc13e7ca2','b4ec452d37b253f9e970a37eef0940e7','d15ab46f463beeab05507137245f18c5','ec84723875aa4df7db8a07554ca57617','ef2fd1b7f6dd0dd55090b4fa8336d227')) then raise exception 'STOP: unreviewed baseline function app_mutate';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.app_snapshot(uuid)') and md5(replace(prosrc,E'\r','')) in ('20c1ef3917626d85a5a0da71c8365172','44be727688964b4d51aa2f9d0f9b24c1','5a67f44d2b45d845b72fe60134720b62','75557fb3ed6669f6496d553170b3517e','868fdfb8467e49d8bf794656430d6a77','e0c34960b13f37f8ac52b022789d6e3f')) then raise exception 'STOP: unreviewed baseline function app_snapshot';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.admin_action(uuid,text,jsonb)') and md5(replace(prosrc,E'\r','')) in ('58771337888dd54ae5709f301a3ad48a','b42df41d5319279b69063fd2197c9664','d437b59e54107f17db01a5f54a6d1470','f6fa3b80e1c149064f5ab81794c8c841')) then raise exception 'STOP: unreviewed baseline function admin_action';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.can_read_message(uuid,uuid)') and md5(replace(prosrc,E'\r','')) in ('379f186bcaeed8e11fa7bd2138eab281','884fd8888977864bf0d007b41bfdd221')) then raise exception 'STOP: unreviewed baseline function can_read_message';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.can_receive_announcements(uuid)') and md5(replace(prosrc,E'\r','')) in ('c4b50a6e8f679389adbce820ac2fa94c')) then raise exception 'STOP: unreviewed baseline function can_receive_announcements';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.authorize_notification_attempt(uuid,uuid,uuid,public.delivery_channel,integer,timestamptz,boolean)') and md5(replace(prosrc,E'\r','')) in ('a5e37efb8c052d65780c45893fafe9a7')) then raise exception 'STOP: unreviewed baseline function authorize_notification_attempt';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.schedule_notifications()') and md5(replace(prosrc,E'\r','')) in ('9d4af1f83f368de944eba311b6d96762')) then raise exception 'STOP: unreviewed baseline function schedule_notifications';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.internal_mutation_core(uuid,uuid,text,jsonb)') and md5(replace(prosrc,E'\r','')) in ('ef2fd1b7f6dd0dd55090b4fa8336d227','e9bc0ea771d51c698fa40891551c4851')) then raise exception 'STOP: unreviewed baseline function internal_mutation_core';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.internal_snapshot_core(uuid)') and md5(replace(prosrc,E'\r','')) in ('20c1ef3917626d85a5a0da71c8365172','744b2edbae77c47ba1cfba72371914ad')) then raise exception 'STOP: unreviewed baseline function internal_snapshot_core';end if;

 -- Receipt/recipient uniqueness is required by the canonical idempotent pipeline.
 for r in select * from (values ('mutation_receipts','PRIMARY KEY (event_id, user_id, mutation_id)'),('notification_jobs','UNIQUE (idempotency_key)'),('notification_jobs','UNIQUE (event_id, id)'),('guests','UNIQUE (event_id, id)'),('invitations','UNIQUE (event_id, id)')) expected(tbl,def) loop
  if not exists(select 1 from pg_constraint where conrelid=to_regclass('public.'||r.tbl) and convalidated and pg_get_constraintdef(oid)=r.def) then raise exception 'STOP: canonical uniqueness % / %',r.tbl,r.def;end if;
 end loop;
 if to_regprocedure('auth.uid()') is null or to_regprocedure('public.internal_can_receive_communication(uuid,uuid,public.delivery_channel)') is null or to_regprocedure('public.finish_notification_attempt(uuid,uuid,integer,timestamptz,text,text,text,timestamptz)') is null then raise exception 'STOP: authentication/consent/finalization helper missing';end if;
 if (select count(*) from pg_enum where enumtypid='public.delivery_channel'::regtype and enumlabel in ('IN_APP','PUSH','EMAIL','WHATSAPP'))<>4 then raise exception 'STOP: delivery channel contract';end if;
 if exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('app_snapshot','app_mutate','admin_action','can_read_message','authorize_notification_attempt','schedule_notifications') group by proname having count(*)<>1) then raise exception 'STOP: public overload drift';end if;


 -- Unknown permissive policies must not bypass the reviewed visibility contract.
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='announcements' and policyname='admin_read' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='(event_role(event_id) = ''ADMIN''::app_role)' and with_check is null) then raise exception 'STOP: baseline policy drift announcements.admin_read';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='announcements' and policyname='announcement_read' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='can_receive_announcements(event_id)' and with_check is null) then raise exception 'STOP: baseline policy drift announcements.announcement_read';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='message_recipients' and policyname='admin_read' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='(event_role(event_id) = ''ADMIN''::app_role)' and with_check is null) then raise exception 'STOP: baseline policy drift message_recipients.admin_read';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='message_recipients' and policyname='guest_recipients' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='owns_guest(event_id, guest_id)' and with_check is null) then raise exception 'STOP: baseline policy drift message_recipients.guest_recipients';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='admin_read' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='(event_role(event_id) = ''ADMIN''::app_role)' and with_check is null) then raise exception 'STOP: baseline policy drift messages.admin_read';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='messages' and policyname='guest_messages' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='can_read_message(event_id, id)' and with_check is null) then raise exception 'STOP: baseline policy drift messages.guest_messages';end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='notification_jobs' and policyname='admin_read' and cmd='SELECT' and roles=array['authenticated']::name[] and permissive='PERMISSIVE' and qual='(event_role(event_id) = ''ADMIN''::app_role)' and with_check is null) then raise exception 'STOP: baseline policy drift notification_jobs.admin_read';end if;
 if (select count(*) from pg_policies where schemaname='public' and tablename in ('messages','announcements','notification_jobs','message_recipients'))<>7 then raise exception 'STOP: unknown baseline policy';end if;
 if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolbypassrls or rolsuper)) or exists(select 1 from pg_class where oid in ('public.messages'::regclass,'public.announcements'::regclass,'public.notification_jobs'::regclass,'public.message_recipients'::regclass) and relowner in ('anon'::regrole,'authenticated'::regrole)) then raise exception 'STOP: client role bypasses table RLS';end if;
 -- Existing Supabase default DML grants are harmless only with the exact SELECT-only policies above.


 -- Optional profile-confirmation layer preserves the same canonical pipelines.
 if to_regprocedure('public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)') is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)') and md5(replace(prosrc,E'\r','')) in ('ef2fd1b7f6dd0dd55090b4fa8336d227') and proowner='postgres'::regrole and prosecdef) then raise exception 'STOP: profile preserved mutation drift';end if;
 if to_regprocedure('public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)') is not null and (has_function_privilege('anon','public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)','EXECUTE') or has_function_privilege('service_role','public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)','EXECUTE')) then raise exception 'STOP: profile core exposed';end if;
 if to_regprocedure('public.profile_confirmation_snapshot_core(uuid)') is not null and not exists(select 1 from pg_proc where oid=to_regprocedure('public.profile_confirmation_snapshot_core(uuid)') and md5(replace(prosrc,E'\r','')) in ('20c1ef3917626d85a5a0da71c8365172') and proowner='postgres'::regrole and prosecdef) then raise exception 'STOP: profile preserved snapshot drift';end if;
 if to_regprocedure('public.profile_confirmation_snapshot_core(uuid)') is not null and (has_function_privilege('anon','public.profile_confirmation_snapshot_core(uuid)','EXECUTE') or has_function_privilege('authenticated','public.profile_confirmation_snapshot_core(uuid)','EXECUTE') or has_function_privilege('service_role','public.profile_confirmation_snapshot_core(uuid)','EXECUTE')) then raise exception 'STOP: profile core exposed';end if;
 if (to_regprocedure('public.profile_confirmation_mutation_core(uuid,uuid,text,jsonb)') is null) is distinct from (to_regprocedure('public.profile_confirmation_snapshot_core(uuid)') is null) then raise exception 'STOP: partial profile layer';end if;

END $preflight$;
select 'CATALOG_READY: review definition hashes, backup and project identity before installation' status;
select version,name from supabase_migrations.schema_migrations order by version;
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('messages','announcements','notification_jobs','message_recipients') and grantee in ('anon','authenticated') order by table_name,grantee,privilege_type;
select oid::regprocedure::text signature,md5(replace(prosrc,E'\r','')) definition_hash,proowner::regrole owner,proacl,proconfig
from pg_proc where pronamespace='public'::regnamespace and proname in ('app_snapshot','app_mutate','admin_action','internal_snapshot_core','internal_mutation_core','can_read_message','can_receive_announcements','authorize_notification_attempt','schedule_notifications','name_pin_snapshot_core');
select schemaname,tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname='public' and tablename in ('messages','announcements','message_recipients','notification_jobs');
select conrelid::regclass relation,conname,pg_get_constraintdef(oid) definition,convalidated from pg_constraint where conrelid in ('public.messages'::regclass,'public.message_recipients'::regclass,'public.message_threads'::regclass,'public.announcements'::regclass);
commit;
