begin;
do $$begin
 if not exists(select 1 from rebuild_test.home_existing) then raise exception 'Upgrade fixture missing';end if;
 if exists(select 1 from rebuild_test.home_existing e left join guests g on g.id=e.id where e.row is distinct from to_jsonb(g)-'greeting_form' or g.greeting_form is not null) then raise exception 'Existing guest changed during migration';end if;
 if (select jsonb_agg(row order by row::text) from rebuild_test.home_access) is distinct from (select jsonb_agg(to_jsonb(a) order by to_jsonb(a)::text) from invitation_access a) then raise exception 'Invitation credentials changed';end if;
 if exists(select * from rebuild_test.home_functions except select p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),p.proacl::text,pg_get_userbyid(p.proowner) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f') then raise exception 'Existing RPC changed';end if;
end $$;

do $$
declare e uuid:='00000000-0000-4000-8000-000000000001';g uuid;before jsonb;after jsonb;
begin
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 select (admin_action(e,'GUEST_CREATE','{"name":"Greeting fixture"}'::jsonb)->>'id')::uuid into g;
 if (select greeting_form from guests where id=g) is not null then raise exception 'Missing value must remain safe NULL';end if;
 select to_jsonb(x)-'greeting_form'-'updated_at' into before from guests x where id=g;
 update guests set greeting_form='MASCULINE' where id=g;
 if not exists(select 1 from jsonb_array_elements(app_snapshot(e)->'guests') x where x->>'id'=g::text and x->>'greeting_form'='MASCULINE') then raise exception 'Snapshot does not expose explicit form';end if;
 update guests set greeting_form='FEMININE' where id=g;
 update guests set greeting_form='NEUTRAL' where id=g;
 update guests set greeting_form=null where id=g;
 select to_jsonb(x)-'greeting_form'-'updated_at' into after from guests x where id=g;
 if before is distinct from after then raise exception 'Other guest fields changed';end if;
 begin
  update guests set greeting_form='INVALID' where id=g;
  raise exception 'Invalid form accepted';
 exception when check_violation then null;
 end;
 if exists(select 1 from pg_enum where enumtypid='rsvp_status'::regtype and enumlabel='MAYBE') then raise exception 'MAYBE reintroduced';end if;
end $$;
rollback;
