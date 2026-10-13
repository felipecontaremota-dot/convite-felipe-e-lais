-- DEV ONLY. Human must verify connection target first. Auth users must exist.
-- psql variables: staff_user=<synthetic staff Auth UUID>, guest_user=<anonymous DEV UUID>
BEGIN;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.guests) THEN RAISE EXCEPTION 'fixtures require empty application data'; END IF;
END $$;
INSERT INTO public.events(id,title,starts_at,timezone) VALUES('00000000-0000-4000-8000-000000000001','Synthetic DEV wedding','2026-12-15 16:00:00-03','America/Sao_Paulo');
INSERT INTO public.user_roles(event_id,user_id,role) VALUES('00000000-0000-4000-8000-000000000001',:'staff_user','ADMIN');
SELECT set_config('request.jwt.claim.sub',:'staff_user',true);
SELECT public.admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Synthetic individual A","whatsapp":"00000007391","email":"a@example.test"}');
SELECT public.admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Synthetic individual B","whatsapp":"00000007392","email":"b@example.test"}');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=current_setting('request.jwt.claim.sub')::uuid AND NOT is_anonymous) THEN RAISE EXCEPTION 'synthetic staff Auth user required'; END IF;
END $$;
CREATE TEMP TABLE dev_guest_identity AS SELECT :'guest_user'::uuid AS id;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN dev_guest_identity g ON g.id=u.id WHERE u.is_anonymous) THEN RAISE EXCEPTION 'real synthetic anonymous DEV Auth identity required'; END IF;
END $$;
CREATE TEMP TABLE dev_family AS SELECT public.admin_action('00000000-0000-4000-8000-000000000001','INVITATION_SAVE','{"name":"Synthetic family","pin":"7393"}') AS result;
SELECT public.admin_action('00000000-0000-4000-8000-000000000001','CODE_ROTATE',jsonb_build_object('id',result->>'id','version',1)) FROM dev_family;
INSERT INTO public.guests(event_id,invitation_id,name)
SELECT '00000000-0000-4000-8000-000000000001',(result->>'id')::uuid,n
FROM dev_family CROSS JOIN unnest(ARRAY['Synthetic family member A','Synthetic family member B']) AS n;
INSERT INTO public.guest_contacts(event_id,guest_id,email,consent_in_app,consent_email,consent_whatsapp,consent_push)
SELECT event_id,id,'family@example.test',true,true,false,false FROM public.guests WHERE name LIKE 'Synthetic family member%';
INSERT INTO public.rsvps(event_id,guest_id,status,responded_at)
SELECT event_id,id,CASE WHEN name='Synthetic family member A' THEN 'CONFIRMED'::public.rsvp_status ELSE 'PENDING'::public.rsvp_status END,now()
FROM public.guests WHERE name LIKE 'Synthetic family member%';
SELECT public.redeem_invitation('00000000-0000-4000-8000-000000000001',g.id,a.sharing_code,'7393','synthetic-dev')
FROM dev_guest_identity g CROSS JOIN public.invitation_access a JOIN dev_family f ON a.invitation_id=(f.result->>'id')::uuid;
DROP TABLE dev_family,dev_guest_identity;
COMMIT;
