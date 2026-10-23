\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('de000000-0000-4000-8000-000000000001'),('de000000-0000-4000-8000-000000000002'),('de000000-0000-4000-8000-000000000003');
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000001','ADMIN'),('00000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000002','CEREMONIALIST');
select set_config('request.jwt.claim.sub','de000000-0000-4000-8000-000000000001',true);
select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Reversão controlada"}') as guest \gset
select (:'guest'::jsonb->>'id') as gid \gset
update rsvps set status='CONFIRMED',note='Preservar',dietary='Preservar' where guest_id=:'gid';
select issue_ticket('00000000-0000-4000-8000-000000000001',:'gid',false) as ticket \gset
select token_hash as hash from qr_credentials where guest_id=:'gid' and revoked_at is null \gset
create temp table reversal_fixture as select :'gid'::uuid gid,:'hash'::text hash;
grant select on reversal_fixture to authenticated;
-- The revised path must work with audit updates prohibited entirely.
create function pg_temp.reject_audit_update() returns trigger language plpgsql as $$begin raise exception 'Audit UPDATE prohibited in this test';end $$;
create trigger refinement_append_only before update on public.audit_logs for each row execute function pg_temp.reject_audit_update();
set local role authenticated;
select set_config('request.jwt.claim.sub','de000000-0000-4000-8000-000000000002',true);
DO $$declare e uuid:='00000000-0000-4000-8000-000000000001';f record;c jsonb;r jsonb;n jsonb;retry uuid:=gen_random_uuid();h jsonb;begin
 select * into f from reversal_fixture;
 c=app_mutate(e,gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('method','QR','token_hash',f.hash));
 perform set_config('app.checkin_reversal_context','{"unrelated":true}',true);
 r=app_mutate(e,retry,'CHECKIN_REVERT',jsonb_build_object('id',c->>'id'));
 if current_setting('app.checkin_reversal_context')<>'{"unrelated":true}' then raise exception 'context not restored';end if;
 if (r->>'duplicate')::boolean or r->>'removed_by'<>auth.uid()::text then raise exception 'invalid reversal result';end if;
 if exists(select 1 from checkins where guest_id=f.gid) then raise exception 'entry still active';end if;
 if not (app_mutate(e,retry,'CHECKIN_REVERT',jsonb_build_object('id',c->>'id'))->>'duplicate')::boolean then raise exception 'retry not idempotent';end if;
 n=app_mutate(e,gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('method','QR','token_hash',f.hash));
 if n->>'id'=c->>'id' then raise exception 'no new registration';end if;
 perform app_mutate(e,retry,'CHECKIN_REVERT',jsonb_build_object('id',c->>'id'));
 if not exists(select 1 from checkins where id=(n->>'id')::uuid) then raise exception 'stale removal deleted a fresh entry';end if;
 h=app_snapshot(e)->'checkin_history';
 if (select count(*) from jsonb_array_elements(h) x where x->>'guest_id'=f.gid::text)<>3 then raise exception 'history does not preserve entry/removal/reentry';end if;
 if (select count(*) from jsonb_array_elements(h) x where x->>'action'='REMOVAL' and x->>'checkin_id'=c->>'id')<>1 then raise exception 'duplicate removal history';end if;
 begin delete from checkins where guest_id=f.gid;raise exception 'direct delete accepted';exception when insufficient_privilege then null;end;
 -- Cross-event attempts never resolve a foreign check-in.
 begin perform app_mutate(gen_random_uuid(),gen_random_uuid(),'CHECKIN_REVERT',jsonb_build_object('id',n->>'id'));raise exception 'accepted';exception when others then if sqlerrm='accepted' then raise;end if;end;
end $$;
reset role;
DO $$declare f record;begin select * into f from reversal_fixture;
 if (select status from rsvps where guest_id=f.gid)<>'CONFIRMED' or (select note from rsvps where guest_id=f.gid)<>'Preservar' then raise exception 'RSVP changed';end if;
 if not exists(select 1 from qr_credentials where guest_id=f.gid and token_hash=f.hash and revoked_at is null) then raise exception 'original QR revoked';end if;
end $$;
-- A real GUEST session is not an operational role, even in the same event.
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at,profile_guest_id)
select '00000000-0000-4000-8000-000000000001','de000000-0000-4000-8000-000000000003',g.invitation_id,now(),g.id from guests g join reversal_fixture f on f.gid=g.id;
set local role authenticated;
select set_config('request.jwt.claim.sub','de000000-0000-4000-8000-000000000003',true);
DO $$begin
 if event_role('00000000-0000-4000-8000-000000000001')<>'GUEST' then raise exception 'fixture is not a guest';end if;
 begin perform app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'CHECKIN_REVERT',jsonb_build_object('id',gen_random_uuid()));raise exception 'accepted';exception when others then if sqlerrm='accepted' then raise;end if;end;
 if (app_snapshot('00000000-0000-4000-8000-000000000001')) ? 'checkin_history' then raise exception 'history leak';end if;
end $$;
-- The legacy administrator action delegates to the same audited reversal.
select set_config('request.jwt.claim.sub','de000000-0000-4000-8000-000000000001',true);
DO $$declare f record;c public.checkins;n jsonb;begin
 select * into f from reversal_fixture;
 select * into c from public.checkins where guest_id=f.gid;
 perform admin_action('00000000-0000-4000-8000-000000000001','CHECKIN_REVERT',jsonb_build_object('id',c.id));
 n=app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',f.gid,'method','MANUAL'));
 if n->>'method'<>'MANUAL' then raise exception 'manual reentry failed';end if;
end $$;
rollback;
select 'Reversal authorization, audit/history, retry, original QR reentry, RSVP preservation and stale-ID protection passed.';
