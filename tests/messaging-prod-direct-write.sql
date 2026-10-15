-- Default table grants must never provide a second write pipeline through the Data API.
begin;
select unit_id,inbound_id from messaging_test_fixture.baseline \gset
select thread_id from public.messages where id=:'inbound_id' \gset
create function pg_temp.assert_no_direct(n bigint,msg text) returns void language plpgsql as $$begin if n<>0 then raise exception 'RLS direct write allowed: %',msg;end if;end$$;
set local role authenticated;
set local request.jwt.claim.sub='dadadada-0000-4000-8000-000000000001';
with changed as(update public.messages set content='Direct write must fail' where id=:'inbound_id' returning id) select pg_temp.assert_no_direct(count(*),'message UPDATE') from changed;
with changed as(delete from public.messages where id=:'inbound_id' returning id) select pg_temp.assert_no_direct(count(*),'message DELETE') from changed;
with changed as(delete from public.announcements returning id) select pg_temp.assert_no_direct(count(*),'announcement DELETE') from changed;
with changed as(delete from public.notification_jobs returning id) select pg_temp.assert_no_direct(count(*),'job DELETE') from changed;
with changed as(delete from public.message_recipients returning id) select pg_temp.assert_no_direct(count(*),'recipient DELETE') from changed;
DO $$begin
 begin
  insert into public.messages(event_id,thread_id,content) select m.event_id,m.thread_id,'Direct insert must fail' from public.messages m limit 1;
  raise exception 'direct insert succeeded';
 exception when insufficient_privilege then null;
 end;
end$$;
set local role anon;
select pg_temp.assert_no_direct(count(*),'anonymous message SELECT') from public.messages;
reset role;
rollback;
