do $$declare t record; current_rows jsonb;begin
 for t in select * from name_backfill_evidence loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',t.table_name) into current_rows;
  if current_rows is distinct from t.rows then raise exception 'name backfill changed public data';end if;
 end loop;
 if exists((select s.* from invitations i cross join lateral name_pin_private.sources(i.id) s except select * from name_pin_private.aliases)
 union all(select * from name_pin_private.aliases except select s.* from invitations i cross join lateral name_pin_private.sources(i.id) s)) then raise exception 'name backfill registry mismatch';end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='name_pin_private'
 and (pg_get_userbyid(p.proowner)<>'postgres' or p.proconfig is distinct from array['search_path=pg_catalog']::text[]
 or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE'))) then raise exception 'unsafe private function';end if;
end$$;
drop table name_backfill_evidence;
