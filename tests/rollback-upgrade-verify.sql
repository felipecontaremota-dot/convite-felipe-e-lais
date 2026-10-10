\set ON_ERROR_STOP on
do $$declare t record;v jsonb;begin
 for t in select * from rollback_checkpoint.data loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from %I.%I x',case when t.table_name='users' then 'auth' else 'public' end,t.table_name) into v;
  if v is distinct from t.rows then raise exception 'Rollback changed data in %',t.table_name;end if;
 end loop;
end$$;
\echo Compatibility upgrade preserves every public/auth table, including links, PINs, sessions, MAYBE, consents, logs, receipts, jobs and pending delivery lease/hash.
drop schema rollback_checkpoint cascade;
-- All remaining assertions run inside a transaction; the preserved fixture stays intact.
