begin;
do $$begin
 if not exists(select 1 from rebuild_test.home_existing) then raise exception 'Upgrade fixture missing';end if;
 if exists(select 1 from rebuild_test.home_existing e left join guests g on g.id=e.id where e.row is distinct from to_jsonb(g)-'greeting_form' or g.greeting_form is not null) then raise exception 'Existing guest changed during migration';end if;
 if (select jsonb_agg(row order by row::text) from rebuild_test.home_access) is distinct from (select jsonb_agg(to_jsonb(a) order by to_jsonb(a)::text) from invitation_access a) then raise exception 'Invitation credentials changed';end if;
 -- All unrelated 001-006 RPC definitions, owners and ACLs must remain intact.
 if exists(
  select proname,signature,definition,acl,owner from rebuild_test.home_functions where proname<>'admin_action'
  except
  select p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind='f' and p.proname not in ('admin_action','admin_action_home_base')
 ) then raise exception 'Unrelated RPC changed';end if;
 if not has_function_privilege('authenticated','public.admin_action(uuid,text,jsonb)','EXECUTE')
  or has_function_privilege('authenticated','public.admin_action_home_base(uuid,text,jsonb)','EXECUTE')
 then raise exception 'Admin wrapper grants are incorrect';end if;
end $$;

do $$
declare e uuid:='00000000-0000-4000-8000-000000000001';g uuid;v integer;
 before jsonb;after jsonb;rejected boolean;
begin
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 select (admin_action(e,'GUEST_CREATE','{"name":"Greeting fixture","greeting_form":"MASCULINE"}'::jsonb)->>'id')::uuid into g;
 if (select greeting_form from guests where id=g) is distinct from 'MASCULINE' then raise exception 'Create did not persist masculine';end if;
 if not exists(select 1 from jsonb_array_elements(app_snapshot(e)->'guests') x where x->>'id'=g::text and x->>'greeting_form'='MASCULINE') then raise exception 'Snapshot does not expose explicit form';end if;
 select to_jsonb(x)-'greeting_form'-'updated_at' into before from guests x where id=g;
 select version into v from guests where id=g;
 perform admin_action(e,'GUEST_UPDATE',jsonb_build_object('id',g,'version',v,'name','Greeting fixture','greeting_form','FEMININE'));
 if (select greeting_form from guests where id=g) is distinct from 'FEMININE' then raise exception 'Edit did not persist feminine';end if;
 select version into v from guests where id=g;
 perform admin_action(e,'GUEST_UPDATE',jsonb_build_object('id',g,'version',v,'name','Greeting fixture','greeting_form',null));
 if (select greeting_form from guests where id=g) is not null then raise exception 'Select fallback did not persist NULL';end if;
 -- Version changes above are intentional; no other business fields may change.
 select to_jsonb(x)-'greeting_form'-'updated_at'-'version' into after from guests x where id=g;
 if before-'version' is distinct from after then raise exception 'Other guest fields changed';end if;
 rejected=false;
 begin
  perform admin_action(e,'GUEST_CREATE','{"name":"Invalid fixture","greeting_form":"NEUTRAL"}'::jsonb);
 exception when others then
  if SQLERRM='invalid greeting form' then rejected=true;else raise;end if;
 end;
 if not rejected then raise exception 'NEUTRAL accepted by RPC';end if;
 begin
  update guests set greeting_form='NEUTRAL' where id=g;
  raise exception 'NEUTRAL accepted by constraint';
 exception when check_violation then null;
 end;
 if exists(select 1 from pg_enum where enumtypid='rsvp_status'::regtype and enumlabel='MAYBE') then raise exception 'MAYBE reintroduced';end if;
end $$;
rollback;
