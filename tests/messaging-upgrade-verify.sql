\set ON_ERROR_STOP on
begin;
do $$declare e uuid:='00000000-0000-4000-8000-000000000001'; f messaging_test_fixture.baseline; ambiguous uuid; job public.notification_jobs; admission jsonb;begin
 select * into f from messaging_test_fixture.baseline;
 if not exists(select 1 from messages where id=f.inbound_id and read_at is not null and legacy_admin_read_at=read_at) then raise exception 'historical shared read lost';end if;
 if exists(select 1 from message_reads where message_id=f.inbound_id) then raise exception 'invented historical per-user receipt';end if;
 if not exists(select 1 from announcements where message_id=f.general_id) or not exists(select 1 from messages where id=f.general_id and audience='GENERAL') then raise exception 'one-to-one broadcast projection not associated';end if;
 if exists(select 1 from announcements where content='Upgrade ambiguous notice' and message_id is not null) then raise exception 'ambiguous legacy projection was guessed';end if;
 if (select count(*) from messages where content='Upgrade ambiguous notice')<>2 then raise exception 'historical records were lost';end if;
 if not exists(select 1 from message_recipients where message_id=f.rule_message_id and guest_id=f.guest_id) then raise exception 'known legacy worker recipient not associated';end if;
 perform set_config('request.jwt.claim.sub','dadadada-0000-4000-8000-000000000001',true);
 select id into ambiguous from messages where content='Upgrade ambiguous notice' order by id limit 1;
 begin perform admin_action(e,'MESSAGE_DELETE',jsonb_build_object('id',ambiguous));raise exception 'ambiguous deletion succeeded';exception when others then if sqlerrm<>'legacy announcement needs association' then raise;end if;end;
 if exists(select 1 from messages where content='Upgrade ambiguous notice' and deleted_at is not null) then raise exception 'ambiguous deletion altered history';end if;
 perform set_config('request.jwt.claim.sub','dadadada-0000-4000-8000-000000000002',true);
 if not can_read_message(e,f.rule_message_id) then raise exception 'legacy authorized inbox remains inaccessible';end if;
 -- Historical rule jobs omit message_id: their stable job UUID still binds deletion and admission.
 update notification_jobs set status='processing',locked_at=clock_timestamp(),delivery_started_at=null where id=f.rule_message_id returning * into job;
 admission=authorize_notification_attempt(e,job.id,job.guest_id,job.channel,job.attempts,job.locked_at,false);
 if not (admission->>'authorized')::boolean then raise exception 'upgrade fixture was not eligible before deletion';end if;
 perform set_config('request.jwt.claim.sub','dadadada-0000-4000-8000-000000000001',true);
 perform admin_action(e,'MESSAGE_DELETE',jsonb_build_object('id',f.rule_message_id));
 if not exists(select 1 from notification_jobs where id=f.rule_message_id and status='skipped') then raise exception 'legacy rule job was not stopped';end if;
 update notification_jobs set status='processing',locked_at=clock_timestamp() where id=f.rule_message_id returning * into job;
 admission=authorize_notification_attempt(e,job.id,job.guest_id,job.channel,job.attempts,job.locked_at,false);
 if (admission->>'authorized')::boolean then raise exception 'deleted legacy rule message can be retried';end if;
end$$;
rollback;
\echo Historical messaging upgrade preserves data, shared reads and ambiguous projections.
