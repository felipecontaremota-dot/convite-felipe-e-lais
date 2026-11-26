begin;
set local lock_timeout='3s'; set local statement_timeout='30s';
-- Dedicated configuration/immutable attempt context; REUSE the existing queue and receipts.
create table notification_private.ten_day_campaigns(
 id uuid primary key default gen_random_uuid(),event_id uuid not null unique references public.events(id),
 enabled boolean not null default false,version integer not null default 1,
 subject text not null default $content$FALTAM APENAS 10 DIAS PARA O NOSSO CASAMENTO 💙💍$content$,body text not null default $content$Olá, **{{nome}}!** Tudo bem? 🥰

**FALTAM APENAS 10 DIAS!**

A contagem regressiva está chegando ao fim e, em breve, estaremos juntos para celebrar um dos momentos mais especiais das nossas vidas: **O NOSSO CASAMENTO!** 💍

Estamos muito felizes por saber que você estará conosco nesse dia tão importante!

Relembrando os detalhes:

📅 **15 de dezembro de 2026**

⏰ **Às 16h**

📍 **Villarejo — Aparecida de Goiânia/GO**

Não se esqueça de acessar a tela **INFORMAÇÕES** no seu convite digital para conferir todas as informações sobre o casamento, a localização e o seu QR Code de acesso ao evento.

**Acesse seu convite exclusivo:**

{{link}}

🔑 **Sua senha:** {{senha}}

Estamos preparando cada detalhe com muito carinho e contando os dias para compartilhar essa alegria com você!

Nos vemos em breve! 🥂

**Com muito carinho,**

**Felipe & Laís** 💙💍$content$,state text not null default 'waiting' check(state in ('waiting','blocked','processing')),
 reason text,image_available boolean,image_checked_at timestamptz,resume_until timestamptz,
 started_at timestamptz,run_subject text,run_body text,run_version integer,run_due_at timestamptz,
 updated_at timestamptz not null default now(),unique(event_id,id)
);
alter table notification_private.ten_day_campaigns enable row level security;
revoke all on notification_private.ten_day_campaigns from public,anon,authenticated,service_role;
alter table public.notification_jobs add column ten_day_campaign_id uuid;
alter table public.notification_jobs add constraint notification_ten_day_event_fk foreign key(event_id,ten_day_campaign_id) references notification_private.ten_day_campaigns(event_id,id);
create unique index notification_ten_day_guest on public.notification_jobs(ten_day_campaign_id,guest_id) where ten_day_campaign_id is not null;
create table notification_private.ten_day_context(
 job_id uuid primary key references public.notification_jobs(id) on delete cascade,
 name text not null,email text not null,credential_hash text not null,payload_hash text,
 created_at timestamptz not null default now()
);
alter table notification_private.ten_day_context enable row level security;
revoke all on notification_private.ten_day_context from public,anon,authenticated,service_role;
-- No PIN, sharing code, token or rendered e-mail is copied into persistent context/logs.
insert into notification_private.ten_day_campaigns(event_id) select id from public.events;
create function notification_private.ten_day_valid(p_subject text,p_body text) returns boolean language sql immutable set search_path=pg_catalog as $$
 select coalesce(length(trim(p_subject)) between 1 and 200 and p_subject !~ E'[\r\n{}]' and length(trim(p_body)) between 1 and 8000
 and position('{{nome}}' in p_body)>0 and position('{{link}}' in p_body)>0 and position('{{senha}}' in p_body)>0
 and regexp_replace(p_body,'\{\{(nome|link|senha)\}\}','','g') !~ '[{}]',false)
$$;
revoke all on function notification_private.ten_day_valid(text,text) from public,anon,authenticated,service_role;
create function public.ten_day_email_admin(p_event uuid,p_action text default 'READ',p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c notification_private.ten_day_campaigns; due timestamptz; changed boolean:=false; result jsonb;
begin
 if auth.uid() is null or public.event_role(p_event) is distinct from 'ADMIN' then raise exception 'unauthorized';end if;
 insert into notification_private.ten_day_campaigns(event_id) values(p_event) on conflict(event_id) do nothing;
 select starts_at-interval '240 hours' into due from public.events where id=p_event;
 select * into c from notification_private.ten_day_campaigns where event_id=p_event for update;
 if not found then raise exception 'reminder configuration missing';end if;
 if p_action<>'READ' and (p_payload->>'version')::integer is distinct from c.version then raise exception 'reminder changed; refresh';end if;
 if p_action='SAVE' then
  if not notification_private.ten_day_valid(p_payload->>'subject',p_payload->>'body') then raise exception 'invalid reminder placeholders';end if;
  if c.started_at is not null and (c.subject is distinct from p_payload->>'subject' or c.body is distinct from p_payload->>'body') then raise exception 'sent version is immutable';end if;
  if (p_payload->>'enabled')::boolean is null then raise exception 'invalid enabled';end if;
  if (p_payload->>'enabled')::boolean and c.started_at is null and clock_timestamp()>due+interval '1 hour' then raise exception 'late activation requires explicit resume';end if;
  update notification_private.ten_day_campaigns set subject=p_payload->>'subject',body=p_payload->>'body',enabled=(p_payload->>'enabled')::boolean,version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
  if c.enabled then update public.notification_jobs set attempts=0,next_attempt_at=clock_timestamp() where ten_day_campaign_id=c.id and status='pending' and delivery_started_at is null;end if;
  changed=true;
 elsif p_action='RESUME' then
  if clock_timestamp()<due or clock_timestamp()>=(select starts_at from public.events where id=p_event) then raise exception 'resume outside event window';end if;
  if not coalesce(c.image_available,false) or c.image_checked_at<clock_timestamp()-interval '10 minutes' then raise exception 'validate artwork first';end if;
  update notification_private.ten_day_campaigns set enabled=true,state=case when started_at is null then 'waiting' else 'processing' end,reason=null,resume_until=clock_timestamp()+interval '1 hour',version=version+1,updated_at=clock_timestamp() where id=c.id returning * into c;
  -- Unadmitted image/configuration waits can resume; sent/uncertain work never does.
  update public.notification_jobs set status='pending',attempts=0,locked_at=null,next_attempt_at=clock_timestamp(),last_error=null where ten_day_campaign_id=c.id and status in ('pending','failed') and delivery_started_at is null;
  changed=true;
 elsif p_action='RETRY' then
  if not c.enabled or c.started_at is null or clock_timestamp()>=(select starts_at from public.events where id=p_event) then raise exception 'campaign unavailable';end if;
  update public.notification_jobs set status='pending',attempts=0,next_attempt_at=clock_timestamp(),last_error=null where ten_day_campaign_id=c.id and status='failed' and delivery_started_at is null;
  changed=true;
 elsif p_action<>'READ' then raise exception 'invalid reminder action';end if;
 if changed then insert into public.audit_logs(event_id,actor,entity,entity_id,action,metadata) values(p_event,auth.uid(),'ten_day_campaign',c.id,'REMINDER_'||p_action,jsonb_build_object('version',c.version,'enabled',c.enabled));end if;
 select jsonb_build_object('id',c.id,'version',c.version,'enabled',c.enabled,'subject',c.subject,'body',c.body,'state',c.state,'reason',c.reason,'started_at',c.started_at,'scheduled_at',due,'image_available',c.image_available,'image_checked_at',c.image_checked_at,
 'estimated',(select count(*) from public.guests g join public.rsvps r on r.event_id=g.event_id and r.guest_id=g.id join public.invitations i on i.event_id=g.event_id and i.id=g.invitation_id join public.guest_contacts ct on ct.event_id=g.event_id and ct.guest_id=g.id join public.invitation_access ia on ia.event_id=g.event_id and ia.invitation_id=g.invitation_id where ia.pin is not null and ia.sharing_code is not null and i.code_hash=encode(extensions.digest(ia.sharing_code,'sha256'),'hex') and g.event_id=p_event and r.status='CONFIRMED' and i.active and i.archived_at is null and coalesce(ct.communications_revoked,false)=false and trim(ct.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 'results',(select coalesce(jsonb_agg(x),'[]') from (select j.id,j.guest_id,g.name,j.status,j.attempts,j.last_error,(select d.provider_id from public.delivery_attempts d where d.job_id=j.id and d.provider_id is not null order by d.created_at desc limit 1) as provider_id from public.notification_jobs j left join public.guests g on g.id=j.guest_id and g.event_id=j.event_id where j.ten_day_campaign_id=c.id order by j.created_at,j.id) x),
 'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.notification_jobs where ten_day_campaign_id=c.id group by status) s)) into result;
 return result;
end $$;
revoke all on function public.ten_day_email_admin(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.ten_day_email_admin(uuid,text,jsonb) to authenticated;

-- Service-only worker API; sender authentication remains in the existing Edge Function.
create function public.ten_day_email_work(p_action text,p_event uuid default null,p_job uuid default null,p_attempt integer default null,p_lease timestamptz default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c notification_private.ten_day_campaigns; j public.notification_jobs; ctx notification_private.ten_day_context; g public.guests; contact public.guest_contacts; access public.invitation_access; due timestamptz; available boolean; reason text; adm timestamptz;
begin
 if p_action='DUE' then
  update notification_private.ten_day_campaigns due_campaign set state='blocked',reason='Horário ultrapassado; retomada administrativa necessária' from public.events e where e.id=due_campaign.event_id and due_campaign.enabled and due_campaign.started_at is null and due_campaign.state='waiting' and clock_timestamp()>e.starts_at-interval '240 hours'+interval '1 hour' and (due_campaign.resume_until is null or clock_timestamp()>due_campaign.resume_until);
  return (select coalesce(jsonb_agg(jsonb_build_object('event_id',due_campaign.event_id)),'[]') from notification_private.ten_day_campaigns due_campaign join public.events e on e.id=due_campaign.event_id where due_campaign.enabled and due_campaign.started_at is null and due_campaign.state='waiting' and clock_timestamp()>=e.starts_at-interval '240 hours' and clock_timestamp()<e.starts_at and (clock_timestamp()<=e.starts_at-interval '240 hours'+interval '1 hour' or clock_timestamp()<=due_campaign.resume_until));
 end if;
 if p_action='TEST_RESERVE' then
  if not exists(select 1 from public.user_roles where event_id=p_event and user_id=(p_payload->>'actor')::uuid and role='ADMIN') then raise exception 'unauthorized';end if;
  -- Persistent test idempotence is separate from guest jobs, never consumes a recipient.
  perform pg_advisory_xact_lock(hashtextextended('reminder-test:'||p_event,0));
  if exists(select 1 from public.audit_logs where event_id=p_event and entity='ten_day_test' and entity_id=(p_payload->>'request')::uuid) then return jsonb_build_object('reserved',false);end if;
  if (select count(*) from public.audit_logs where event_id=p_event and entity='ten_day_test' and created_at>clock_timestamp()-interval '1 hour')>=5 then raise exception 'test rate limit';end if;
  insert into public.audit_logs(event_id,actor,entity,entity_id,action) values(p_event,(p_payload->>'actor')::uuid,'ten_day_test',(p_payload->>'request')::uuid,'REMINDER_TEST_RESERVED');
  return jsonb_build_object('reserved',true);
 end if;
 if p_job is not null then select * into j from public.notification_jobs where id=p_job; p_event=j.event_id;end if;
 select * into c from notification_private.ten_day_campaigns where event_id=p_event for update;
 if not found then raise exception 'invalid campaign';end if;
 select starts_at-interval '240 hours' into due from public.events where id=p_event;
 if p_action='IMAGE' then
  update notification_private.ten_day_campaigns set image_available=(p_payload->>'available')::boolean,image_checked_at=clock_timestamp() where id=c.id;
  return jsonb_build_object('ok',true);
 elsif p_action='BLOCK' then
  update notification_private.ten_day_campaigns set state='blocked',reason='Arte indisponível; valide a imagem e retome administrativamente' where id=c.id;
  return jsonb_build_object('ok',true);
 elsif p_action='PREPARE' then
  if not c.enabled or c.started_at is not null or c.state<>'waiting' or clock_timestamp()<due or clock_timestamp()>=(select starts_at from public.events where id=p_event) or (clock_timestamp()>due+interval '1 hour' and not coalesce(clock_timestamp()<=c.resume_until,false)) or not coalesce(c.image_available,false) or c.image_checked_at<clock_timestamp()-interval '10 minutes' then return jsonb_build_object('prepared',false);end if;
  update notification_private.ten_day_campaigns set started_at=clock_timestamp(),run_due_at=due,run_subject=subject,run_body=body,run_version=version,state='processing',reason=null where id=c.id;
  insert into public.notification_jobs(event_id,guest_id,channel,idempotency_key,ten_day_campaign_id,status,last_error)
  select recipient.event_id,recipient.id,'EMAIL','ten-day:'||c.id||':'||recipient.id,c.id,
  case when r.status is distinct from 'CONFIRMED' or coalesce(ct.communications_revoked,false) or not i.active or i.archived_at is not null or ct.email is null or trim(ct.email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or a.pin is null or a.sharing_code is null or i.code_hash is distinct from encode(extensions.digest(a.sharing_code,'sha256'),'hex') then 'skipped' else 'pending' end,
  case when r.status is distinct from 'CONFIRMED' then 'Não elegível: presença não confirmada' when coalesce(ct.communications_revoked,false) then 'Comunicações revogadas' when ct.email is null or trim(ct.email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then 'E-mail ausente ou inválido' when not i.active or i.archived_at is not null or a.pin is null or a.sharing_code is null or i.code_hash is distinct from encode(extensions.digest(a.sharing_code,'sha256'),'hex') then 'Dados do convite indisponíveis' end
  from public.guests recipient left join public.rsvps r on r.event_id=recipient.event_id and r.guest_id=recipient.id left join public.guest_contacts ct on ct.event_id=recipient.event_id and ct.guest_id=recipient.id join public.invitations i on i.event_id=recipient.event_id and i.id=recipient.invitation_id left join public.invitation_access a on a.event_id=recipient.event_id and a.invitation_id=i.id where recipient.event_id=p_event on conflict do nothing;
  insert into public.audit_logs(event_id,entity,entity_id,action,metadata) values(p_event,'ten_day_campaign',c.id,'REMINDER_STARTED',jsonb_build_object('version',c.version,'scheduled_at',due));
  return jsonb_build_object('prepared',true);
 end if;
 if p_action not in ('PEEK','START','NOTE') or j.id is null or j.ten_day_campaign_id is distinct from c.id then raise exception 'invalid reminder job';end if;
 -- Campaign -> guest -> RSVP/contact/unit -> job: consistent lock order for concurrent workers.
 select * into g from public.guests where id=j.guest_id and event_id=p_event for update;
 perform 1 from public.rsvps where guest_id=g.id and event_id=p_event for update;
 select * into contact from public.guest_contacts where guest_id=g.id and event_id=p_event for update;
 select * into access from public.invitation_access where invitation_id=g.invitation_id and event_id=p_event for share;
 select * into j from public.notification_jobs where id=p_job for update;
 if j.status<>'processing' or j.attempts is distinct from p_attempt or j.locked_at is distinct from p_lease or p_lease is null or p_lease<clock_timestamp()-interval '10 minutes' or j.delivery_started_at is not null then return jsonb_build_object('ready',false);end if;
 if clock_timestamp()>=(select starts_at from public.events where id=p_event) or (clock_timestamp()>c.run_due_at+interval '1 hour' and not coalesce(clock_timestamp()<=c.resume_until,false)) then
  update notification_private.ten_day_campaigns set state='blocked',reason='Janela de envio ultrapassada; retomada administrativa necessária' where id=c.id;
  c.state='blocked';
 end if;
 if not c.enabled or c.state='blocked' then
  update public.notification_jobs set status='pending',locked_at=null,next_attempt_at=clock_timestamp()+interval '5 minutes' where id=j.id;
  return jsonb_build_object('ready',false);
 end if;
 available=exists(select 1 from public.rsvps where guest_id=g.id and event_id=p_event and status='CONFIRMED') and exists(select 1 from public.invitations where event_id=p_event and id=g.invitation_id and active and archived_at is null and code_hash=encode(extensions.digest(access.sharing_code,'sha256'),'hex')) and not coalesce(contact.communications_revoked,false) and trim(contact.email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and access.pin is not null and access.sharing_code is not null and length(trim(g.name))>0;
 if available is not true then
  update public.notification_jobs set status='skipped',locked_at=null,last_error='Não elegível ou dados ausentes na admissão' where id=j.id;
  return jsonb_build_object('ready',false);
 end if;
 select * into ctx from notification_private.ten_day_context where job_id=j.id;
 if found and (ctx.email is distinct from lower(trim(contact.email)) or ctx.name is distinct from g.name or ctx.credential_hash is distinct from encode(extensions.digest(access.sharing_code||':'||access.pin,'sha256'),'hex')) then
  update public.notification_jobs set status='skipped',locked_at=null,last_error='Personalização alterada; envio anterior não será repetido' where id=j.id;
  return jsonb_build_object('ready',false);
 end if;
 if p_action='PEEK' then
  insert into notification_private.ten_day_context(job_id,name,email,credential_hash) values(j.id,g.name,lower(trim(contact.email)),encode(extensions.digest(access.sharing_code||':'||access.pin,'sha256'),'hex')) on conflict do nothing;
  return jsonb_build_object('ready',true,'name',g.name,'email',lower(trim(contact.email)),'code',access.sharing_code,'pin',access.pin,'subject',c.run_subject,'body',c.run_body);
 elsif p_action='START' then
  if ctx.job_id is null or p_payload->>'hash' is null or p_payload->>'hash' !~ '^[a-f0-9]{64}$' then raise exception 'invalid payload hash';end if;
  if ctx.payload_hash is not null and ctx.payload_hash is distinct from p_payload->>'hash' then
   update public.notification_jobs set status='skipped',locked_at=null,last_error='Conteúdo alterado; chave de idempotência preservada' where id=j.id;
   return jsonb_build_object('ready',false);
  end if;
  update notification_private.ten_day_context set payload_hash=p_payload->>'hash' where job_id=j.id;
  update public.notification_jobs set delivery_started_at=clock_timestamp() where id=j.id returning delivery_started_at into adm;
  return jsonb_build_object('ready',true,'admission',adm);
 end if;
 return jsonb_build_object('ready',false);
end $$;
revoke all on function public.ten_day_email_work(text,uuid,uuid,integer,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.ten_day_email_work(text,uuid,uuid,integer,timestamptz,jsonb) to service_role;
create function public.ten_day_email_config(p_event uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.user_roles where event_id=p_event and user_id=p_actor and role='ADMIN') then raise exception 'unauthorized';end if;
 return (select jsonb_build_object('subject',subject,'body',body) from notification_private.ten_day_campaigns where event_id=p_event);
end $$;
revoke all on function public.ten_day_email_config(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ten_day_email_config(uuid,uuid) to service_role;
-- Keep paused campaign jobs out of existing claims; all unrelated predicates remain intact.
do $claims$ declare original text; marker text:='and j.delivery_started_at is null and j.attempts<6';begin
 select pg_get_functiondef('notification_private.claim_visible(uuid,uuid,integer)'::regprocedure) into original;
 if length(original)-length(replace(original,marker,''))<>length(marker) then raise exception 'unexpected claim definition';end if;
 execute replace(original,marker,marker||' and (j.ten_day_campaign_id is null or exists(select 1 from notification_private.ten_day_campaigns campaign where campaign.id=j.ten_day_campaign_id and campaign.enabled and campaign.state=''processing''))');
end $claims$;
-- Extend the EXISTING Vault-backed wake-up predicate; keep Cron frequency/configuration unchanged.
do $install$ declare original text; marker text:='if not exists(select 1 from public.notification_jobs'; replacement text;begin
 if to_regprocedure('notification_private.invoke_worker()') is not null then
  select pg_get_functiondef('notification_private.invoke_worker()'::regprocedure) into original;
  if length(original)-length(replace(original,marker,''))<>length(marker) then raise exception 'unexpected scheduler definition';end if;
  replacement:='if not exists(select 1 from notification_private.ten_day_campaigns c join public.events e on e.id=c.event_id where c.enabled and c.started_at is null and c.state=''waiting'' and e.starts_at-interval ''240 hours''<=clock_timestamp()) and not exists(select 1 from public.notification_jobs';
  execute replace(original,marker,replacement);
 end if;
end $install$;
commit;
