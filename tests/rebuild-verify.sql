do $$
declare expected jsonb; actual jsonb; k text;
begin
 select catalog into expected from rebuild_test.expected;
 actual=rebuild_test.catalog();
 for k in select jsonb_object_keys(expected) loop
  if expected->k is distinct from actual->k then raise exception 'Rebuilt catalog differs: %',k;end if;
 end loop;
 if (select jsonb_agg(to_jsonb(u) order by id) from auth.users u) is distinct from (select jsonb_agg(to_jsonb(u) order by id) from rebuild_test.users u) then raise exception 'Auth users changed';end if;
 if (select count(*) from storage.sentinel)<>1 then raise exception 'Storage changed';end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>6 then raise exception 'Migration history changed';end if;
 if (select count(*) from user_roles where role='ADMIN')<>1 then raise exception 'ADMIN not restored';end if;
 if exists(select 1 from guests) or exists(select 1 from invitation_deliveries) then raise exception 'Old operational data survives';end if;
 if event_role('00000000-0000-4000-8000-000000000001') is distinct from 'ADMIN' then raise exception 'ADMIN RPC failed';end if;
 if app_snapshot('00000000-0000-4000-8000-000000000001')->>'role' <> 'ADMIN' then raise exception 'Snapshot failed';end if;
 raise notice 'PASS: exact baseline catalog, Auth/Storage/history preserved, ADMIN restored';
end $$;
