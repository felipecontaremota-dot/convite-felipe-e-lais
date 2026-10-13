BEGIN;
DO $$ DECLARE op name; BEGIN
 SELECT operator_login INTO STRICT op FROM deployment_guard.control WHERE singleton;
 IF session_user::text<>op::text THEN RAISE EXCEPTION 'operator only'; END IF;
 UPDATE deployment_guard.control SET active=true WHERE singleton;
END $$;
COMMIT;
