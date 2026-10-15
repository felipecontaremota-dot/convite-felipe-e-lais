DO $$declare r record; target text;begin
 if exists(select 1 from guests where profile_confirmed_at is not null) then raise exception 'existing guest auto-confirmed';end if;
 if exists(select 1 from invitation_sessions where profile_guest_id is not null) then raise exception 'existing session assigned an arbitrary member';end if;
 for r in select * from confirmation_upgrade.functions loop
  if r.proname in ('internal_mutation_core','internal_snapshot_core') then
   target=replace(r.proname,'internal_','profile_confirmation_');
   if not exists(select 1 from pg_proc where proname=target and pronamespace='public'::regnamespace and prosrc=r.prosrc) then raise exception 'old profile implementation not preserved';end if;
  elsif not exists(select 1 from pg_proc where oid=r.oid and prosrc=r.prosrc) then raise exception 'public/auth function replaced';end if;
 end loop;
end$$;
