\set ON_ERROR_STOP on
create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'ASSERTION: %',label;end if;end$$;
-- Before any post-upgrade mutation, compare ALL event tables byte-for-byte in JSON.
do $$declare t record; rows jsonb;begin
 for t in select * from profile_upgrade_rows loop
  execute format('select coalesce(jsonb_agg(%s order by %s::text),''[]''::jsonb) from %I x where event_id=$1',case when t.table_name='guest_contacts' then '(to_jsonb(x)-''communications_revoked'')' when t.table_name='notification_jobs' then '(to_jsonb(x)-''delivery_started_at'')' else 'to_jsonb(x)' end,case when t.table_name='guest_contacts' then '(to_jsonb(x)-''communications_revoked'')' when t.table_name='notification_jobs' then '(to_jsonb(x)-''delivery_started_at'')' else 'to_jsonb(x)' end,t.table_name) into rows using 'fefe0000-2000-4000-8000-000000000003'::uuid;
  if rows is distinct from t.original then raise exception '008 changed existing data in %',t.table_name;end if;
 end loop;
 if exists(select 1 from notification_jobs where delivery_started_at is not null) then raise exception '008 admitted a preexisting job';end if;
 if exists(select 1 from guest_contacts where communications_revoked) then raise exception '008 unexpectedly revoked existing permissions';end if;
end$$;
-- Public contracts retain role privileges; private aliases retain the exact old body/signature.
do $$declare f record; current_oid oid; alias_oid oid;begin
 for f in select * from profile_upgrade_privileges loop
  current_oid=case when f.proname='app_mutate' then 'app_mutate(uuid,uuid,text,jsonb)'::regprocedure else 'app_snapshot(uuid)'::regprocedure end;
  alias_oid=case when f.proname='app_mutate' then 'internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure else 'internal_snapshot_core(uuid)'::regprocedure end;
  if has_function_privilege(f.rolname,current_oid,'EXECUTE') is distinct from f.allowed then raise exception 'EXECUTE changed for % / %',f.proname,f.rolname;end if;
  if not exists(select 1 from pg_proc where oid=current_oid and proargnames=f.proargnames and proargtypes=f.proargtypes and prorettype=f.prorettype and prosecdef=f.prosecdef and proconfig=f.proconfig) then raise exception 'public RPC contract changed for %',f.proname;end if;
  if alias_oid<>f.oid or not exists(select 1 from pg_proc where oid=alias_oid and prosrc=f.prosrc and proargnames=f.proargnames and proargtypes=f.proargtypes and prorettype=f.prorettype) then raise exception 'renamed implementation changed for %',f.proname;end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r where n.nspname='public' and p.proname ~ '^app_(mutate|snapshot)_v[0-9]+$' and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,p.oid,'EXECUTE')) then raise exception 'private versioned implementation exposed';end if;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid in ('app_mutate(uuid,uuid,text,jsonb)'::regprocedure,'app_snapshot(uuid)'::regprocedure,'internal_mutation_core(uuid,uuid,text,jsonb)'::regprocedure,'internal_snapshot_core(uuid)'::regprocedure) and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC EXECUTE exposed';end if;
end$$;
select pg_temp.assert_true((select array_agg(enumlabel::text order by enumsortorder)=array['PENDING','CONFIRMED','DECLINED'] from pg_enum where enumtypid='rsvp_status'::regtype),'only the three established RSVP states');
select * from profile_upgrade_context \gset
-- Every actor's snapshot remains identical except the new contact boolean.
grant select on profile_upgrade_snapshots to authenticated;
set role authenticated;
do $$declare s record; actual jsonb;begin
 for s in select * from profile_upgrade_snapshots loop
  perform set_config('request.jwt.claim.sub',s.actor::text,false);
  actual=app_snapshot('fefe0000-2000-4000-8000-000000000003');
  actual=jsonb_set(actual,'{contacts}',coalesce((select jsonb_agg(c-'communications_revoked') from jsonb_array_elements(actual->'contacts') c),'[]'::jsonb));
  perform pg_temp.assert_true(actual=s.original,'unchanged public snapshot contract for actor '||s.actor);
 end loop;
end$$;
set request.jwt.claim.sub=:'family_device';
select pg_temp.assert_true(event_role(:'event')='GUEST' and jsonb_array_length(app_snapshot(:'event')->'guests')=2,'existing FAMILY session without identify_guest');
select pg_temp.assert_true(exists(select 1 from jsonb_array_elements(app_snapshot(:'event')->'credentials') c where c->>'guest_id'=:'ga'),'existing QR credential remains visible');
-- Retrying the original committed administrative send retains the message ID.
set request.jwt.claim.sub=:'admin';
select pg_temp.assert_true(event_role(:'event')='ADMIN','administrative access preserved');
select pg_temp.assert_true(app_mutate(:'event','fefe0000-2000-4000-8000-000000000020','MESSAGE_SEND_TO_GUESTS','{"content":"altered retry"}')->>'id'=:'message_id','delegated message receipt retains committed ID');
select pg_temp.assert_true((select count(*)=1 from messages where id=:'message_id'::uuid),'retry does not duplicate message');
select admin_action(:'event','INVITATION_SAVE','{"name":"Nova família após upgrade","pin":"0199"}') as new_family \gset
select admin_action(:'event','INVITATION_SAVE',jsonb_build_object('id',(:'new_family'::jsonb)->>'id','version',1,'name','Família editada','active',true));
select pg_temp.assert_true((select name='Família editada' from invitations where id=((:'new_family'::jsonb)->>'id')::uuid),'family create/edit via real admin RPC');
select admin_action(:'event','GUEST_CREATE','{"name":"Nova pessoa após upgrade","whatsapp":"62999990047"}') as new_guest \gset
select admin_action(:'event','GUEST_UPDATE',jsonb_build_object('id',(:'new_guest'::jsonb)->>'id','version',1,'name','Pessoa editada','email','edited@example.test','whatsapp','62999990047'));
select pg_temp.assert_true((select name='Pessoa editada' from guests where id=((:'new_guest'::jsonb)->>'id')::uuid),'guest create/edit via real admin RPC');
select app_mutate(:'event',gen_random_uuid(),'MESSAGE_SEND_TO_GUESTS',jsonb_build_object('content','Após upgrade','channels','["IN_APP","EMAIL"]'::jsonb,'recipient_guest_ids',jsonb_build_array(:'gc'))) as new_message \gset
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'guests')=4,'admin dashboard loads new and existing guests');
reset role;
-- service_role execution really works, without bypassing application authorization.
set role service_role;
set request.jwt.claim.sub=:'admin';
select pg_temp.assert_true(app_snapshot(:'event')->>'role'='ADMIN','service_role snapshot EXECUTE retained');
select pg_temp.assert_true((app_mutate(:'event','fefe0000-2000-4000-8000-000000000020','MESSAGE_SEND_TO_GUESTS','{}')->>'duplicate')::boolean,'service_role mutation EXECUTE retained');
select pg_temp.assert_true(not redeem_invitation(:'event',:'family_device',:'family_code','9999','upgrade-wrong'),'existing link rejects wrong PIN');
select pg_temp.assert_true(redeem_invitation(:'event',:'family_device',:'family_code','0047','upgrade-family'),'old FAMILY link/PIN still opens');
select pg_temp.assert_true(redeem_invitation(:'event',:'individual_device',:'individual_code','0047','upgrade-individual'),'old INDIVIDUAL link/PIN still opens');
set request.jwt.claim.sub='';
do $$begin
 perform app_mutate('fefe0000-2000-4000-8000-000000000003',gen_random_uuid(),'RSVP_UPDATE','{}');raise exception 'service_role bypassed authorization';
 exception when others then if sqlerrm<>'unauthorized' then raise;end if;end$$;
select pg_temp.assert_true(app_snapshot(:'event')->'role'='null'::jsonb,'service_role without JWT does not gain ADMIN');
reset role;
set role authenticated;
set request.jwt.claim.sub=:'individual_device';
select pg_temp.assert_true(jsonb_array_length(app_snapshot(:'event')->'guests')=1,'INDIVIDUAL isolation without identify_guest');
select pg_temp.assert_true(exists(select 1 from messages where id=((:'new_message'::jsonb)->>'id')::uuid),'administrative message readable by its recipient');
-- All RSVP edits run through the new public wrapper into the old implementation.
select set_config('upgrade.guest',:'gc',false);
do $$declare next_status text; original_id uuid;begin
 select id into original_id from rsvps where guest_id=current_setting('upgrade.guest')::uuid;
 foreach next_status in array array['CONFIRMED','DECLINED','PENDING','CONFIRMED'] loop
  perform app_mutate('fefe0000-2000-4000-8000-000000000003',gen_random_uuid(),'RSVP_UPDATE',jsonb_build_object('guest_id',current_setting('upgrade.guest'),'status',next_status,'note','Editada'));
  perform pg_temp.assert_true((select count(*)=1 and bool_and(id=original_id and rsvps.status::text=next_status and responded_at is not null) from rsvps where guest_id=current_setting('upgrade.guest')::uuid),'RSVP transition after 008: '||next_status);
 end loop;
end$$;
select issue_ticket(:'event',:'gc') as new_ticket \gset
select pg_temp.assert_true(length((:'new_ticket'::jsonb)->>'token')=64,'new QR issuance through real RPC');
reset role;
select pg_temp.assert_true((select token_hash=encode(extensions.digest(:'ticket','sha256'),'hex') and revoked_at is null from qr_credentials where guest_id=:'ga'),'original QR token not rotated by migration or new issuance');
select pg_temp.assert_true((select sharing_code=:'family_code' and pin='0047' from invitation_access where invitation_id=:'fid'),'QR generation preserves family link and PIN');
select pg_temp.assert_true((select sharing_code=:'individual_code' and pin='0047' from invitation_access where invitation_id=:'iid'),'QR generation preserves individual link and PIN');
select pg_temp.assert_true((select count(*) from audit_logs where event_id=:'event' and action='CODE_ROTATE')=(select count(*) from profile_upgrade_rows t cross join lateral jsonb_array_elements(t.original) r where t.table_name='audit_logs' and r->>'action'='CODE_ROTATE'),'no automatic CODE_ROTATE during upgrade, RSVP, snapshot or QR');
-- Actual DB replay of an offline sequence, including a lost response and new session read.
set role authenticated;
set request.jwt.claim.sub=:'family_device';
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000030','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','whatsapp','(62) 9 1234-5678','communications_revoked',true));
select pg_temp.assert_true((select communications_revoked and consent_in_app and not consent_email and consent_push and consent_whatsapp and whatsapp='62912345678' from guest_contacts where guest_id=:'ga'),'revocation preserves exact earlier consent and edits phone');
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000031','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','whatsapp','62912345678','communications_revoked',false));
select pg_temp.assert_true((app_mutate(:'event','fefe0000-2000-4000-8000-000000000030','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','communications_revoked',true))->>'duplicate')::boolean,'lost-response replay recognized as duplicate');
reset role;
set role authenticated;
set request.jwt.claim.sub=:'family_device';
select pg_temp.assert_true((select not communications_revoked and consent_in_app and not consent_email and consent_push and consent_whatsapp from guest_contacts where guest_id=:'ga'),'new session/reload reads restored earlier authorization, never reapplies queued duplicate');
reset role;
select pg_temp.assert_true((select count(*)=2 from mutation_receipts where event_id=:'event' and mutation_id in ('fefe0000-2000-4000-8000-000000000030','fefe0000-2000-4000-8000-000000000031')),'exactly two operations persisted, no duplicated offline replay');
-- Existing pre-008 shared family must obey the same direct RLS and snapshot rule.
set role authenticated;
set request.jwt.claim.sub=:'family_device';
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000032','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','communications_revoked',true));
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000033','CONTACT_UPDATE',jsonb_build_object('guest_id',:'gb','communications_revoked',true));
select pg_temp.assert_true((select count(*)=0 from announcements where event_id=:'event') and jsonb_array_length(app_snapshot(:'event')->'announcements')=0,'preexisting family all revoked: direct RLS and snapshot deny announcements');
set request.jwt.claim.sub=:'admin';
select pg_temp.assert_true((select count(*)>0 from announcements where event_id=:'event'),'preexisting family revoked: ADMIN retains direct access');
set request.jwt.claim.sub=:'family_device';
select app_mutate(:'event','fefe0000-2000-4000-8000-000000000034','CONTACT_UPDATE',jsonb_build_object('guest_id',:'ga','communications_revoked',false));
select pg_temp.assert_true((select count(*)>0 from announcements where event_id=:'event') and (select count(*) from announcements where event_id=:'event')=jsonb_array_length(app_snapshot(:'event')->'announcements'),'preexisting family one authorized member: direct RLS and snapshot restored');
reset role;
\echo '007 -> 008 audit passed: all event rows, RPC ACL/contracts/private wrappers, real admin/guest operations, links/PIN/session/QR, RSVP, messages and replay.'
