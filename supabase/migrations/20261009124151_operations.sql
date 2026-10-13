create function admin_action(p_event uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare eid uuid:=(p_payload->>'id')::uuid;target uuid;gid uuid;code text;v integer;inv invitations;old_guest guests;
begin
 if event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 if p_action in ('INVITATION_SAVE','INVITATION_DISABLE','CODE_ROTATE','CODE_BLOCK','FAMILY_MERGE','FAMILY_SPLIT') and eid is not null then
 select * into inv from invitations where event_id=p_event and id=eid for update;
 if not found then raise exception 'not found';end if;
 if inv.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 end if;
 case p_action
 when 'INVITATION_SAVE' then
 if eid is null then insert into invitations(event_id,name) values(p_event,trim(p_payload->>'name'));
 else
 gid=(p_payload->>'primary_guest_id')::uuid;
 if gid is not null and not exists(select 1 from guests where event_id=p_event and id=gid and invitation_id=eid) then raise exception 'invalid primary';end if;
 update invitations set name=trim(p_payload->>'name'),active=(p_payload->>'active')::boolean,primary_guest_id=gid,version=version+1 where id=eid;
 if not (p_payload->>'active')::boolean then delete from invitation_sessions where event_id=p_event and invitation_id=eid;end if;
 end if;
 when 'INVITATION_DISABLE' then update invitations set active=false,code_hash=null,version=version+1 where id=eid;delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 when 'CODE_ROTATE' then
 if not inv.active then raise exception 'inactive';end if;
 code=encode(gen_random_bytes(24),'hex');update invitations set code_hash=encode(digest(code,'sha256'),'hex'),version=version+1 where id=eid;
 delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 return jsonb_build_object('code',code);
 when 'CODE_BLOCK' then update invitations set code_hash=null,version=version+1 where id=eid;delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 when 'GUEST_SAVE' then
 target=(p_payload->>'invitation_id')::uuid;
 perform 1 from invitations where event_id=p_event and id=target and active for update;if not found then raise exception 'invalid invitation';end if;
 gid=(p_payload->>'companion_of')::uuid;
 if gid is not null and (gid=eid or not exists(select 1 from guests where id=gid and event_id=p_event and invitation_id=target)) then raise exception 'invalid companion';end if;
 if eid is null then
 insert into guests(event_id,invitation_id,name,group_label,companion_of) values(p_event,target,trim(p_payload->>'name'),coalesce(p_payload->>'group_label',''),gid) returning id into eid;
 insert into rsvps(event_id,guest_id) values(p_event,eid);
 else
 select * into old_guest from guests where id=eid and event_id=p_event for update;if not found then raise exception 'not found';end if;
 if old_guest.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 update invitations set primary_guest_id=null,version=version+1 where event_id=p_event and primary_guest_id=eid and id<>target;
 update guests set companion_of=null where event_id=p_event and companion_of=eid and invitation_id<>target;
 update guests set name=trim(p_payload->>'name'),group_label=coalesce(p_payload->>'group_label',''),invitation_id=target,companion_of=gid,version=version+1 where id=eid and event_id=p_event;
 if old_guest.invitation_id<>target then
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id=eid and revoked_at is null;
 delete from invitation_sessions where event_id=p_event and invitation_id in (old_guest.invitation_id,target);
 end if;
 end if;
 when 'GUEST_REMOVE' then
 select * into old_guest from guests where event_id=p_event and id=eid for update;if not found then raise exception 'not found';end if;
 if old_guest.version is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 update invitations set primary_guest_id=null,version=version+1 where event_id=p_event and primary_guest_id=eid;
 update guests set companion_of=null where event_id=p_event and companion_of=eid;
 delete from guests where id=eid and event_id=p_event;
 -- A removed record never causes automatic deletion of the corresponding sheet row.
 when 'FAMILY_MERGE' then
 target=(p_payload->>'target_id')::uuid;
 if target=eid then raise exception 'invalid merge';end if;
 perform 1 from invitations where event_id=p_event and id=target and active for update;if not found then raise exception 'invalid target';end if;
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id in(select id from guests where invitation_id=eid) and revoked_at is null;
 update guests set invitation_id=target,version=version+1 where event_id=p_event and invitation_id=eid;
 update invitations set active=false,code_hash=null,primary_guest_id=null,version=version+1 where id=eid;
 update invitations set version=version+1 where id=target;
 delete from invitation_sessions where event_id=p_event and invitation_id in(eid,target);
 when 'FAMILY_SPLIT' then
 if jsonb_array_length(p_payload->'guest_ids')<1 then raise exception 'empty split';end if;
 if exists(select 1 from jsonb_array_elements_text(p_payload->'guest_ids') x where not exists(select 1 from guests g where g.id=x.value::uuid and g.event_id=p_event and g.invitation_id=eid)) then raise exception 'invalid split';end if;
 insert into invitations(event_id,name) values(p_event,trim(p_payload->>'name')) returning id into target;
 update invitations set primary_guest_id=null,version=version+1 where id=eid;
 update guests set invitation_id=target,companion_of=null,version=version+1 where event_id=p_event and id in(select value::uuid from jsonb_array_elements_text(p_payload->'guest_ids'));
 update guests set companion_of=null where event_id=p_event and invitation_id=eid and companion_of in(select id from guests where invitation_id=target);
 update qr_credentials set revoked_at=now() where event_id=p_event and guest_id in(select id from guests where invitation_id=target) and revoked_at is null;
 delete from invitation_sessions where event_id=p_event and invitation_id=eid;
 when 'GIFT_SAVE' then
 if eid is null then
 insert into gifts(event_id,title,description,image_url,external_url,price_label,active,sort_order,reservation_enabled) values(p_event,trim(p_payload->>'title'),coalesce(p_payload->>'description',''),p_payload->>'image_url',p_payload->>'external_url',coalesce(p_payload->>'price_label',''),coalesce((p_payload->>'active')::boolean,true),coalesce((p_payload->>'sort_order')::integer,0),coalesce((p_payload->>'reservation_enabled')::boolean,false));
 else
 select version into v from gifts where event_id=p_event and id=eid for update;if not found then raise exception 'not found';end if;
 if v is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 update gifts set title=trim(p_payload->>'title'),description=p_payload->>'description',image_url=p_payload->>'image_url',external_url=p_payload->>'external_url',price_label=p_payload->>'price_label',active=(p_payload->>'active')::boolean,sort_order=(p_payload->>'sort_order')::integer,reservation_enabled=(p_payload->>'reservation_enabled')::boolean,version=version+1 where id=eid;
 end if;
 when 'GIFT_DELETE' then
 select version into v from gifts where event_id=p_event and id=eid for update;
 if v is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 delete from gifts where id=eid and event_id=p_event;
 when 'RULE_SAVE' then
 select version into v from notification_rules where event_id=p_event and id=eid for update;
 if v is distinct from (p_payload->>'version')::integer then raise exception 'conflict';end if;
 update notification_rules set title=p_payload->>'title',body=p_payload->>'body',active=(p_payload->>'active')::boolean,channels=array(select jsonb_array_elements_text(p_payload->'channels')::delivery_channel),version=version+1 where id=eid;
 when 'EVENT_SAVE' then update events set venue_name=p_payload->>'venue_name',address=p_payload->>'address',latitude=(p_payload->>'latitude')::double precision,longitude=(p_payload->>'longitude')::double precision where id=p_event;
 insert into audit_logs(event_id,actor,action,entity,entity_id) values(p_event,auth.uid(),'LOCATION_UPDATE','events',p_event);
 when 'CHECKIN_REVERT' then delete from checkins where event_id=p_event and id=eid;
 when 'MESSAGE_READ' then update messages set read_at=now() where event_id=p_event and id=eid;
 else raise exception 'unknown admin action';end case;
 return jsonb_build_object('ok',true);
end $$;

-- Workers use service_role only, bounded batches with row locks and retry leases.
create function schedule_notifications() returns void language plpgsql security definer set search_path=public,extensions,pg_temp as $$
begin
 insert into notification_jobs(event_id,rule_id,guest_id,channel,idempotency_key)
 select r.event_id,r.id,g.id,c,r.id||':'||g.id||':'||c from notification_rules r join events e on e.id=r.event_id join guests g on g.event_id=e.id join invitations i on i.id=g.invitation_id cross join lateral unnest(r.channels)c
 where r.active and i.active and now()>=e.starts_at-r.days_before*interval '1 day' and now()<e.starts_at-r.days_before*interval '1 day'+interval '1 day' on conflict do nothing;
end $$;
create function claim_notifications(p_limit integer default 50) returns setof notification_jobs language sql security definer set search_path=public,extensions,pg_temp as $$
 update notification_jobs set status='processing',locked_at=now(),attempts=attempts+1 where id in(select id from notification_jobs where attempts<6 and ((status in ('pending','failed') and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '10 minutes')) order by created_at for update skip locked limit least(p_limit,50)) returning *;
$$;
create function claim_sheet_jobs(p_limit integer default 25) returns setof sheet_sync_jobs language sql security definer set search_path=public,extensions,pg_temp as $$
 update sheet_sync_jobs set status='processing',locked_at=now(),attempts=attempts+1,last_run_at=now() where id in(select id from sheet_sync_jobs where attempts<8 and ((status in ('pending','failed') and next_attempt_at<=now()) or (status='processing' and locked_at<now()-interval '10 minutes')) order by created_at for update skip locked limit least(p_limit,25)) returning *;
$$;
create function finish_sheet_job(p_id uuid,p_version bigint,p_error text) returns void language sql security definer set search_path=public,extensions,pg_temp as $$
 update sheet_sync_jobs set status=case when version<>p_version then 'pending' when p_error is null then 'success' else 'failed' end,last_error=p_error,locked_at=null,next_attempt_at=now()+interval '5 minutes' where id=p_id;
$$;
-- Explicit grants after revoking PostgreSQL's default PUBLIC function privileges.
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on function event_role(uuid),my_invitation(uuid),owns_guest(uuid,uuid),app_snapshot(uuid),issue_ticket(uuid,uuid,boolean),app_mutate(uuid,uuid,text,jsonb),admin_action(uuid,text,jsonb) to authenticated;
grant execute on function redeem_invitation(uuid,uuid,text,text),schedule_notifications(),claim_notifications(integer),claim_sheet_jobs(integer),finish_sheet_job(uuid,bigint,text) to service_role;

grant select,insert,update,delete on all tables in schema public to service_role;
