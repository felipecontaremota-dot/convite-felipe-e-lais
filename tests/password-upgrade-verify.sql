do $$begin
 if exists(select 1 from password_upgrade_evidence b left join invitations i on i.id=b.id left join invitation_access a on a.invitation_id=i.id
 where i.id is null or b.event_id is distinct from i.event_id or b.code_hash is distinct from i.code_hash or b.pin is distinct from a.pin or b.sharing_code is distinct from a.sharing_code) then raise exception 'upgrade changed existing credentials';end if;
 if exists(select 1 from password_upgrade_counts where guests<>(select count(*) from public.guests) or rsvps<>(select count(*) from public.rsvps) or sessions<>(select count(*) from public.invitation_sessions)) then raise exception 'upgrade changed data counts';end if;
 if exists((select s.* from invitations i cross join lateral password_entry_private.eligible_source(i.id) s except select event_id,invitation_id,fingerprint from password_entry_private.resolution)
 union all (select event_id,invitation_id,fingerprint from password_entry_private.resolution except select s.* from invitations i cross join lateral password_entry_private.eligible_source(i.id) s)) then raise exception 'upgrade registry mismatch';end if;
end$$;
drop table password_upgrade_evidence,password_upgrade_counts;
do $$declare t record;data jsonb;begin
 for t in select * from password_upgrade_rows loop
  execute format('select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),''[]''::jsonb) from public.%I r',t.table_name) into data;
  if data is distinct from t.rows then raise exception 'upgrade changed preexisting public records';end if;
 end loop;
 if exists(select 1 from password_upgrade_functions b left join pg_proc p on p.oid=b.oid
 where p.oid is null or pg_get_functiondef(p.oid) is distinct from b.definition or p.proacl is distinct from b.proacl or p.proowner is distinct from b.proowner) then raise exception 'upgrade changed unrelated RPC definitions or ACL';end if;
end$$;
drop table password_upgrade_rows,password_upgrade_functions;
do $$declare shared text;begin
 select a.sharing_code into shared from invitation_access a join invitations i on i.id=a.invitation_id where i.name='Preexisting family';
 if not redeem_invitation('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000002',shared,'7392','upgrade-existing-link') then raise exception 'existing family link no longer usable';end if;
 if not redeem_invitation_password('00000000-0000-4000-8000-000000000001','ffcd0000-0000-4000-8000-000000000002','7392','upgrade-root') then raise exception 'preexisting family not backfilled';end if;
 perform set_config('request.jwt.claim.sub','ffcd0000-0000-4000-8000-000000000001',false);
 if app_snapshot('00000000-0000-4000-8000-000000000001')->>'role'<>'ADMIN' then raise exception 'admin RPC contract changed';end if;
 perform set_config('request.jwt.claim.sub','ffcd0000-0000-4000-8000-000000000002',false);
 if app_snapshot('00000000-0000-4000-8000-000000000001')->>'role'<>'GUEST' then raise exception 'existing guest session unusable';end if;
end$$;
