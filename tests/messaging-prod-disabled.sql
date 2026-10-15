begin;
set local role authenticated;
set local request.jwt.claim.sub='dadadada-0000-4000-8000-000000000001';
DO $$begin
 if (app_snapshot('00000000-0000-4000-8000-000000000001')->'capabilities'->>'messaging_v2')::boolean then raise exception 'capability still enabled';end if;
 begin perform app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'MESSAGE_REPLY','{}');raise exception 'reply enabled';exception when others then if sqlerrm<>'messaging v2 temporarily disabled' then raise;end if;end;
 begin perform admin_action('00000000-0000-4000-8000-000000000001','MESSAGE_DELETE','{}');raise exception 'delete enabled';exception when others then if sqlerrm<>'messaging v2 temporarily disabled' then raise;end if;end;
 if exists(select 1 from jsonb_array_elements(app_snapshot('00000000-0000-4000-8000-000000000001')->'messages') m where m->>'deleted_at' is not null) then raise exception 'rollback resurrected tombstones';end if;
end$$;
rollback;
