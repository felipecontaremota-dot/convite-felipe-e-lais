begin;
set local lock_timeout='3s';
set local statement_timeout='45s';
-- Managed Supabase only. The application upgrade does not depend on Cron extensions.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create table notification_private.worker_config(
 singleton boolean primary key default true check(singleton),
 endpoint text check(endpoint ~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/dispatch-notifications$'),
 secret_id uuid not null,secret_hash bytea not null,enabled boolean not null default false
);
alter table notification_private.worker_config enable row level security;
revoke all on notification_private.worker_config from public,anon,authenticated,service_role;
do $$declare secret text; sid uuid;begin
 secret=encode(extensions.gen_random_bytes(32),'hex');
 select vault.create_secret(secret,'wedding_notification_worker','Scheduler authentication; never exposed to clients') into sid;
 insert into notification_private.worker_config(secret_id,secret_hash) values(sid,extensions.digest(secret,'sha256'));
end$$;
create function public.notification_worker_authorized(p_secret text) returns boolean language sql stable security definer set search_path=public,extensions,pg_temp as $$
 select coalesce(length(p_secret)=64 and exists(select 1 from notification_private.worker_config where secret_hash=extensions.digest(p_secret,'sha256')),false)
$$;
revoke all on function public.notification_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.notification_worker_authorized(text) to service_role;
create function notification_private.invoke_worker() returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare cfg notification_private.worker_config; secret text;
begin
 select * into cfg from notification_private.worker_config where singleton;
 if not cfg.enabled or cfg.endpoint is null then return;end if;
 -- Do not spend an Edge invocation on an empty tick. SQL is only a bounded wake-up check.
 if not exists(select 1 from public.notification_jobs where attempts<6 and ((status in ('pending','failed') and next_attempt_at<=now()) or(status='processing' and locked_at<now()-interval '10 minutes')))
 and not exists(select 1 from public.notification_schedules s join public.events e on e.id=s.event_id where e.notification_scheduling_enabled and s.active and s.status='scheduled' and s.scheduled_at<=now())
 and not exists(select 1 from public.notification_rules r join public.events e on e.id=r.event_id where e.notification_scheduling_enabled and r.active and e.starts_at-r.days_before*interval '1 day'<=now() and not exists(select 1 from public.messages m where m.notification_rule_id=r.id) and not exists(select 1 from notification_private.rule_expirations x where x.rule_id=r.id)) then return;end if;
 select decrypted_secret into secret from vault.decrypted_secrets where id=cfg.secret_id;
 if secret is null then raise exception 'notification worker secret unavailable';end if;
 perform net.http_post(url:=cfg.endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-worker-secret',secret),body:='{}'::jsonb,timeout_milliseconds:=145000);
end $$;
revoke all on function notification_private.invoke_worker() from public,anon,authenticated,service_role;
-- Five-minute ticks: at most 8,640 wake-up checks per 30 days. No Edge call on empty ticks.
select cron.schedule('wedding-notifications','*/5 * * * *','select notification_private.invoke_worker();');
-- Explicit activation follows controlled integration checks, never installation.
select cron.alter_job(job_id:=(select jobid from cron.job where jobname='wedding-notifications'),active:=false);
commit;
