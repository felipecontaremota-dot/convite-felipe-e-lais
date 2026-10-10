create schema rebuild_test;
create function rebuild_test.catalog() returns jsonb language sql as $$
select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_array(c.relname,pg_get_userbyid(c.relowner),c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')),
 'columns',(select jsonb_agg(to_jsonb(x) order by table_name,ordinal_position) from (select table_name,ordinal_position,column_name,data_type,udt_name,is_nullable,column_default from information_schema.columns where table_schema='public') x),
 'enums',(select jsonb_agg(jsonb_build_array(t.typname,pg_get_userbyid(t.typowner),e.enumlabel,e.enumsortorder) order by t.typname,e.enumsortorder) from pg_type t join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid where n.nspname='public'),
 'functions',(select jsonb_agg(jsonb_build_array(p.proname,pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig,p.proacl::text,pg_get_functiondef(p.oid)) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(x) order by tablename,policyname) from pg_policies x where schemaname='public'),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
 'indexes',(select jsonb_agg(to_jsonb(x) order by tablename,indexname) from pg_indexes x where schemaname='public'),
 'constraints',(select jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,k.convalidated,pg_get_constraintdef(k.oid)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
 'views',(select jsonb_agg(jsonb_build_array(c.relname,pg_get_userbyid(c.relowner),c.relacl::text,pg_get_viewdef(c.oid)) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'),
 'schema',(select jsonb_build_array(pg_get_userbyid(nspowner),nspacl::text) from pg_namespace where nspname='public')
);
$$;
create table rebuild_test.expected as select rebuild_test.catalog() as catalog;
-- External data and official history are intentionally outside the cleanup.
create schema storage;
create table storage.sentinel(id integer primary key);
insert into storage.sentinel values(1);
create schema supabase_migrations;
create table supabase_migrations.schema_migrations(version text primary key);
insert into supabase_migrations.schema_migrations select '00'||x from generate_series(1,6) x;
create table rebuild_test.users as select * from auth.users;
