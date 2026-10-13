BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ DECLARE r record; op name; BEGIN
 SELECT operator_login INTO STRICT op FROM deployment_guard.control WHERE singleton;
 IF session_user::text<>op::text THEN RAISE EXCEPTION 'operator only'; END IF;
 FOR r IN SELECT * FROM deployment_guard.inventory ORDER BY table_oid LOOP
   EXECUTE format('DROP TRIGGER %I ON %s',r.trigger_name,r.table_oid::regclass);
 END LOOP;
END $$;
DROP FUNCTION deployment_guard.protect_table(regclass);
DROP FUNCTION deployment_guard.reject_write();
DROP TABLE deployment_guard.inventory;
DROP TABLE deployment_guard.control;
DROP SCHEMA deployment_guard;
COMMIT;
