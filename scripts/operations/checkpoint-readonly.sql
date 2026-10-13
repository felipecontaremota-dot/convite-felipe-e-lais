BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SET LOCAL lock_timeout='2s';
SELECT status,count(*) AS count FROM public.notification_jobs GROUP BY status ORDER BY status;
SELECT count(*) AS processing_jobs FROM public.notification_jobs WHERE status='processing';
SELECT count(*) AS attempted_pending_invitations FROM public.invitation_deliveries WHERE status='pending' AND attempts>0;
SELECT count(*) AS locked_invitation_deliveries FROM public.invitation_deliveries WHERE locked_at IS NOT NULL;
SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;
SELECT count(*) AS installed_guards FROM pg_trigger WHERE tgname='deployment_write_guard';
COMMIT;
-- Any pre-window processing/ambiguous delivery is STOP, not an automatic reset/retry.
