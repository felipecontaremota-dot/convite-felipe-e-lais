DO $$declare r record; target text; actual text;begin
 for r in select * from messaging_test_fixture.preserved_functions loop
  target=case r.signature when 'app_snapshot(uuid)' then 'messaging_snapshot_core(uuid)' when 'app_mutate(uuid,uuid,text,jsonb)' then 'messaging_mutation_core(uuid,uuid,text,jsonb)' when 'admin_action(uuid,text,jsonb)' then 'messaging_admin_core(uuid,text,jsonb)' when 'can_read_message(uuid,uuid)' then 'messaging_visibility_core(uuid,uuid)' when 'schedule_notifications()' then 'messaging_schedule_core()' when 'authorize_notification_attempt(uuid,uuid,uuid,delivery_channel,integer,timestamp with time zone,boolean)' then 'messaging_admission_core(uuid,uuid,uuid,delivery_channel,integer,timestamp with time zone,boolean)' else r.signature end;
  if not exists(select 1 from pg_proc where oid=to_regprocedure('public.'||target) and prosrc=r.prosrc and proargnames is not distinct from r.proargnames and prorettype=r.prorettype and prosecdef=r.prosecdef and proconfig is not distinct from r.proconfig) then raise exception 'Original function altered: %',r.signature;end if;
 end loop;
 for r in select * from messaging_test_fixture.preserved_rows where rel<>'messages' loop
  -- Canonical sorting below matches the saved baseline, without reading production rows.
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(i) order by %s)::text,'''')) from public.%I i',case r.rel when 'invitation_access' then 'invitation_id' when 'guest_contacts' then 'guest_id' when 'mutation_receipts' then 'event_id,user_id,mutation_id' else 'id' end,r.rel) into actual;
  if actual<>r.digest then raise exception 'Baseline data altered: %',r.rel;end if;
 end loop;
 select md5(coalesce(jsonb_agg(to_jsonb(i)-'deleted_at'-'deleted_by'-'notification_title'-'legacy_admin_read_at'-'audience'-'updated_at' order by id)::text,'')) into actual from messages i;
 if actual<>(select digest from messaging_test_fixture.preserved_rows where rel='messages') then raise exception 'Historical message changed';end if;
 if exists(select 1 from events where notification_scheduling_enabled) then raise exception 'Scheduling enabled without authorization';end if;
end$$;
