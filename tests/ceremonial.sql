\set ON_ERROR_STOP on
begin;
insert into auth.users(id) values('cc000000-0000-4000-8000-000000000001'),('cc000000-0000-4000-8000-000000000002'),('cc000000-0000-4000-8000-000000000003');
insert into user_roles(event_id,user_id,role) values('00000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','ADMIN'),('00000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000002','CEREMONIALIST');
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000001',true);
select admin_action('00000000-0000-4000-8000-000000000001','GUEST_CREATE','{"name":"Ágata Operacional","email":"private@example.test","admin_notes":"Observação\noperacional"}') as guest \gset
select (:'guest'::jsonb->>'id') as gid \gset
select invitation_id as iid from guests where id=:'gid' \gset
select wedding_party_admin_set('00000000-0000-4000-8000-000000000001',:'gid','MADRINHA',null);
update rsvps set status='CONFIRMED',responded_at=now(),dietary='Sem lactose',note=E'Nota\nRSVP' where guest_id=:'gid';
select issue_ticket('00000000-0000-4000-8000-000000000001',:'gid',false) as ticket \gset
select token_hash as qr_hash from qr_credentials where guest_id=:'gid' and revoked_at is null \gset
create temp table ceremony_fixture as select :'gid'::uuid gid,:'iid'::uuid iid,:'qr_hash'::text hash;
grant select on ceremony_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000002',true);
DO $$declare s jsonb; g jsonb; f record; n integer; a jsonb; b jsonb;begin
 select * into f from ceremony_fixture;
 s=app_snapshot('00000000-0000-4000-8000-000000000001');
 if s->>'role'<>'CEREMONIALIST' or not (s#>>'{capabilities,ceremonial_portal}')::boolean then raise exception 'staff role missing';end if;
 select x into g from jsonb_array_elements(s->'guests') x where x->>'id'=f.gid::text;
 if g->>'party_role'<>'MADRINHA' or g->>'admin_notes'<>E'Observação\noperacional' then raise exception 'operational data missing';end if;
 if s::text like '%private@example.test%' then raise exception 'contact leak';end if;
 if jsonb_array_length(s->'gifts')<>0 or jsonb_array_length(s->'contacts')<>0 or jsonb_array_length(s->'credentials')<>0 or jsonb_array_length(s->'messages')<>0 then raise exception 'private data leak';end if;
 if exists(select 1 from jsonb_array_elements(s->'invitations') x where x ? 'pin' or x ? 'sharing_code' or x ? 'code_hash') then raise exception 'credential leak';end if;
 if exists(select 1 from guest_contacts where guest_id=f.gid) or exists(select 1 from guest_admin_details where guest_id=f.gid) then raise exception 'raw RLS leaked private data';end if;
 begin perform admin_action('00000000-0000-4000-8000-000000000001','GUEST_RSVP_SET',jsonb_build_object('id',f.gid,'status','DECLINED'));raise exception 'accepted';exception when others then if sqlerrm='accepted' then raise;end if;end;
 begin perform wedding_party_admin_set('00000000-0000-4000-8000-000000000001',f.gid,'PADRINHO',null);raise exception 'accepted';exception when others then if sqlerrm='accepted' then raise;end if;end;
 begin perform app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'RSVP_UPDATE',jsonb_build_object('guest_id',f.gid,'status','DECLINED'));raise exception 'accepted';exception when others then if sqlerrm='accepted' then raise;end if;end;
 begin perform app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',f.gid,'method','QR','token_hash',repeat('0',64)));raise exception 'accepted';exception when others then if sqlerrm='accepted' then raise;end if;end;
 a=app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('method','QR','token_hash',f.hash));
 b=app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',f.gid,'method','MANUAL'));
 if a->>'id' is distinct from b->>'id' or (a->>'duplicate')::boolean or not (b->>'duplicate')::boolean then raise exception 'checkin not idempotent';end if;
 select count(*) into n from checkins where guest_id=f.gid;
 if n<>1 then raise exception 'RLS checkin visibility or duplicate failed';end if;
 if has_schema_privilege('authenticated','ceremonial_private','USAGE') or has_function_privilege('authenticated',(select oid from pg_proc where pronamespace=(select oid from pg_namespace where nspname='ceremonial_private') and proname='mutate_core'),'EXECUTE') then raise exception 'private RPC callable';end if;
end $$;
reset role;
DO $$declare f record;begin
 select * into f from ceremony_fixture;
 if (select status from rsvps where guest_id=f.gid)<>'CONFIRMED' or (select note from rsvps where guest_id=f.gid)<>E'Nota\nRSVP' then raise exception 'RSVP changed';end if;
 if (select count(*) from audit_logs where entity='checkins' and entity_id in(select id from checkins where guest_id=f.gid))<>1 then raise exception 'audit duplicated';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','cc000000-0000-4000-8000-000000000003',true);
DO $$begin
 if exists(select 1 from checkins) then raise exception 'unassigned role reads checkins';end if;
 begin perform app_mutate('00000000-0000-4000-8000-000000000001',gen_random_uuid(),'CHECKIN_CREATE',jsonb_build_object('guest_id',(select gid from ceremony_fixture),'method','MANUAL'));raise exception 'accepted';exception when others then if sqlerrm='accepted' then raise;end if;end;
end $$;
rollback;
select 'Ceremonial projection, RLS, QR validation, manual idempotency, audit and RSVP preservation passed.';
