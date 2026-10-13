-- Simulate the API LOGIN separately from its JWT effective role.
CREATE ROLE maintenance_api LOGIN NOINHERIT;
GRANT anon,authenticated,service_role TO maintenance_api;
CREATE FUNCTION public.maintenance_test_definer() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE notification_jobs SET status='processing' WHERE false; END $$;
GRANT EXECUTE ON FUNCTION public.maintenance_test_definer() TO anon,authenticated,service_role;
GRANT INSERT,UPDATE,DELETE ON public.notification_jobs TO anon,authenticated,service_role;
SELECT set_config('request.jwt.claim.sub','ffcd0000-0000-4000-8000-000000000001',false);
SELECT set_config('maintenance.test_job',(SELECT id::text FROM operations_evidence.preclaimed),false);
SELECT set_config('maintenance.test_guest',(SELECT id::text FROM guests WHERE name='Preexisting individual'),false);
-- A claim with no rows is legal before installation in the baseline harness;
-- after installation it must fail even with a valid service role.
GRANT TRUNCATE ON public.audit_logs TO anon,authenticated,service_role;
SET SESSION AUTHORIZATION maintenance_api;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  EXECUTE format('SET LOCAL ROLE %I',r);
  BEGIN PERFORM public.maintenance_test_definer(); RAISE EXCEPTION 'SECURITY DEFINER bypass'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
  BEGIN UPDATE public.notification_jobs SET status='processing' WHERE false; RAISE EXCEPTION 'empty claim bypass'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
  BEGIN TRUNCATE public.audit_logs; RAISE EXCEPTION 'TRUNCATE bypass'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
  BEGIN DELETE FROM public.notification_jobs WHERE false; RAISE EXCEPTION 'empty DELETE bypass'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
  BEGIN INSERT INTO public.notification_jobs(event_id,guest_id,channel,idempotency_key) SELECT NULL,NULL,'IN_APP','blocked' WHERE false; RAISE EXCEPTION 'empty INSERT bypass'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
 END LOOP;
 SET LOCAL ROLE authenticated;
 BEGIN
  PERFORM public.app_mutate('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000099','RSVP_UPDATE',jsonb_build_object('guest_id',current_setting('maintenance.test_guest'),'status','CONFIRMED'));
  RAISE EXCEPTION 'ADMIN/old queue mutation bypass';
 EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
 BEGIN
  PERFORM public.admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Blocked creation"}');
  RAISE EXCEPTION 'admin creation bypass';
 EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
 SET LOCAL ROLE service_role;
 BEGIN UPDATE public.notification_jobs SET status='sent' WHERE id=current_setting('maintenance.test_job')::uuid; RAISE EXCEPTION 'old post-provider finish bypass'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
 BEGIN PERFORM public.claim_notifications(0); RAISE EXCEPTION 'dispatcher claim bypass'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
 BEGIN PERFORM public.claim_sheet_jobs(0); RAISE EXCEPTION 'Sheets claim bypass'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
 BEGIN
  PERFORM public.prepare_invitation_delivery('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000098',current_setting('maintenance.test_guest')::uuid);
  RAISE EXCEPTION 'invitation reservation bypass';
 EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END;
END $$;
RESET SESSION AUTHORIZATION;
-- Operator writes remain permitted, even when effective role is authenticated.
SET ROLE authenticated;
UPDATE public.notification_jobs SET status='processing' WHERE false;
RESET ROLE;
DROP FUNCTION public.maintenance_test_definer();

DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.mutation_receipts WHERE mutation_id='ffcd0000-0000-4000-8000-000000000099')
 OR EXISTS(SELECT 1 FROM public.guests WHERE name='Blocked creation')
 OR EXISTS(SELECT 1 FROM public.invitation_deliveries WHERE request_id='ffcd0000-0000-4000-8000-000000000098') THEN RAISE EXCEPTION 'blocked transaction left writes/receipt/reservation'; END IF;
END $$;
