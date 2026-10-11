\set ON_ERROR_STOP on
reset role;
create function pg_temp.digest(text,text) returns bytea language sql security definer as $$select extensions.digest($1,$2)$$;
create function pg_temp.assert_true(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
do $$declare t record;rows jsonb;current_oid oid;alias_oid oid;begin
 for t in select * from family_upgrade_rows loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),''[]''::jsonb) from %I x where event_id=$1',t.table_name) into rows using 'fefe0000-2000-4000-8000-000000000003'::uuid;
  if rows is distinct from t.original then raise exception '009 changed existing data in %',t.table_name;end if;
 end loop;
 for t in select * from family_upgrade_acl loop
  current_oid=case when t.proname='app_mutate' then 'app_mutate(uuid,uuid,text,jsonb)'::regprocedure else 'app_snapshot(uuid)'::regprocedure end;
  alias_oid=case when t.proname='app_mutate' then 'app_mutate_v8(uuid,uuid,text,jsonb)'::regprocedure else 'app_snapshot_v8(uuid)'::regprocedure end;
  if has_function_privilege(t.rolname,current_oid,'EXECUTE') is distinct from t.allowed then raise exception 'public ACL changed';end if;
  if not exists(select 1 from pg_proc where oid=current_oid and proargnames=t.proargnames and proargtypes=t.proargtypes and prorettype=t.prorettype) then raise exception 'public signature changed';end if;
  if alias_oid<>t.oid or not exists(select 1 from pg_proc where oid=alias_oid and prosrc=t.prosrc and proargnames=t.proargnames and proargtypes=t.proargtypes and prorettype=t.prorettype) then raise exception 'old implementation changed';end if;
  if has_function_privilege(t.rolname,alias_oid,'EXECUTE') then raise exception 'internal implementation exposed';end if;
 end loop;
end$$;
set role authenticated;
do $$declare s record;begin
 for s in select * from family_upgrade_snapshot loop
  perform set_config('request.jwt.claim.sub',s.actor::text,false);
  if (app_snapshot('fefe0000-2000-4000-8000-000000000003')-'family_credentials') is distinct from s.original then raise exception 'snapshot legacy contract changed';end if;
 end loop;
end$$;
reset role;
select * from profile_upgrade_context \gset
set role service_role;
select pg_temp.assert_true(redeem_invitation(:'event',:'family_device',:'family_code','0047','qr-upgrade'),'old link and PIN work after 009');
set role service_role;
set request.jwt.claim.sub=:'admin';
select pg_temp.assert_true(app_snapshot(:'event')->>'role'='ADMIN','service role public snapshot still executes');
select pg_temp.assert_true((app_mutate(:'event','fefe0000-2000-4000-8000-000000000020','MESSAGE_SEND_TO_GUESTS','{}')->>'duplicate')::boolean,'service role public mutate still executes');
set role authenticated;
set request.jwt.claim.sub=:'family_device';
select pg_temp.assert_true(event_role(:'event')='GUEST','old session preserved');
select issue_family_ticket(:'event',:'fid') as family_qr \gset
select pg_temp.assert_true(length(:'family_qr'::jsonb->>'token')=64,'family QR issues on upgraded data');
select app_mutate(:'event',gen_random_uuid(),'RSVP_UPDATE',jsonb_build_object('guest_id',:'gb','status','CONFIRMED'));
select app_mutate(:'event',gen_random_uuid(),'CONTACT_UPDATE',jsonb_build_object('guest_id',:'gb','whatsapp','62911112222'));
set request.jwt.claim.sub=:'admin';
select pg_temp.assert_true(app_mutate(:'event','fefe0000-2000-4000-8000-000000000020','MESSAGE_SEND_TO_GUESTS','{}')->>'id'=:'message_id','message idempotency still delegates');
select app_mutate(:'event',gen_random_uuid(),'CHECKIN_FAMILY_CREATE',jsonb_build_object('invitation_id',:'fid','guest_ids',jsonb_build_array(:'ga',:'gb'),'token_hash',encode(pg_temp.digest(:'family_qr'::jsonb->>'token','sha256'),'hex')));
reset role;
select pg_temp.assert_true((select sharing_code=:'family_code' and pin='0047' from invitation_access where invitation_id=:'fid'),'new family issuance/checkin leaves old access untouched');
select pg_temp.assert_true((select token_hash=encode(pg_temp.digest(:'ticket','sha256'),'hex') and revoked_at is null from qr_credentials where guest_id=:'ga'),'old individual QR preserved');
select pg_temp.assert_true((select count(*)=2 from checkins where event_id=:'event' and guest_id in (:'ga',:'gb')),'real check-in on upgraded family');
