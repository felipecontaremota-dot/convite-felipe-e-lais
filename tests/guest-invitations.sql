\set ON_ERROR_STOP on
begin;
create function pg_temp.guest_hash(t text) returns text language sql security definer set search_path=public,extensions,pg_temp as $$select encode(digest(t,'sha256'),'hex')$$;
create function pg_temp.has_receipt(m uuid) returns boolean language sql security definer set search_path=public,extensions,pg_temp as $$select exists(select 1 from mutation_receipts where mutation_id=m)$$;
create function pg_temp.assert_guest(v boolean,label text) returns void language plpgsql as $$begin if v is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
\set event '00000000-0000-4000-8000-000000000001'
\set admin '70707070-0000-4000-8000-000000000001'
\set guestuser '70707070-0000-4000-8000-000000000002'
\set staff '70707070-0000-4000-8000-000000000003'
insert into auth.users(id,is_anonymous) values(:'admin',false),(:'guestuser',true),(:'staff',false);
insert into user_roles(event_id,user_id,role) values(:'event',:'admin','ADMIN'),(:'event',:'staff','CEREMONIALIST');
set local role authenticated;
set local request.jwt.claim.sub=:'admin';
select admin_action(:'event','GUEST_CREATE','{"name":"Responsável","salutation":"MALE"}') as head \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Membro mulher","salutation":"FEMALE"}') as member \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Legado neutro"}') as legacy \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Membro extra"}') as extra \gset
select admin_action(:'event','GUEST_CREATE','{"name":"Individual fora"}') as outside \gset
select (:'head'::jsonb->>'id') as gh,(:'member'::jsonb->>'id') as gm,(:'legacy'::jsonb->>'id') as gl,(:'extra'::jsonb->>'id') as gx,(:'outside'::jsonb->>'id') as go,(:'outside'::jsonb->>'invitation_id') as io \gset
select admin_action(:'event','INVITATION_SAVE','{"name":"Família sete","pin":"1234"}') as family \gset
select (:'family'::jsonb->>'id') as familyid \gset
select admin_action(:'event','CODE_ROTATE',jsonb_build_object('id',:'familyid','version',1));
select admin_action(:'event','FAMILY_ADD_MEMBERS',jsonb_build_object('target_id',:'familyid','target_version',2,'guests',(select jsonb_agg(jsonb_build_object('id',g.id,'version',g.version,'invitation_version',i.version)) from guests g join invitations i on i.id=g.invitation_id where g.id in (:'gh',:'gm',:'gl',:'gx'))));
select admin_action(:'event','INVITATION_SAVE',jsonb_build_object('id',:'familyid','version',(select version from invitations where id=:'familyid'),'name','Família sete','active',true,'primary_guest_id',:'gh'));
select pg_temp.assert_guest((select salutation='NEUTRAL' from guests where id=:'gl'),'legacy guest gets neutral structured fallback');
select pg_temp.assert_guest((select salutation='FEMALE' from guests where id=:'gm'),'gender is stored independently of name');
reset role;
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values(:'event',:'guestuser',:'familyid',now());
insert into auth.users(id,is_anonymous) values('70707070-0000-4000-8000-000000000004',true);
insert into invitation_sessions(event_id,user_id,invitation_id,pin_verified_at) values(:'event','70707070-0000-4000-8000-000000000004',:'io',now());
set local role authenticated;
set local request.jwt.claim.sub=:'guestuser';
select pg_temp.assert_guest(current_guest(:'event') is null,'family access does not silently identify the head');
create function pg_temp.denied_ticket(e uuid,g uuid,f uuid) returns boolean language plpgsql as $$begin perform issue_ticket(e,g);return false;exception when others then return sqlerrm='unauthorized';end$$;
select pg_temp.assert_guest(not pg_temp.denied_ticket(:'event',:'gh',:'familyid'),'shared family access issues head QR without profile identification');
select identify_guest(:'event',:'gm');
create function pg_temp.denied_identity(e uuid,g uuid) returns boolean language plpgsql as $$begin perform identify_guest(e,g);return false;exception when others then return sqlerrm='unauthorized';end$$;
select pg_temp.assert_guest(pg_temp.denied_identity(:'event',:'go') and current_guest(:'event')=:'gm'::uuid,'cross-unit identity is rejected without changing the selected member');
select issue_ticket(:'event',:'gm') as memberticket \gset
select pg_temp.assert_guest(pg_temp.denied_ticket(:'event',:'go',:'familyid'),'family access cannot issue another unit QR');
create function pg_temp.denied_family(e uuid,f uuid) returns boolean language plpgsql as $$begin perform issue_family_ticket(e,f);return false;exception when others then return sqlerrm='unauthorized';end$$;
select pg_temp.assert_guest(pg_temp.denied_family(:'event',:'io'),'individual unit cannot be used as a family QR');
select pg_temp.assert_guest(jsonb_array_length(app_snapshot(:'event')->'credentials')=2 and jsonb_array_length(app_snapshot(:'event')->'family_credentials')=0,'family snapshot retains authorized head and member credentials regardless of profile selection');
select identify_guest(:'event',:'gh');
select issue_family_ticket(:'event',:'familyid') as familyticket \gset
select issue_ticket(:'event',:'gh',true) as headticket \gset
select issue_ticket(:'event',:'gl') as legacyticket \gset
select issue_ticket(:'event',:'gx') as extraticket \gset
select pg_temp.assert_guest(jsonb_array_length(app_snapshot(:'event')->'credentials')=4 and jsonb_array_length(app_snapshot(:'event')->'family_credentials')=1,'head sees family QR and all individual hashes');
select app_mutate(:'event','70707070-1000-4000-8000-000000000001','RSVP_UPDATE',jsonb_build_object('guest_id',:'gm','status','DECLINED'));
select app_mutate(:'event','70707070-1000-4000-8000-000000000002','RSVP_UPDATE',jsonb_build_object('guest_id',:'gl','status','MAYBE'));
select app_mutate(:'event','70707070-1000-4000-8000-000000000003','CONTACT_UPDATE',jsonb_build_object('guest_id',:'gh','email','','whatsapp','62999434778','notifications_revoked',true));
select pg_temp.assert_guest((select not consent_in_app and not consent_push and not consent_email and not consent_whatsapp and notifications_revoked from guest_contacts where guest_id=:'gh'),'opt-out revokes all channels canonically');
select app_mutate(:'event','70707070-1000-4000-8000-000000000004','CONTACT_UPDATE',jsonb_build_object('guest_id',:'gh','email','','whatsapp','62999434778','notifications_revoked',false));
select pg_temp.assert_guest((select consent_in_app and consent_push and consent_email and consent_whatsapp and not notifications_revoked and whatsapp='62999434778' from guest_contacts where guest_id=:'gh'),'explicit opt-in reactivation and phone round trip');
select issue_ticket(:'event',:'gm',true) as newmember \gset
select pg_temp.assert_guest((select count(*)=1 from jsonb_array_elements(app_snapshot(:'event')->'family_credentials') q where q->>'token_hash'=pg_temp.guest_hash(:'familyticket'::jsonb->>'token')),'individual regeneration does not revoke family QR');
select issue_family_ticket(:'event',:'familyid',true) as newfamily \gset
select pg_temp.assert_guest((select count(*)=1 from jsonb_array_elements(app_snapshot(:'event')->'credentials') q where q->>'guest_id'=:'gm' and q->>'token_hash'=pg_temp.guest_hash(:'newmember'::jsonb->>'token')),'family regeneration does not revoke individual QR');
set local request.jwt.claim.sub=:'staff';
select pg_temp.assert_guest((select count(*)=4 from jsonb_array_elements(app_snapshot(:'event')->'guests') g where g->>'id' in (:'gh',:'gm',:'gl',:'gx')),'real ceremonial snapshot includes pending, maybe and declined family members');
select pg_temp.assert_guest((select count(*)=2 from jsonb_array_elements(app_snapshot(:'event')->'rsvps') r where r->>'guest_id' in (:'gm',:'gl') and r->>'status' in ('DECLINED','MAYBE') and r->>'note'='' and r->>'dietary'=''),'ceremonial RSVP projection includes non-confirmed states without private notes');
create function pg_temp.invalid_qr(e uuid,t text) returns boolean language plpgsql as $$begin perform resolve_checkin_ticket(e,t);return false;exception when others then return sqlerrm='invalid QR';end$$;
select pg_temp.assert_guest(pg_temp.invalid_qr(:'event',:'memberticket'::jsonb->>'token'),'old individual token invalid immediately');
select pg_temp.assert_guest(pg_temp.invalid_qr(:'event',:'familyticket'::jsonb->>'token'),'old family token invalid immediately');
select pg_temp.assert_guest(jsonb_array_length(resolve_checkin_ticket(:'event',:'newfamily'::jsonb->>'token')->'guests')=4,'family scanner contract provides four eligible members regardless of RSVP');
create function pg_temp.reject_family_selection(e uuid,t text,g uuid) returns boolean language plpgsql as $$begin perform app_mutate(e,'70707070-1000-4000-8000-000000000099','CHECKIN_FAMILY',jsonb_build_object('guest_ids',jsonb_build_array(g),'token_hash',t));return false;exception when others then return sqlerrm='invalid selected members';end$$;
select pg_temp.assert_guest(pg_temp.reject_family_selection(:'event',pg_temp.guest_hash(:'newfamily'::jsonb->>'token'),:'go'),'family QR cannot check in another access unit');
select pg_temp.assert_guest(not pg_temp.has_receipt('70707070-1000-4000-8000-000000000099'),'rejected family selection rolls back receipt');
select app_mutate(:'event','70707070-1000-4000-8000-000000000005','CHECKIN_CREATE',jsonb_build_object('guest_id',:'gm','method','QR','token_hash',pg_temp.guest_hash(:'newmember'::jsonb->>'token')));
select app_mutate(:'event','70707070-1000-4000-8000-000000000006','CHECKIN_CREATE',jsonb_build_object('guest_id',:'gm','method','QR','token_hash',pg_temp.guest_hash(:'newmember'::jsonb->>'token')));
select app_mutate(:'event','70707070-1000-4000-8000-000000000007','CHECKIN_FAMILY',jsonb_build_object('method','QR','guest_ids',jsonb_build_array(:'gh',:'gl'),'token_hash',pg_temp.guest_hash(:'newfamily'::jsonb->>'token')));
select pg_temp.assert_guest((app_mutate(:'event','70707070-1000-4000-8000-000000000007','CHECKIN_FAMILY','{}')->>'duplicate')::boolean,'committed family retry precedes mutable revalidation');
reset role;
select pg_temp.assert_guest((select count(*)=3 from checkins where guest_id in (:'gh',:'gm',:'gl',:'gx')),'partial family check-in leaves unselected member untouched');
select pg_temp.assert_guest((select status='DECLINED' from rsvps where guest_id=:'gm') and (select status='MAYBE' from rsvps where guest_id=:'gl'),'real attendance never changes RSVP');
select pg_temp.assert_guest((select count(*)=1 from guest_checkin_notices where recipient_guest_id=:'gh'),'repeated individual check-in creates exactly one notice');
set local role authenticated;
set local request.jwt.claim.sub=:'guestuser';
select pg_temp.assert_guest(app_snapshot(:'event')->'checkin_notices'->0->>'content'='Membro mulher acabou de confirmar presença','head sees check-in notice');
select identify_guest(:'event',:'gm');
select pg_temp.assert_guest(jsonb_array_length(app_snapshot(:'event')->'checkin_notices')=0,'ordinary member does not see head notice');
set local request.jwt.claim.sub=:'admin';
set local role authenticated;
select admin_action(:'event','INVITATION_SAVE',jsonb_build_object('id',:'familyid','version',(select version from invitations where id=:'familyid'),'name','Família sete','active',true,'primary_guest_id',:'gm'));
select pg_temp.assert_guest((select primary_guest_id=:'gm'::uuid from invitations where id=:'familyid'),'responsibility can transfer without recreating family');
create function pg_temp.reject_head(e uuid,f uuid,g uuid) returns boolean language plpgsql as $$begin update invitations set primary_guest_id=g where event_id=e and id=f;set constraints all immediate;return false;exception when others then return sqlerrm='invalid family head';end$$;
-- Run as the migration/test owner to assert the database constraint independently of RPC authorization.
reset role;
select pg_temp.assert_guest(pg_temp.reject_head(:'event',:'familyid',:'go'),'database rejects a head from another unit');
set local role authenticated;
set local request.jwt.claim.sub='70707070-0000-4000-8000-000000000004';
select pg_temp.assert_guest(current_guest(:'event')=:'go'::uuid,'individual identity is automatic before any Profile choice');
select pg_temp.assert_guest(jsonb_array_length(app_snapshot(:'event')->'ticket_guest_ids')=1 and app_snapshot(:'event')->'ticket_guest_ids' ? :'go' and jsonb_array_length(app_snapshot(:'event')->'family_ticket_invitation_ids')=0,'individual snapshot authorizes only the titular and no family');
select issue_ticket(:'event',:'go');
select pg_temp.assert_guest(pg_temp.denied_ticket(:'event',:'gh',:'familyid'),'individual cannot issue a QR of another unit');
select pg_temp.assert_guest(pg_temp.denied_family(:'event',:'familyid'),'individual cannot issue another family QR');
select identify_guest(:'event',:'go');
select identify_guest(:'event',:'go');
select pg_temp.assert_guest(pg_temp.denied_identity(:'event',:'gh') and current_guest(:'event')=:'go'::uuid,'individual cannot identify as another unit member');
reset role;
rollback;
\echo Guest invitation regression passed: session identity, structured gender/head, opt-out, independent QR rotation, partial/idempotent check-in and RSVP isolation.
