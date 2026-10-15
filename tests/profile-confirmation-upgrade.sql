create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
-- Before applying the incremental migration, in a disposable pre-confirmation database.
insert into auth.users(id,is_anonymous) values('ddddcccc-0000-4000-8000-000000000001',false),('ddddcccc-0000-4000-8000-000000000002',true);
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','ddddcccc-0000-4000-8000-000000000001','ADMIN');
set request.jwt.claim.sub='ddddcccc-0000-4000-8000-000000000001';
select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Existing confirmation guest","whatsapp":"62999995555"}') as created \gset
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values('00000000-0000-4000-8000-000000000001','ddddcccc-0000-4000-8000-000000000002',(:'created'::jsonb->>'invitation_id')::uuid,now());
create schema confirmation_upgrade;
create table confirmation_upgrade.functions as select oid,proname,prosrc from pg_proc where pronamespace='public'::regnamespace and proname in ('app_snapshot','app_mutate','admin_action','redeem_invitation_by_name','redeem_invitation_link','internal_mutation_core','internal_snapshot_core');

-- Supabase default grants: safety must come from RLS too, not only missing grants.
grant select,insert,update,delete on public.guests,public.guest_contacts,public.invitation_sessions to authenticated,anon;
