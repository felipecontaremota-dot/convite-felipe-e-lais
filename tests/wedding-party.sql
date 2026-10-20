\set ON_ERROR_STOP on
begin;
create function pg_temp.party_assert(v boolean,msg text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'party test: %',msg;end if;end$$;
create function pg_temp.party_reject(q text) returns void language plpgsql as $$begin execute q;raise exception 'unexpected party success';exception when others then if sqlerrm='unexpected party success' then raise;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin 'eeeeaaaa-0000-4000-8000-000000000001'
\set a 'eeeeaaaa-0000-4000-8000-000000000002'
\set b 'eeeeaaaa-0000-4000-8000-000000000003'
\set c 'eeeeaaaa-0000-4000-8000-000000000004'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'a',true),(:'b',true),(:'c',true);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN');
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Party promoted person","whatsapp":"62988881111"}') as first_guest \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Party ordinary member","whatsapp":"62988882222"}') as other_guest \gset
select (:'first_guest'::jsonb->>'id') as gid,(:'other_guest'::jsonb->>'id') as other \gset
select admin_action(:'event','INVITATION_SAVE','{"name":"Party test family","pin":"8811"}') as family \gset
select (:'family'::jsonb->>'id') as fid \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'fid','version',1));
select admin_action(:'event','FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'fid','target_version',2,'guests',(select jsonb_agg(jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version)) from guests g join invitations i on i.id=g.invitation_id where g.id in (:'gid'::uuid,:'other'::uuid))));
update guests set profile_confirmed_at=now() where id in (:'gid'::uuid,:'other'::uuid);
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at,profile_guest_id) values(:'event',:'a',:'fid',now(),:'gid'),(:'event',:'b',:'fid',now(),:'gid'),(:'event',:'c',:'fid',now(),:'other');
create temp table party_before_rsvp as select * from rsvps where guest_id in (:'gid'::uuid,:'other'::uuid);
create temp table party_before_access as select i.id,i.code_hash,a.pin,a.sharing_code from invitations i join invitation_access a on a.invitation_id=i.id where i.id=:'fid';
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_set(:'event',:'gid','PADRINHO',null) as promotion \gset
select (:'promotion'::jsonb->>'cycle_id') as cycle \gset
select pg_temp.party_assert(:'promotion'::jsonb->>'role'='PADRINHO','male promotion');
select pg_temp.party_assert(wedding_party_admin_set(:'event',:'gid','PADRINHO',:'cycle')->>'cycle_id'=:'cycle','same classification is not a new cycle');
select pg_temp.party_reject(format('select wedding_party_admin_set(%L,%L,%L,null)',:'event',:'gid','MADRINHA'));
set local request.jwt.claim.sub=:'a';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'cycle_id'=:'cycle','selected promoted person sees cycle');
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'completed_at' is null,'opening state does not complete');
select pg_temp.party_reject(format('select wedding_party_respond(%L,%L,%L)',:'event',:'cycle','COMPLETE'));
select pg_temp.party_reject(format('select wedding_party_admin_get(%L,%L)',:'event',:'gid'));
select pg_temp.party_reject(format('select wedding_party_admin_set(%L,%L,%L,%L)',:'event',:'gid','MADRINHA',:'cycle'));
select pg_temp.party_reject('select * from wedding_party_private.promotions');
select wedding_party_respond(:'event',:'cycle','ACCEPT') as accepted \gset
select pg_temp.party_assert(wedding_party_respond(:'event',:'cycle','ACCEPT')->'promotion'->>'accepted_at'=(:'accepted'::jsonb->'promotion'->>'accepted_at'),'acceptance is idempotent');
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'completed_at' is null,'acceptance alone does not mark viewing complete');
set local request.jwt.claim.sub=:'b';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'accepted_at'=(:'accepted'::jsonb->'promotion'->>'accepted_at'),'second device shares acceptance');
select wedding_party_respond(:'event',:'cycle','COMPLETE') as completed \gset
select pg_temp.party_assert(wedding_party_respond(:'event',:'cycle','COMPLETE')->'promotion'->>'completed_at'=(:'completed'::jsonb->'promotion'->>'completed_at'),'completion is idempotent');
set local request.jwt.claim.sub=:'c';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'='null'::jsonb,'ordinary member of same family is not automatically promoted');
select pg_temp.party_reject(format('select wedding_party_respond(%L,%L,%L)',:'event',:'cycle','ACCEPT'));
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_set(:'event',:'gid',null,:'cycle');
set local request.jwt.claim.sub=:'a';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'='null'::jsonb,'revocation immediate in backend');
select pg_temp.party_reject(format('select wedding_party_respond(%L,%L,%L)',:'event',:'cycle','ACCEPT'));
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_set(:'event',:'gid','MADRINHA',null) as renewed \gset
select pg_temp.party_assert(:'renewed'::jsonb->>'cycle_id'<>:'cycle' and :'renewed'::jsonb->>'accepted_at' is null and :'renewed'::jsonb->>'completed_at' is null,'female promotion gets fresh cycle and viewing');
set local request.jwt.claim.sub=:'a';
select pg_temp.party_reject(format('select wedding_party_respond(%L,%L,%L)',:'event',:'cycle','COMPLETE'));
select pg_temp.party_assert(wedding_party_state('eeeeaaaa-9999-4000-8000-000000000001')->'promotion'='null'::jsonb,'event isolation');
reset role;
update invitations set active=false where id=:'fid';
set local role authenticated;
set local request.jwt.claim.sub=:'a';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'='null'::jsonb,'inactive invitation blocked');
reset role;
select pg_temp.party_assert(not has_function_privilege('anon','public.wedding_party_respond(uuid,uuid,text)','EXECUTE'),'anonymous role cannot execute');
select pg_temp.party_assert(not has_function_privilege('authenticated','wedding_party_private.actor(uuid)','EXECUTE'),'actor helper private');
select pg_temp.party_assert((select jsonb_agg(to_jsonb(r) order by guest_id) from rsvps r where guest_id in (:'gid'::uuid,:'other'::uuid))=(select jsonb_agg(to_jsonb(r) order by guest_id) from party_before_rsvp r),'RSVP unchanged');
select pg_temp.party_assert(not exists(select 1 from party_before_access b join invitations i on i.id=b.id join invitation_access a on a.invitation_id=i.id where b.code_hash is distinct from i.code_hash or b.pin is distinct from a.pin or b.sharing_code is distinct from a.sharing_code),'credentials unchanged');

set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_get(:'event',:'gid') as message_cycle \gset
select (:'message_cycle'::jsonb->>'cycle_id') as mcycle \gset
select wedding_party_admin_save_details(:'event',:'gid','MADRINHA',:'mcycle','',null,'Minha amiga',null) as legacy_named \gset
select pg_temp.party_assert(:'legacy_named'::jsonb->>'personal_message' is null,'legacy null message preserved by nickname-only edit');
select wedding_party_admin_save_details(:'event',:'gid','MADRINHA',:'mcycle','',null,'','Minha amiga');
select wedding_party_admin_save(:'event',:'gid','MADRINHA',:'mcycle',E'Primeiro\nlinha\n\nSegundo <script>texto seguro</script>',null) as saved_message \gset
select pg_temp.party_assert(:'saved_message'::jsonb->>'cycle_id'=:'mcycle','message does not recreate cycle');
select pg_temp.party_assert(:'saved_message'::jsonb->>'personal_message'=E'Primeiro\nlinha\n\nSegundo <script>texto seguro</script>','newlines preserved literally');
select pg_temp.party_reject(format('select wedding_party_admin_save(%L,%L,%L,%L,%L,null)',:'event',:'gid','MADRINHA',:'mcycle','stale edit'));
select pg_temp.party_reject(format('select wedding_party_admin_save(%L,%L,%L,%L,%L,%L)',:'event',:'gid','PADRINHO',:'mcycle','gender change',:'saved_message'::jsonb->>'personal_message'));
select pg_temp.party_reject(format('select wedding_party_admin_save(%L,%L,%L,%L,%L,%L)',:'event',:'gid','MADRINHA',:'mcycle','   ',:'saved_message'::jsonb->>'personal_message'));
select pg_temp.party_reject(format('select wedding_party_admin_save(%L,%L,%L,%L,%L,%L)',:'event',:'gid','MADRINHA',:'mcycle',E'\n\t',:'saved_message'::jsonb->>'personal_message'));
select wedding_party_admin_save(:'event',:'gid','MADRINHA',:'mcycle','Mensagem editada',:'saved_message'::jsonb->>'personal_message');
select pg_temp.party_assert(wedding_party_admin_get(:'event',:'other') is null,'no other person promoted or modified');
reset role;
update invitations set active=true where id=:'fid';
set local role authenticated;
set local request.jwt.claim.sub=:'a';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'personal_message'='Mensagem editada','only selected guest reads personal message');
select pg_temp.party_reject(format('select wedding_party_admin_save(%L,%L,%L,%L,%L,%L)',:'event',:'gid','MADRINHA',:'mcycle','guest edit','Mensagem editada'));
select wedding_party_respond(:'event',:'mcycle','ACCEPT');
select wedding_party_respond(:'event',:'mcycle','COMPLETE') as message_completed \gset
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_save(:'event',:'gid','MADRINHA',:'mcycle','Após conclusão','Mensagem editada');
set local request.jwt.claim.sub=:'a';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'completed_at'=(:'message_completed'::jsonb->'promotion'->>'completed_at'),'editing after completion does not replay');
set local request.jwt.claim.sub=:'c';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'='null'::jsonb,'same family member cannot read another message');
reset role;
select pg_temp.party_assert(not has_function_privilege('anon','public.wedding_party_admin_save(uuid,uuid,text,uuid,text,text)','EXECUTE'),'anonymous save denied');

-- No hardcoded identity treatment or automatic backfill; optional text is private.
update guests set name='Amanda Curcio Cariolano Romão Medina' where id=:'gid';
set local role authenticated;
set local request.jwt.claim.sub=:'a';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'display_name' is null,'existing guest has no automatic treatment');
select pg_temp.party_reject(format('select wedding_party_admin_save_details(%L,%L,%L,%L,%L,%L,%L,null)',:'event',:'gid','MADRINHA',:'mcycle','Após conclusão','Após conclusão','Guest edit'));
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_save_details(:'event',:'gid','MADRINHA',:'mcycle','Após conclusão','Após conclusão','  Minha querida amiga  ',null) as named \gset
select pg_temp.party_assert(:'named'::jsonb->>'display_name'='Minha querida amiga','compound nickname trimmed');
select pg_temp.party_assert(:'named'::jsonb->>'cycle_id'=:'mcycle' and :'named'::jsonb->>'completed_at'=(:'message_completed'::jsonb->'promotion'->>'completed_at'),'nickname does not restart completed cycle');
select pg_temp.party_reject(format('select wedding_party_admin_save_details(%L,%L,%L,%L,%L,%L,%L,null)',:'event',:'gid','MADRINHA',:'mcycle','Stale write','Após conclusão','Other'));
select pg_temp.party_reject(format('select wedding_party_admin_save_details(%L,%L,%L,%L,%L,%L,%L,%L)',:'event',:'gid','MADRINHA',:'mcycle','Após conclusão','Após conclusão',repeat('x',101),'Minha querida amiga'));
select pg_temp.party_reject(format('select wedding_party_admin_save_details(%L,%L,%L,%L,%L,%L,%L,%L)',:'event',:'gid','MADRINHA',:'mcycle','Após conclusão','Após conclusão',E'Invalid\nname','Minha querida amiga'));
select pg_temp.party_reject(format('select wedding_party_admin_save_details(%L,%L,%L,%L,%L,%L,%L,%L)','eeeeaaaa-9999-4000-8000-000000000001',:'gid','MADRINHA',:'mcycle','Após conclusão','Após conclusão','Other event','Minha querida amiga'));
select wedding_party_admin_save_details(:'event',:'gid','MADRINHA',:'mcycle','Após conclusão','Após conclusão','<b>Amiga</b>','Minha querida amiga');
set local request.jwt.claim.sub=:'a';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'display_name'='<b>Amiga</b>','nickname returned as literal text');
set local request.jwt.claim.sub=:'b';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'display_name'='<b>Amiga</b>','second device reads persisted nickname');
set local request.jwt.claim.sub=:'c';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'='null'::jsonb,'other family member cannot read nickname');
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_save_details(:'event',:'gid','MADRINHA',:'mcycle','Após conclusão','Após conclusão','   ','<b>Amiga</b>') as cleared \gset
select pg_temp.party_assert(:'cleared'::jsonb->>'display_name' is null and :'cleared'::jsonb->>'personal_message'='Após conclusão','clearing nickname preserves message');
select pg_temp.party_assert(:'cleared'::jsonb->>'accepted_at'=(:'message_completed'::jsonb->'promotion'->>'accepted_at') and :'cleared'::jsonb->>'completed_at'=(:'message_completed'::jsonb->'promotion'->>'completed_at'),'clearing preserves acceptance and completion');
reset role;
select pg_temp.party_assert(not has_function_privilege('anon','public.wedding_party_admin_save_details(uuid,uuid,text,uuid,text,text,text,text)','EXECUTE'),'anonymous details edit denied');
select pg_temp.party_assert(not has_function_privilege('service_role','public.wedding_party_admin_save_details(uuid,uuid,text,uuid,text,text,text,text)','EXECUTE'),'service bypass not exposed');

set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_save(:'event',:'other','PADRINHO',null,'Mensagem exclusiva da outra pessoa',null);
select pg_temp.party_reject(format('select wedding_party_admin_save(%L,%L,%L,%L,%L,%L)',:'event',:'gid','MADRINHA',:'mcycle',repeat('x',12001),'Após conclusão'));
select pg_temp.party_reject(format('select wedding_party_admin_save(%L,%L,%L,null,%L,null)','eeeeaaaa-9999-4000-8000-000000000001',:'gid','PADRINHO','Outro evento'));
set local request.jwt.claim.sub=:'a';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'personal_message'='Após conclusão','promoted person A receives only own message');
set local request.jwt.claim.sub=:'c';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'personal_message'='Mensagem exclusiva da outra pessoa','promoted person B receives only own message');
set local request.jwt.claim.sub=:'admin';
select wedding_party_admin_save(:'event',:'gid','MADRINHA',:'mcycle','Somente a primeira pessoa','Após conclusão');
set local request.jwt.claim.sub=:'c';
select pg_temp.party_assert(wedding_party_state(:'event')->'promotion'->>'personal_message'='Mensagem exclusiva da outra pessoa','editing A leaves B message intact');
reset role;
rollback;
\echo Party lifecycle, family identity, two devices, grants, revocation, isolation and RSVP independence passed.
