\set ON_ERROR_STOP on
begin;
create function pg_temp.assert_admin_guest(ok boolean,msg text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'admin guest controls: %',msg;end if;end$$;
create function pg_temp.reject_admin_guest(q text) returns void language plpgsql as $$begin execute q;raise exception 'unexpected admin success';exception when others then if sqlerrm='unexpected admin success' then raise;end if;end$$;
select * from test_admin_guest_fixture \gset
select pg_temp.assert_admin_guest((select sent and source='EMAIL' from guest_invitation_status where event_id=:'event' and guest_id=:'first'),'successful individual receipt migrated');
select pg_temp.assert_admin_guest(not exists(select 1 from guest_invitation_status where event_id=:'event' and guest_id=:'companion' and sent),'family sent_at/activation never marks its other members');
select set_config('request.jwt.claim.sub',:'admin',true);
select pg_temp.assert_admin_guest((app_snapshot(:'event')->'capabilities'->>'admin_guest_controls')::boolean,'capability available');
select pg_temp.assert_admin_guest((select (g->>'invitation_sent')::boolean from jsonb_array_elements(app_snapshot(:'event')->'guests') g where g->>'id'=:'first'),'admin snapshot uses persisted individual marker');
select admin_action(:'event','GUEST_INVITATION_SENT_SET',jsonb_build_object('id',:'first','sent',false,'expected_sent',true));
select pg_temp.assert_admin_guest((select not sent from guest_invitation_status where event_id=:'event' and guest_id=:'first'),'manual reversal persisted');
update invitation_deliveries set status='sent' where id=:'delivery';
select pg_temp.assert_admin_guest((select not sent from guest_invitation_status where event_id=:'event' and guest_id=:'first'),'terminal receipt replay does not undo a manual reversal');
insert into invitation_delivery_members(event_id,request_id,guest_id,delivery_id) values(:'event',:'request',:'companion',:'delivery');
select pg_temp.assert_admin_guest((select sent from guest_invitation_status where event_id=:'event' and guest_id=:'companion'),'exact deduplicated recipient inherits their own successful receipt');
select pg_temp.assert_admin_guest((select not sent from guest_invitation_status where event_id=:'event' and guest_id=:'first'),'alias insertion never changes another manual state');
select admin_action(:'event','GUEST_INVITATION_SENT_SET',jsonb_build_object('id',:'companion','sent',false,'expected_sent',true));
select admin_action(:'event','GUEST_INVITATION_SENT_SET',jsonb_build_object('id',:'first','sent',true,'expected_sent',false));
select pg_temp.assert_admin_guest((select not sent from guest_invitation_status where event_id=:'event' and guest_id=:'companion'),'manual mark is individual');
select admin_action(:'event','GUEST_INVITATION_SENT_SET',jsonb_build_object('id',:'first','sent',false,'expected_sent',true));
select pg_temp.reject_admin_guest(format('select admin_action(%L,%L,%L::jsonb)',:'event','GUEST_INVITATION_SENT_SET',jsonb_build_object('id',:'first','sent',true,'expected_sent',true)));
-- A new actual delivery is distinct from replaying an old receipt.
insert into invitation_deliveries(event_id,invitation_id,guest_id,request_id,recipient_email,status)
values(:'event',:'invitation',:'first',gen_random_uuid(),'control@example.test','pending') returning id \gset new_
select pg_temp.assert_admin_guest((select not sent from guest_invitation_status where event_id=:'event' and guest_id=:'first'),'pending provider delivery does not mark sent');
update invitation_deliveries set status='failed' where id=:'new_id';
select pg_temp.assert_admin_guest((select not sent from guest_invitation_status where event_id=:'event' and guest_id=:'first'),'failed provider delivery does not mark sent');
update invitation_deliveries set status='sent',sent_at=now() where id=:'new_id';
select pg_temp.assert_admin_guest((select sent from guest_invitation_status where event_id=:'event' and guest_id=:'first'),'new real delivery updates its recipient');
create temp table admin_before_sending as select * from guest_invitation_status;
create temp table admin_before_messages as select id from messages;
create temp table admin_before_checkins as select id from checkins;
-- All twelve directed transitions and all four no-ops, preserving free text.
DO $$declare f record; dest text; initial text; row_before public.rsvps; audits int;begin
 select * into f from test_admin_guest_fixture;
 foreach initial in array array['PENDING','CONFIRMED','DECLINED','MAYBE'] loop
  foreach dest in array array['PENDING','CONFIRMED','DECLINED','MAYBE'] loop
   select * into row_before from public.rsvps where guest_id=f.first;
   perform public.admin_action(f.event,'GUEST_RSVP_SET',jsonb_build_object('id',f.first,'status',initial,'expected_status',row_before.status,'expected_responded_at',row_before.responded_at));
   select * into row_before from public.rsvps where guest_id=f.first;
   select count(*) into audits from public.audit_logs where entity_id=f.first and action='GUEST_RSVP_SET';
   perform public.admin_action(f.event,'GUEST_RSVP_SET',jsonb_build_object('id',f.first,'status',dest,'expected_status',row_before.status,'expected_responded_at',row_before.responded_at));
   perform pg_temp.assert_admin_guest((select status::text=case when dest='MAYBE' then 'PENDING' else dest end and (responded_at is null)=(dest='PENDING') and dietary='Sem lactose' and note='Nota preservada' from public.rsvps where guest_id=f.first),'transition and complementary data');
   if initial=dest then
    perform pg_temp.assert_admin_guest((select updated_at=row_before.updated_at from public.rsvps where guest_id=f.first),'same state does not write');
    perform pg_temp.assert_admin_guest((select count(*)=audits from public.audit_logs where entity_id=f.first and action='GUEST_RSVP_SET'),'same state does not audit');
   else
    perform pg_temp.assert_admin_guest((select count(*)=audits+1 from public.audit_logs where entity_id=f.first and action='GUEST_RSVP_SET'),'one explicit audit per change');
   end if;
  end loop;
 end loop;
end $$;
select pg_temp.reject_admin_guest(format('select admin_action(%L,%L,%L::jsonb)',:'event','GUEST_RSVP_SET',jsonb_build_object('id',:'first','status','DECLINED','expected_status','DECLINED','expected_responded_at',null)));
select pg_temp.assert_admin_guest(not exists((select * from admin_before_sending except select * from guest_invitation_status) union all (select * from guest_invitation_status except select * from admin_before_sending)),'RSVP never changes sending');
select pg_temp.assert_admin_guest((select count(*) from messages)=(select count(*) from admin_before_messages),'no invented messages');
select pg_temp.assert_admin_guest((select count(*) from checkins)=(select count(*) from admin_before_checkins),'no check-ins modified');
select pg_temp.assert_admin_guest((select bool_and(actor=:'admin' and metadata ? 'previous' and metadata ? 'next') from audit_logs where entity_id=:'first' and action='GUEST_RSVP_SET'),'administrator, old/new status and timestamp audited');
-- Same record in the guest snapshot; no administrative sending data exposed.
select set_config('request.jwt.claim.sub',:'actor',true);
set local role authenticated;
select pg_temp.assert_admin_guest(not exists(select 1 from jsonb_array_elements(app_snapshot(:'event')->'guests') g where g ? 'invitation_sent'),'guest snapshot never exposes markers');
select pg_temp.assert_admin_guest((select count(*)=0 from guest_invitation_status),'RLS hides administrative sending from guests');
select pg_temp.assert_admin_guest((select r->>'source'='ADMIN' and r->>'status'='PENDING' and r->>'responded_at' is not null from jsonb_array_elements(app_snapshot(:'event')->'rsvps') r where r->>'guest_id'=:'first'),'guest receives the same administrative maybe response');
select pg_temp.reject_admin_guest(format('select admin_action(%L,%L,%L::jsonb)',:'event','GUEST_RSVP_SET',jsonb_build_object('id',:'first','status','MAYBE')));
select pg_temp.reject_admin_guest(format('select admin_action(%L,%L,%L::jsonb)',:'event','GUEST_INVITATION_SENT_SET',jsonb_build_object('id',:'first','sent',true,'expected_sent',false)));
select pg_temp.reject_admin_guest(format('update guest_invitation_status set sent=false where guest_id=%L',:'first'));
reset role;
select set_config('request.jwt.claim.sub',:'staff',true);
select pg_temp.reject_admin_guest(format('select admin_action(%L,%L,%L::jsonb)',:'event','GUEST_RSVP_SET',jsonb_build_object('id',:'first','status','MAYBE')));
select set_config('request.jwt.claim.sub',:'admin',true);
select pg_temp.reject_admin_guest(format('select admin_action(%L,%L,%L::jsonb)','aabbffaa-9999-4000-8000-000000000001','GUEST_RSVP_SET',jsonb_build_object('id',:'first','status','MAYBE')));
set local role authenticated;
select pg_temp.reject_admin_guest(format('update guest_invitation_status set sent=false where guest_id=%L',:'first'));
reset role;
select pg_temp.assert_admin_guest(not has_table_privilege('anon','guest_invitation_status','SELECT') and not has_table_privilege('authenticated','guest_invitation_status','UPDATE'),'default table grants restricted');
select pg_temp.assert_admin_guest(not has_function_privilege('authenticated','public.guest_admin_action_core(uuid,text,jsonb)','EXECUTE') and not has_function_privilege('authenticated','public.guest_admin_snapshot_core(uuid)','EXECUTE') and not has_function_privilege('authenticated','public.record_guest_invitation_delivery(uuid,uuid)','EXECUTE'),'internal helpers not exposed');
rollback;
\echo 'Admin guest controls: upgrade, receipts, individual state, all RSVP transitions, audit, preservation and authorization passed.'
