-- Read-only inventory before preparing the maintenance window.
select current_database(),current_user,version();
select version,name from supabase_migrations.schema_migrations order by version;
select n.nspname,c.relname,c.relkind,pg_get_userbyid(c.relowner),c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname;
select p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by p.proname;
select e.extname,n.nspname,pg_get_userbyid(e.extowner) from pg_extension e join pg_namespace n on n.oid=e.extnamespace;
-- Cross-schema dependencies: review every result involving application objects.
select pg_describe_object(d.classid,d.objid,d.objsubid) as dependent,
 pg_describe_object(d.refclassid,d.refobjid,d.refobjsubid) as referenced,d.deptype
from pg_depend d
where (d.refclassid='pg_class'::regclass and d.refobjid in(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'))
 or (d.refclassid='pg_proc'::regclass and d.refobjid in(select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'));
-- Run locally in SQL Editor; do not paste personal values in GitHub or chat.
select u.id,u.email,u.is_anonymous,r.event_id,r.role
from auth.users u left join public.user_roles r on r.user_id=u.id
where not u.is_anonymous and r.role='ADMIN';
-- If the role is missing, search Auth's user panel by your verified login email.
