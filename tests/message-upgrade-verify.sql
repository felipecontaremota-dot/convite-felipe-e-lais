\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local request.jwt.claim.sub='dddddddd-0000-4000-8000-000000000006';
do $$declare r jsonb;begin
 r=app_mutate('dddddddd-0000-4000-8000-000000000007','dddddddd-1000-4000-8000-000000000006','MESSAGE_SEND_TO_GUESTS','{"invalid":"retry payload"}');
 if r <> '{"duplicate":true}'::jsonb then raise exception 'Historical 005 receipt must not invent an ID: %',r;end if;
 if (select count(*) from messages where content='Historical 005 message')<>1 then raise exception 'Upgrade duplicated historical message';end if;
end$$;
commit;
-- Remove only this upgrade fixture before the existing global SQL tests run.
-- Audited children are deleted while their parent event still exists.
begin;
delete from notification_jobs where event_id='dddddddd-0000-4000-8000-000000000007';
delete from messages where event_id='dddddddd-0000-4000-8000-000000000007';
update invitations set primary_guest_id=null where event_id='dddddddd-0000-4000-8000-000000000007';
delete from guests where event_id='dddddddd-0000-4000-8000-000000000007';
delete from invitations where event_id='dddddddd-0000-4000-8000-000000000007';
delete from user_roles where event_id='dddddddd-0000-4000-8000-000000000007';
delete from events where id='dddddddd-0000-4000-8000-000000000007';
commit;
