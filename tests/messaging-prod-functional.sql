-- Extra acceptance checks use real authenticated roles, not SQL Editor privileges.
begin;
create function pg_temp.assert_prod(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'production compatibility: %',msg;end if;end$$;
create function pg_temp.reject_prod(q text) returns void language plpgsql as $$begin execute q;raise exception 'unexpected success';exception when others then if sqlerrm='unexpected success' then raise;end if;end$$;
select unit_id,guest_id,inbound_id,general_id from messaging_test_fixture.baseline \gset
set local role authenticated;
set local request.jwt.claim.sub='dadadada-0000-4000-8000-000000000001';
select pg_temp.assert_prod((app_snapshot('00000000-0000-4000-8000-000000000001')->'capabilities'->>'messaging_v2')::boolean,'capability exposed');
select admin_action('00000000-0000-4000-8000-000000000001','MESSAGE_DELETE',jsonb_build_object('id',:'general_id'));
select admin_action('00000000-0000-4000-8000-000000000001','MESSAGE_DELETE',jsonb_build_object('id',:'general_id'));
select pg_temp.assert_prod(not exists(select 1 from jsonb_array_elements(app_snapshot('00000000-0000-4000-8000-000000000001')->'announcements') a where a->>'message_id'=:'general_id'),'general projection removed');
select pg_temp.assert_prod((select count(*) from audit_logs where entity_id=:'general_id' and action='MESSAGE_DELETE')=1,'repeated delete has one audit');
select pg_temp.reject_prod(format('select admin_action(%L,%L,%L::jsonb)','00000000-0000-4000-8000-000000000001','MESSAGE_DELETE',jsonb_build_object('id',gen_random_uuid())));
select pg_temp.reject_prod(format('select admin_action(%L,%L,%L::jsonb)','00000000-0000-4000-8000-000000000001','MESSAGE_DELETE',jsonb_build_object('id',:'inbound_id')));
reset role;
insert into auth.users(id) values('fafafafa-0000-4000-8000-000000000001');
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','fafafafa-0000-4000-8000-000000000001','CEREMONIALIST');
set local role authenticated;
set local request.jwt.claim.sub='fafafafa-0000-4000-8000-000000000001';
select pg_temp.reject_prod(format('select admin_action(%L,%L,%L::jsonb)','00000000-0000-4000-8000-000000000001','MESSAGE_DELETE',jsonb_build_object('id',:'general_id')));
select pg_temp.reject_prod(format('select app_mutate(%L,gen_random_uuid(),%L,%L::jsonb)','00000000-0000-4000-8000-000000000001','MESSAGE_REPLY',jsonb_build_object('message_id',:'inbound_id','content','denied')));
rollback;
-- A durable tombstone fixture proves safe disable never returns an old unfiltered snapshot.
set request.jwt.claim.sub='dadadada-0000-4000-8000-000000000001';
select admin_action('00000000-0000-4000-8000-000000000001','MESSAGE_DELETE',jsonb_build_object('id',:'general_id'));
