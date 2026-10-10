-- DESTRUCTIVE: only the application objects explicitly listed below.
-- Run ONLY through run-rebuild.sh, in the same transaction as migrations/bootstrap.
-- RESTRICT is deliberate: external dependencies abort the entire reconstruction.
do $cleanup$
declare
 tables text[] := array['announcements', 'audit_logs', 'checkins', 'delivery_attempts', 'device_push_tokens', 'event_settings', 'events', 'family_qr_credentials', 'gift_selections', 'gifts', 'guest_admin_details', 'guest_checkin_notices', 'guest_contacts', 'guests', 'invitation_access', 'invitation_deliveries', 'invitation_delivery_batches', 'invitation_delivery_members', 'invitation_rate_limits', 'invitation_sessions', 'invitations', 'message_recipients', 'message_threads', 'messages', 'mutation_receipts', 'notification_jobs', 'notification_rules', 'profiles', 'qr_credentials', 'rsvps', 'sheet_sync_jobs', 'user_roles'];
 functions text[] := array['admin_action', 'admin_action_v3', 'admin_action_v6', 'app_mutate', 'app_mutate_v4', 'app_mutate_v6', 'app_snapshot', 'app_snapshot_v4', 'app_snapshot_v5', 'app_snapshot_v6', 'app_snapshot_v7', 'audit_row', 'can_read_message', 'check_access_unit', 'claim_event_notifications', 'claim_invitation_delivery', 'claim_notifications', 'claim_sheet_jobs', 'create_individual_access', 'current_guest', 'enqueue_sheet', 'event_role', 'finish_invitation_delivery', 'finish_sheet_job', 'identify_guest', 'identify_invitation', 'invitation_attempt_allowed', 'invitation_delivery_targets', 'issue_family_ticket', 'issue_ticket', 'manages_guest_ticket', 'my_invitation', 'owns_guest', 'prepare_invitation_batch', 'prepare_invitation_delivery', 'prepare_invitation_resend', 'redeem_invitation', 'resolve_checkin_ticket', 'schedule_notifications', 'touch_row', 'validate_family_head'];
 signatures text[] := array['event_role(uuid)', 'my_invitation(uuid)', 'owns_guest(uuid, uuid)', 'touch_row()', 'audit_row()', 'enqueue_sheet()', 'redeem_invitation(uuid, uuid, text, text, text)', 'redeem_invitation(uuid, uuid, text, text)', 'app_snapshot(uuid)', 'issue_ticket(uuid, uuid, boolean)', 'app_mutate(uuid, uuid, text, jsonb)', 'admin_action(uuid, text, jsonb)', 'schedule_notifications()', 'claim_notifications(integer)', 'claim_sheet_jobs(integer)', 'finish_sheet_job(uuid, bigint, text)', 'invitation_attempt_allowed(uuid, uuid, text, text, boolean)', 'identify_invitation(uuid, uuid, text, text)', 'can_read_message(uuid, uuid)', 'prepare_invitation_delivery(uuid, uuid, uuid)', 'claim_invitation_delivery(uuid, text, text)', 'finish_invitation_delivery(uuid, text, text, text, text, uuid)', 'prepare_invitation_batch(uuid, uuid)', 'prepare_invitation_resend(uuid, uuid, uuid, uuid)', 'claim_event_notifications(uuid, integer, uuid)', 'invitation_delivery_targets(uuid)', 'check_access_unit()', 'create_individual_access(uuid, text, text)', 'identify_guest(uuid, uuid)', 'manages_guest_ticket(uuid, uuid)', 'issue_family_ticket(uuid, uuid, boolean)', 'current_guest(uuid)', 'validate_family_head()', 'resolve_checkin_ticket(uuid, text)', 'app_snapshot_v4(uuid)', 'app_mutate_v4(uuid, uuid, text, jsonb)', 'app_snapshot_v5(uuid)', 'admin_action_v3(uuid, text, jsonb)', 'app_snapshot_v7(uuid)', 'admin_action_v6(uuid, text, jsonb)', 'app_mutate_v6(uuid, uuid, text, jsonb)', 'app_snapshot_v6(uuid)'];
 r record; statement text;
begin
 if current_setting('wedding.rebuild_confirmation',true) is distinct from 'DISCARD_TEST_DATA_REBUILD_PR21' then
  raise exception 'Missing explicit reconstruction confirmation';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   join pg_depend d on d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e'
   where n.nspname='public' and c.relname=any(tables)) then raise exception 'Listed table belongs to an extension';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname=any(functions)
   and (p.prokind<>'f' or not (p.proname||'('||oidvectortypes(p.proargtypes)||')'=any(signatures)))) then
  raise exception 'Unexpected overload: inspect catalog before rebuilding';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   join pg_depend d on d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
   where n.nspname='public' and p.proname=any(functions)) then raise exception 'Listed function belongs to an extension';end if;
 -- The baseline invitation_members view is part of the application.
 drop view if exists public.invitation_members restrict;
 -- Remove dependencies inside the allowlisted application tables first.
 for r in select n.nspname,c.relname,t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=any(tables) and not t.tgisinternal loop
  execute format('drop trigger %I on %I.%I restrict',r.tgname,r.nspname,r.relname);
 end loop;
 for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename=any(tables) loop
  execute format('drop policy %I on %I.%I restrict',r.policyname,r.schemaname,r.tablename);
 end loop;
 select 'drop function '||string_agg(format('%I.%I(%s)',n.nspname,p.proname,oidvectortypes(p.proargtypes)),', ' order by p.proname)||' restrict'
 into statement from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(functions);
 if statement is not null then execute statement;end if;
 select 'drop table '||string_agg(format('%I.%I',n.nspname,c.relname),', ' order by c.relname)||' restrict'
 into statement from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any(tables) and c.relkind in ('r','p');
 if statement is not null then execute statement;end if;
 select 'drop type '||string_agg(format('%I.%I',n.nspname,t.typname),', ' order by t.typname)||' restrict'
 into statement from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname=any(array['app_role', 'delivery_channel', 'rsvp_status']);
 if statement is not null then execute statement;end if;
end $cleanup$;
