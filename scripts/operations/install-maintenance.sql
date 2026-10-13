-- psql -v operator_login=<verified direct LOGIN role> -f this-file
-- Operational artifact, NOT an application migration. Never run automatically.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE SCHEMA deployment_guard AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA deployment_guard FROM PUBLIC, anon, authenticated, service_role;
CREATE TABLE deployment_guard.control (
 singleton boolean PRIMARY KEY CHECK(singleton),
 active boolean NOT NULL,
 operator_login name NOT NULL
);
INSERT INTO deployment_guard.control VALUES (true,true, :'operator_login');
DO $$ DECLARE op name; BEGIN
 SELECT operator_login INTO op FROM deployment_guard.control;
 IF op::text IN ('anon','authenticated','service_role','authenticator','pgbouncer')
 OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=op AND rolcanlogin)
 OR session_user::text <> op::text THEN
   RAISE EXCEPTION 'maintenance requires explicitly verified direct operator login';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator') AND rolsuper)
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator') AND pg_has_role(oid,op,'MEMBER')) THEN
   RAISE EXCEPTION 'untrusted role can assume privileged operator role';
 END IF;
END $$;
CREATE TABLE deployment_guard.inventory (table_oid oid PRIMARY KEY, trigger_name name NOT NULL);
CREATE FUNCTION deployment_guard.reject_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c deployment_guard.control;
BEGIN
 SELECT * INTO STRICT c FROM deployment_guard.control WHERE singleton;
 IF c.active AND session_user::text <> c.operator_login::text THEN
   RAISE EXCEPTION USING ERRCODE='PT503', MESSAGE='Maintenance: retry the same operation later';
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION deployment_guard.protect_table(target regclass) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE op name;
BEGIN
 SELECT operator_login INTO STRICT op FROM deployment_guard.control WHERE singleton;
 IF session_user::text <> op::text THEN RAISE EXCEPTION 'operator only'; END IF;
 IF EXISTS(SELECT 1 FROM deployment_guard.inventory WHERE table_oid=target::oid) THEN RETURN; END IF;
 EXECUTE format('CREATE TRIGGER deployment_write_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %s FOR EACH STATEMENT EXECUTE FUNCTION deployment_guard.reject_write()',target);
 INSERT INTO deployment_guard.inventory VALUES(target::oid,'deployment_write_guard');
END $$;
-- Explicit baseline inventory, including receipts/claims/outboxes.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY[
 'events','event_settings','profiles','user_roles','invitations','guests',
 'invitation_sessions','guest_contacts','rsvps','gifts','gift_selections',
 'message_threads','messages','message_recipients','announcements','device_push_tokens',
 'notification_rules','notification_jobs','delivery_attempts','qr_credentials','checkins',
 'sheet_sync_jobs','audit_logs','mutation_receipts','invitation_rate_limits',
 'invitation_access','guest_admin_details','invitation_deliveries','invitation_delivery_members',
 'invitation_delivery_batches'
 ] LOOP
   PERFORM deployment_guard.protect_table(to_regclass('public.'||t));
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class p JOIN pg_namespace n ON n.oid=p.relnamespace
 WHERE n.nspname='public' AND p.relkind IN ('r','p')
 AND NOT EXISTS(SELECT 1 FROM deployment_guard.inventory i WHERE i.table_oid=p.oid)) THEN
   RAISE EXCEPTION 'unreviewed public table outside maintenance inventory';
 END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA deployment_guard FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA deployment_guard FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
