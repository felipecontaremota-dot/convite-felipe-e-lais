-- Isolated fixture only. Capture authentication contracts and data before DDL.
create table messaging_test_fixture.preserved_functions as select oid::regprocedure::text signature,prosrc,proargnames,prorettype,prosecdef,proconfig from pg_proc where pronamespace='public'::regnamespace and proname in ('app_snapshot','app_mutate','admin_action','can_read_message','authorize_notification_attempt','schedule_notifications','internal_mutation_core','internal_snapshot_core','can_receive_announcements','redeem_invitation_password','redeem_invitation_link','redeem_invitation_by_name');
create table messaging_test_fixture.preserved_rows as
 select 'invitations' rel,md5(coalesce(jsonb_agg(to_jsonb(i) order by id)::text,'')) digest from invitations i union all
 select 'invitation_access',md5(coalesce(jsonb_agg(to_jsonb(i) order by invitation_id)::text,'')) from invitation_access i union all
 select 'guests',md5(coalesce(jsonb_agg(to_jsonb(i) order by id)::text,'')) from guests i union all
 select 'guest_contacts',md5(coalesce(jsonb_agg(to_jsonb(i) order by guest_id)::text,'')) from guest_contacts i union all
 select 'mutation_receipts',md5(coalesce(jsonb_agg(to_jsonb(i) order by event_id,user_id,mutation_id)::text,'')) from mutation_receipts i union all
 select 'notification_jobs',md5(coalesce(jsonb_agg(to_jsonb(i) order by id)::text,'')) from notification_jobs i union all
 select 'messages',md5(coalesce(jsonb_agg(to_jsonb(i)-'updated_at' order by id)::text,'')) from messages i;
